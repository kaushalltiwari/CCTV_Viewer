"""Saved NVR devices: JSON config in %APPDATA%\\cctv, passwords in the OS keyring."""
from __future__ import annotations

import json
import logging
import uuid

import keyring
from pydantic import BaseModel

from ..adapters import create_adapter
from ..adapters.base import NVRAdapter
from ..paths import config_dir

log = logging.getLogger(__name__)
KEYRING_SERVICE = "cctv-nvr"


class Device(BaseModel):
    id: str
    name: str
    host: str
    http_port: int = 80
    rtsp_port: int = 554
    username: str
    family: str = "dahua"


class DeviceCreate(BaseModel):
    name: str
    host: str
    http_port: int = 80
    rtsp_port: int = 554
    username: str
    password: str
    family: str = "dahua"


class DeviceStore:
    def __init__(self) -> None:
        self._path = config_dir() / "devices.json"
        self._devices: dict[str, Device] = {}
        self._adapters: dict[str, NVRAdapter] = {}
        self._load()

    def _load(self) -> None:
        if self._path.exists():
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            self._devices = {d["id"]: Device(**d) for d in raw}

    def _save(self) -> None:
        data = [d.model_dump() for d in self._devices.values()]
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def list(self) -> list[Device]:
        return list(self._devices.values())

    def get(self, device_id: str) -> Device:
        try:
            return self._devices[device_id]
        except KeyError:
            raise KeyError(f"Unknown device: {device_id}")

    def add(self, spec: DeviceCreate) -> Device:
        device = Device(id=uuid.uuid4().hex[:12], **spec.model_dump(exclude={"password"}))
        keyring.set_password(KEYRING_SERVICE, device.id, spec.password)
        self._devices[device.id] = device
        self._save()
        return device

    def update(self, device_id: str, spec: DeviceCreate) -> Device:
        old = self.get(device_id)
        device = Device(id=old.id, **spec.model_dump(exclude={"password"}))
        if spec.password:
            keyring.set_password(KEYRING_SERVICE, device.id, spec.password)
        self._devices[device.id] = device
        self._save()
        self._drop_adapter(device_id)
        return device

    def remove(self, device_id: str) -> None:
        self.get(device_id)
        del self._devices[device_id]
        self._save()
        try:
            keyring.delete_password(KEYRING_SERVICE, device_id)
        except keyring.errors.PasswordDeleteError:
            pass
        self._drop_adapter(device_id)

    def password(self, device_id: str) -> str:
        pw = keyring.get_password(KEYRING_SERVICE, device_id)
        if pw is None:
            raise KeyError(f"No stored password for device {device_id}")
        return pw

    def adapter(self, device_id: str) -> NVRAdapter:
        """Get (or lazily create) the protocol adapter for a saved device."""
        if device_id not in self._adapters:
            d = self.get(device_id)
            self._adapters[device_id] = create_adapter(
                d.family, d.host, d.http_port, d.rtsp_port,
                d.username, self.password(device_id),
            )
        return self._adapters[device_id]

    def _drop_adapter(self, device_id: str) -> None:
        adapter = self._adapters.pop(device_id, None)
        if adapter is not None:
            import asyncio
            try:
                asyncio.get_running_loop().create_task(adapter.close())
            except RuntimeError:  # no running loop (e.g. in tests)
                asyncio.run(adapter.close())

    async def close(self) -> None:
        for adapter in self._adapters.values():
            await adapter.close()
        self._adapters.clear()
