from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..adapters.base import Channel, DeviceInfo
from ..services.device_store import Device, DeviceCreate, DeviceStore
from .deps import store

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("")
def list_devices(s: DeviceStore = Depends(store)) -> list[Device]:
    return s.list()


@router.post("")
def add_device(spec: DeviceCreate, s: DeviceStore = Depends(store)) -> Device:
    return s.add(spec)


@router.put("/{device_id}")
def update_device(device_id: str, spec: DeviceCreate,
                  s: DeviceStore = Depends(store)) -> Device:
    try:
        return s.update(device_id, spec)
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.delete("/{device_id}")
def remove_device(device_id: str, s: DeviceStore = Depends(store)) -> dict:
    try:
        s.remove(device_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@router.get("/{device_id}/info")
async def device_info(device_id: str, s: DeviceStore = Depends(store)) -> DeviceInfo:
    try:
        return await s.adapter(device_id).device_info()
    except KeyError as e:
        raise HTTPException(404, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"NVR unreachable: {e}")
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@router.get("/{device_id}/channels")
async def channels(device_id: str, s: DeviceStore = Depends(store)) -> list[Channel]:
    try:
        return await s.adapter(device_id).channels()
    except KeyError as e:
        raise HTTPException(404, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"NVR unreachable: {e}")
    except RuntimeError as e:
        raise HTTPException(502, str(e))
