from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsModel(BaseModel):
    download_dir: str


@router.get("")
def get_settings(request: Request) -> SettingsModel:
    return SettingsModel(download_dir=str(request.app.state.settings.download_dir))


@router.put("")
def update_settings(spec: SettingsModel, request: Request) -> SettingsModel:
    try:
        request.app.state.settings.set_download_dir(spec.download_dir)
    except OSError as e:
        raise HTTPException(400, f"Cannot use that folder: {e}")
    return get_settings(request)
