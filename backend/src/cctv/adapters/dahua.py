"""Adapter for Dahua-based NVRs (most CP Plus CP-UNR/CP-UVR models).

Uses the HTTP CGI API with Digest auth for metadata/search and standard
Dahua RTSP URLs for live view and playback.
"""
from __future__ import annotations

import logging
from datetime import datetime
from urllib.parse import quote

import httpx

from .base import Channel, DeviceInfo, NVRAdapter, Segment

log = logging.getLogger(__name__)

# Dahua reports these event types in mediaFileFind results
_KIND_MAP = {"": "regular", "R": "regular", "M": "motion", "A": "alarm"}


def _parse_kv(text: str) -> dict[str, str]:
    """Parse Dahua's `a.b[0].c=value` line format into a flat dict."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if "=" in line:
            key, _, value = line.partition("=")
            out[key.strip()] = value.strip()
    return out


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


class DahuaError(RuntimeError):
    pass


class DahuaAdapter(NVRAdapter):
    def __init__(self, host: str, http_port: int, rtsp_port: int,
                 username: str, password: str) -> None:
        super().__init__(host, http_port, rtsp_port, username, password)
        self._client = httpx.AsyncClient(
            base_url=f"http://{host}:{http_port}",
            auth=httpx.DigestAuth(username, password),
            timeout=15.0,
        )

    async def _get(self, path: str, params: dict | None = None) -> str:
        # Build the query string by hand: httpx encodes spaces as '+', which
        # this firmware fails to parse in time conditions (%20 works).
        if params:
            query = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
            path = f"{path}?{query}"
        resp = await self._client.get(path)
        if resp.status_code == 401:
            raise DahuaError("Authentication failed (check username/password)")
        resp.raise_for_status()
        return resp.text

    async def device_info(self) -> DeviceInfo:
        info = DeviceInfo()
        info.device_type = (await self._get(
            "/cgi-bin/magicBox.cgi", {"action": "getDeviceType"}
        )).partition("=")[2].strip()
        try:
            info.serial = (await self._get(
                "/cgi-bin/magicBox.cgi", {"action": "getSerialNo"}
            )).partition("=")[2].strip()
            version = _parse_kv(await self._get(
                "/cgi-bin/magicBox.cgi", {"action": "getSoftwareVersion"}
            ))
            info.software_version = version.get("version", "")
        except (httpx.HTTPError, DahuaError):
            log.warning("Could not read serial/version (non-fatal)", exc_info=True)
        info.channel_count = len(await self.channels())
        return info

    async def channels(self) -> list[Channel]:
        text = await self._get(
            "/cgi-bin/configManager.cgi",
            {"action": "getConfig", "name": "ChannelTitle"},
        )
        kv = _parse_kv(text)
        chans = []
        i = 0
        while f"table.ChannelTitle[{i}].Name" in kv:
            chans.append(Channel(index=i + 1, name=kv[f"table.ChannelTitle[{i}].Name"]))
            i += 1
        if not chans:
            raise DahuaError(f"No channels found; unexpected response: {text[:200]}")
        return chans

    def live_url(self, channel: int, substream: bool = False) -> str:
        subtype = 1 if substream else 0
        return (
            f"rtsp://{quote(self.username)}:{quote(self.password)}@"
            f"{self.host}:{self.rtsp_port}"
            f"/cam/realmonitor?channel={channel}&subtype={subtype}"
        )

    def playback_url(self, channel: int, start: datetime, end: datetime) -> str:
        s = start.strftime("%Y_%m_%d_%H_%M_%S")
        e = end.strftime("%Y_%m_%d_%H_%M_%S")
        return (
            f"rtsp://{quote(self.username)}:{quote(self.password)}@"
            f"{self.host}:{self.rtsp_port}"
            f"/cam/playback?channel={channel}&starttime={s}&endtime={e}"
        )

    async def query_segments(self, channel: int, start: datetime,
                             end: datetime) -> list[Segment]:
        """All recorded segments in [start, end].

        A single finder query returns only a limited window of results on many
        firmwares (regardless of pagination), so re-issue the search from the
        end of the last returned file until the range is covered.
        """
        segments: list[Segment] = []
        seen: set[tuple] = set()
        cursor = start
        for _ in range(500):
            chunk = await self._find_files(channel, cursor, end)
            new = [s for s in chunk if (s.channel, s.start, s.end) not in seen]
            seen.update((s.channel, s.start, s.end) for s in new)
            segments.extend(new)
            if not new:
                break
            last_end = max(s.end for s in chunk)
            if last_end <= cursor or last_end >= end:
                break
            cursor = last_end
        segments.sort(key=lambda s: s.start)
        return segments

    async def _find_files(self, channel: int, start: datetime,
                          end: datetime) -> list[Segment]:
        """One mediaFileFind lifecycle: factory.create -> findFile -> findNextFile* -> close."""
        text = await self._get("/cgi-bin/mediaFileFind.cgi", {"action": "factory.create"})
        finder = text.partition("=")[2].strip()
        if not finder:
            raise DahuaError(f"mediaFileFind factory.create failed: {text[:200]}")

        segments: list[Segment] = []
        try:
            resp = await self._get("/cgi-bin/mediaFileFind.cgi", {
                "action": "findFile",
                "object": finder,
                "condition.Channel": str(channel),
                "condition.StartTime": _fmt_time(start),
                "condition.EndTime": _fmt_time(end),
            })
            if "ok" not in resp.lower():
                return []  # no recordings in range

            # Firmwares return at most N items per findNextFile call (often 64,
            # regardless of the requested count), so keep polling until empty.
            for _ in range(200):  # hard cap: 200 batches ≈ 12800+ files/day
                batch = _parse_kv(await self._get("/cgi-bin/mediaFileFind.cgi", {
                    "action": "findNextFile", "object": finder, "count": "100",
                }))
                found = int(batch.get("found", "0") or 0)
                if found <= 0:
                    break
                for i in range(found):
                    p = f"items[{i}]"
                    try:
                        # items[].Channel is 0-based while query conditions are
                        # 1-based; use the requested channel to stay consistent
                        segments.append(Segment(
                            channel=channel,
                            start=datetime.strptime(batch[f"{p}.StartTime"], "%Y-%m-%d %H:%M:%S"),
                            end=datetime.strptime(batch[f"{p}.EndTime"], "%Y-%m-%d %H:%M:%S"),
                            kind=_KIND_MAP.get(batch.get(f"{p}.Flags[0]", ""), "regular"),
                            size_bytes=int(batch[f"{p}.Length"]) if f"{p}.Length" in batch else None,
                            file_path=batch.get(f"{p}.FilePath"),
                        ))
                    except (KeyError, ValueError):
                        log.warning("Skipping unparsable segment %s: %r", i, batch.get(f"{p}.StartTime"))
        finally:
            for action in ("close", "destroy"):
                try:
                    await self._get("/cgi-bin/mediaFileFind.cgi",
                                    {"action": action, "object": finder})
                except (httpx.HTTPError, DahuaError):
                    pass

        segments.sort(key=lambda s: s.start)
        return segments

    async def close(self) -> None:
        await self._client.aclose()
