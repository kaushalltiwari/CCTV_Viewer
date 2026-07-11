from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..services.device_store import DeviceStore
from ..services.go2rtc import Go2RTCService
from .deps import go2rtc, store

router = APIRouter(prefix="/api/devices/{device_id}", tags=["streams"])


class StreamHandle(BaseModel):
    name: str
    player_url: str   # go2rtc's embedded player page (iframe-able)


@router.post("/live")
async def open_live(device_id: str, channel: int, substream: bool = False,
                    s: DeviceStore = Depends(store),
                    g: Go2RTCService = Depends(go2rtc)) -> StreamHandle:
    if not g.available:
        raise HTTPException(503, "go2rtc not installed - see README to enable video")
    try:
        adapter = s.adapter(device_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
    name = f"live_{device_id}_{channel}_{1 if substream else 0}"
    await g.add_stream(name, adapter.live_url(channel, substream))
    return StreamHandle(name=name, player_url=g.player_url(name))


@router.post("/playback")
async def open_playback(device_id: str, channel: int, start: datetime, end: datetime,
                        s: DeviceStore = Depends(store),
                        g: Go2RTCService = Depends(go2rtc)) -> StreamHandle:
    if not g.available:
        raise HTTPException(503, "go2rtc not installed - see README to enable video")
    try:
        adapter = s.adapter(device_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
    name = f"pb_{device_id}_{channel}"
    await g.add_stream(name, adapter.playback_url(channel, start, end))
    return StreamHandle(name=name, player_url=g.player_url(name))
