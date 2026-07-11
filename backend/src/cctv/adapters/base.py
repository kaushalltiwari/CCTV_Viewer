"""NVR adapter interface and shared models.

The UI/API layer only ever talks to this interface, so supporting a different
NVR family (Dahua, ONVIF, DVRIP/Xiongmai) is just another implementation.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from pydantic import BaseModel


class Channel(BaseModel):
    index: int          # 1-based channel number as the NVR counts them
    name: str


class Segment(BaseModel):
    channel: int
    start: datetime
    end: datetime
    kind: str = "regular"   # "regular" | "motion" | "alarm" | ...
    size_bytes: int | None = None
    file_path: str | None = None  # NVR-internal path, used by direct-file download


class DeviceInfo(BaseModel):
    device_type: str = ""
    serial: str = ""
    software_version: str = ""
    channel_count: int = 0


class NVRAdapter(ABC):
    def __init__(self, host: str, http_port: int, rtsp_port: int,
                 username: str, password: str) -> None:
        self.host = host
        self.http_port = http_port
        self.rtsp_port = rtsp_port
        self.username = username
        self.password = password

    @abstractmethod
    async def device_info(self) -> DeviceInfo: ...

    @abstractmethod
    async def channels(self) -> list[Channel]: ...

    @abstractmethod
    def live_url(self, channel: int, substream: bool = False) -> str:
        """RTSP URL for live view (fed to go2rtc, never to the browser)."""

    @abstractmethod
    def playback_url(self, channel: int, start: datetime, end: datetime) -> str:
        """RTSP URL replaying the given time range."""

    @abstractmethod
    async def query_segments(self, channel: int, start: datetime,
                             end: datetime) -> list[Segment]:
        """Recorded segments for a channel within [start, end]."""

    async def query_days(self, channel: int, year: int, month: int) -> list[int]:
        """Days of the month that have any recording. Default: derive from segments."""
        from calendar import monthrange
        start = datetime(year, month, 1)
        end = datetime(year, month, monthrange(year, month)[1], 23, 59, 59)
        segs = await self.query_segments(channel, start, end)
        return sorted({s.start.day for s in segs})

    async def close(self) -> None:  # noqa: B027 - optional cleanup hook
        pass
