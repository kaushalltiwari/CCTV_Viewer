from __future__ import annotations

from datetime import date, datetime, time, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..adapters.base import Segment
from ..services.device_store import DeviceStore
from .deps import store

router = APIRouter(prefix="/api/devices/{device_id}/recordings", tags=["recordings"])


@router.get("/days")
async def recorded_days(device_id: str, channel: int, year: int, month: int,
                        s: DeviceStore = Depends(store)) -> list[int]:
    """Days of the month that have at least one recording (calendar highlights)."""
    try:
        return await s.adapter(device_id).query_days(channel, year, month)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"NVR unreachable: {e}")
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.get("")
async def segments(device_id: str, channel: int, day: date,
                   s: DeviceStore = Depends(store)) -> list[Segment]:
    """All recorded segments for a channel on a given day (timeline data)."""
    start = datetime.combine(day, time.min)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    try:
        return await s.adapter(device_id).query_segments(channel, start, end)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"NVR unreachable: {e}")
    except RuntimeError as e:
        raise HTTPException(502, str(e))
