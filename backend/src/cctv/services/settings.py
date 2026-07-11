"""User-configurable settings, persisted to %APPDATA%\\cctv\\settings.json."""
from __future__ import annotations

import json
from pathlib import Path

from ..paths import config_dir, default_download_dir


class SettingsStore:
    def __init__(self) -> None:
        self._path = config_dir() / "settings.json"
        self._data: dict = {"download_dir": str(default_download_dir())}
        if self._path.exists():
            self._data.update(json.loads(self._path.read_text(encoding="utf-8")))

    @property
    def download_dir(self) -> Path:
        d = Path(self._data["download_dir"])
        d.mkdir(parents=True, exist_ok=True)
        return d

    def set_download_dir(self, value: str) -> None:
        d = Path(value).expanduser()
        d.mkdir(parents=True, exist_ok=True)  # validates the path is usable
        self._data["download_dir"] = str(d)
        self._path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
