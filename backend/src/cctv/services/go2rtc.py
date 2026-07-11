"""Manage the bundled go2rtc process and register streams with its REST API.

go2rtc ingests the NVR's RTSP and re-serves it to the browser as WebRTC/MSE.
Video never flows through the Python process.
"""
from __future__ import annotations

import asyncio
import logging

import httpx
import yaml

from ..paths import config_dir, find_binary

log = logging.getLogger(__name__)

GO2RTC_API = "http://127.0.0.1:1984"


class Go2RTCService:
    def __init__(self) -> None:
        self._proc: asyncio.subprocess.Process | None = None
        self._client = httpx.AsyncClient(base_url=GO2RTC_API, timeout=10.0)
        self.binary = find_binary("go2rtc")

    @property
    def available(self) -> bool:
        return self.binary is not None

    async def start(self) -> None:
        if not self.available:
            log.warning(
                "go2rtc binary not found (vendor/ or PATH) - live view disabled. "
                "Download from https://github.com/AlexxIT/go2rtc/releases"
            )
            return
        cfg_path = config_dir() / "go2rtc.yaml"
        cfg_path.write_text(yaml.safe_dump({
            "api": {"listen": "127.0.0.1:1984"},
            "webrtc": {"listen": ":8555"},
            "rtsp": {"listen": ""},        # don't re-expose RTSP
            "log": {"level": "info"},
        }), encoding="utf-8")
        self._proc = await asyncio.create_subprocess_exec(
            self.binary, "-config", str(cfg_path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        # wait for the API to come up
        for _ in range(20):
            try:
                await self._client.get("/api")
                log.info("go2rtc started (pid %s)", self._proc.pid)
                return
            except httpx.HTTPError:
                await asyncio.sleep(0.25)
        log.error("go2rtc did not become ready within 5s")

    async def add_stream(self, name: str, rtsp_src: str) -> None:
        """Register (or replace) a named stream pointing at an RTSP source."""
        if not self.available:
            raise RuntimeError("go2rtc is not available - install it to enable video")
        resp = await self._client.put("/api/streams", params={"name": name, "src": rtsp_src})
        resp.raise_for_status()

    async def remove_stream(self, name: str) -> None:
        if not self.available:
            return
        try:
            await self._client.delete("/api/streams", params={"src": name})
        except httpx.HTTPError:
            pass

    def player_url(self, name: str) -> str:
        """go2rtc's built-in player page for a stream (embedded via iframe for now)."""
        return f"{GO2RTC_API}/stream.html?src={name}&mode=webrtc,mse"

    async def stop(self) -> None:
        await self._client.aclose()
        if self._proc and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                self._proc.kill()
