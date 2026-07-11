from __future__ import annotations

from .base import NVRAdapter
from .dahua import DahuaAdapter

ADAPTERS: dict[str, type[NVRAdapter]] = {
    "dahua": DahuaAdapter,
    # "onvif": OnvifAdapter,   # planned fallback (Profile S/G)
    # "dvrip": DvripAdapter,   # planned, for Xiongmai/XMeye-based units
}


def create_adapter(family: str, host: str, http_port: int, rtsp_port: int,
                   username: str, password: str) -> NVRAdapter:
    try:
        cls = ADAPTERS[family]
    except KeyError:
        raise ValueError(f"Unsupported NVR family: {family!r}. Supported: {list(ADAPTERS)}")
    return cls(host=host, http_port=http_port, rtsp_port=rtsp_port,
               username=username, password=password)
