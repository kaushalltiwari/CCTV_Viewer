"""Filesystem locations used by the app."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

VENDOR_DIR = Path(__file__).parent / "vendor"


def config_dir() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home() / ".config")
    d = Path(base) / "cctv"
    d.mkdir(parents=True, exist_ok=True)
    return d


def default_download_dir() -> Path:
    d = Path.home() / "Downloads" / "CCTV"
    d.mkdir(parents=True, exist_ok=True)
    return d


def find_binary(name: str) -> str | None:
    """Locate a bundled or system binary (e.g. ffmpeg, go2rtc)."""
    exe = f"{name}.exe" if sys.platform == "win32" else name
    vendored = VENDOR_DIR / exe
    if vendored.exists():
        return str(vendored)
    return shutil.which(name)
