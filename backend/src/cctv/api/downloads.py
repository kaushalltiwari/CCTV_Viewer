from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..services.device_store import DeviceStore
from ..services.download_manager import DownloadJob, DownloadManager
from .deps import downloads, store

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/downloads", tags=["downloads"])


class DownloadRequest(BaseModel):
    device_id: str
    channel: int
    start: datetime
    end: datetime


@router.get("")
def list_jobs(dm: DownloadManager = Depends(downloads)) -> list[DownloadJob]:
    return sorted(dm.jobs.values(), key=lambda j: j.id, reverse=True)


@router.post("")
def enqueue(req: DownloadRequest, dm: DownloadManager = Depends(downloads),
            s: DeviceStore = Depends(store)) -> DownloadJob:
    if req.end <= req.start:
        raise HTTPException(400, "end must be after start")
    try:
        device = s.get(req.device_id)
        adapter = s.adapter(req.device_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
    url = adapter.playback_url(req.channel, req.start, req.end)
    try:
        return dm.enqueue(req.device_id, device.name, req.channel,
                          req.start, req.end, url)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/{job_id}/cancel")
def cancel(job_id: str, dm: DownloadManager = Depends(downloads)) -> DownloadJob:
    try:
        return dm.cancel(job_id)
    except KeyError:
        raise HTTPException(404, f"Unknown job: {job_id}")


@router.websocket("/ws")
async def progress_ws(ws: WebSocket) -> None:
    """Pushes every DownloadJob state change as JSON."""
    dm: DownloadManager = ws.app.state.downloads
    await ws.accept()
    queue: asyncio.Queue[DownloadJob] = asyncio.Queue()
    dm.on_update(queue.put_nowait)
    try:
        while True:
            job = await queue.get()
            await ws.send_text(job.model_dump_json())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        dm.off_update(queue.put_nowait)
