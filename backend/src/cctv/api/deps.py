"""Shared app-state accessors for route modules (populated in main.py lifespan)."""
from __future__ import annotations

from fastapi import Request

from ..services.device_store import DeviceStore
from ..services.download_manager import DownloadManager
from ..services.go2rtc import Go2RTCService


def store(request: Request) -> DeviceStore:
    return request.app.state.store


def go2rtc(request: Request) -> Go2RTCService:
    return request.app.state.go2rtc


def downloads(request: Request) -> DownloadManager:
    return request.app.state.downloads
