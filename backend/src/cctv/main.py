"""CCTV backend entry point.

Run in development:  uvicorn cctv.main:app --port 8080 --reload
In production the same server also serves the built frontend from frontend/dist.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import devices, downloads, recordings, streams
from .services.device_store import DeviceStore
from .services.download_manager import DownloadManager
from .services.go2rtc import Go2RTCService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

FRONTEND_DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = DeviceStore()
    app.state.go2rtc = Go2RTCService()
    app.state.downloads = DownloadManager()
    await app.state.go2rtc.start()
    await app.state.downloads.start()
    yield
    await app.state.downloads.stop()
    await app.state.go2rtc.stop()
    await app.state.store.close()


app = FastAPI(title="CCTV", lifespan=lifespan)

# Vite dev server origin (development only; irrelevant when serving the built bundle)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(streams.router)
app.include_router(recordings.router)
app.include_router(downloads.router)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "go2rtc": app.state.go2rtc.available,
        "ffmpeg": app.state.downloads.available,
    }


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


def run() -> None:
    import uvicorn
    uvicorn.run("cctv.main:app", host="127.0.0.1", port=8080)


if __name__ == "__main__":
    run()
