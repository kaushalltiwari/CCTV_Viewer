"""Download queue: captures an NVR playback RTSP stream to a local .mp4 via ffmpeg.

Uses `-c copy` (no re-encode) so downloads are lossless and CPU-cheap. Progress
is parsed from ffmpeg's `-progress` output and broadcast over a WebSocket.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Callable

from pydantic import BaseModel

from ..paths import find_binary
from .settings import SettingsStore

log = logging.getLogger(__name__)

_TIME_RE = re.compile(rb"out_time_ms=(\d+)")
_SIZE_RE = re.compile(rb"total_size=(\d+)")
_SPEED_RE = re.compile(rb"speed=\s*([\d.]+)x")


class DownloadJob(BaseModel):
    id: str
    device_id: str
    device_name: str
    channel: int
    start: datetime
    end: datetime
    status: str = "queued"   # queued | running | done | error | cancelled
    progress: float = 0.0    # 0..1
    downloaded_bytes: int = 0
    rate_bps: float = 0.0    # current transfer rate, bytes/second
    speed_x: float = 0.0     # ffmpeg speed vs realtime (e.g. 1.02)
    output_path: str = ""
    error: str = ""


class DownloadManager:
    def __init__(self, settings: SettingsStore, concurrency: int = 1) -> None:
        self.ffmpeg = find_binary("ffmpeg")
        self._settings = settings
        self.jobs: dict[str, DownloadJob] = {}
        self._queue: asyncio.Queue[tuple[DownloadJob, str]] = asyncio.Queue()
        self._procs: dict[str, asyncio.subprocess.Process] = {}
        self._workers: list[asyncio.Task] = []
        self._concurrency = concurrency
        self._listeners: list[Callable[[DownloadJob], None]] = []

    @property
    def available(self) -> bool:
        return self.ffmpeg is not None

    def on_update(self, cb: Callable[[DownloadJob], None]) -> None:
        self._listeners.append(cb)

    def off_update(self, cb: Callable[[DownloadJob], None]) -> None:
        if cb in self._listeners:
            self._listeners.remove(cb)

    def _notify(self, job: DownloadJob) -> None:
        for cb in self._listeners:
            try:
                cb(job)
            except Exception:
                log.exception("download listener failed")

    async def start(self) -> None:
        if not self.available:
            log.warning(
                "ffmpeg binary not found (vendor/ or PATH) - downloads disabled. "
                "Download from https://www.gyan.dev/ffmpeg/builds/"
            )
        self._workers = [asyncio.create_task(self._worker())
                         for _ in range(self._concurrency)]

    def enqueue(self, device_id: str, device_name: str, channel: int,
                start: datetime, end: datetime, playback_url: str) -> DownloadJob:
        if not self.available:
            raise RuntimeError("ffmpeg is not available - install it to enable downloads")
        stamp = start.strftime("%Y%m%d_%H%M%S")
        safe_name = re.sub(r"[^\w-]", "_", device_name)
        out = self._settings.download_dir / f"{safe_name}_ch{channel}_{stamp}.mp4"
        job = DownloadJob(
            id=uuid.uuid4().hex[:12], device_id=device_id, device_name=device_name,
            channel=channel, start=start, end=end, output_path=str(out),
        )
        self.jobs[job.id] = job
        self._queue.put_nowait((job, playback_url))
        self._notify(job)
        return job

    def cancel(self, job_id: str) -> DownloadJob:
        job = self.jobs[job_id]
        if job.status == "queued":
            job.status = "cancelled"
            self._notify(job)
        elif job.status == "running":
            proc = self._procs.get(job_id)
            if proc and proc.returncode is None:
                job.status = "cancelled"
                proc.terminate()
                self._notify(job)
        return job

    async def _worker(self) -> None:
        while True:
            job, url = await self._queue.get()
            if job.status == "cancelled":
                continue
            try:
                await self._run(job, url)
            except Exception as exc:
                log.exception("download %s failed", job.id)
                job.status = "error"
                job.error = str(exc)
                self._notify(job)

    async def _run(self, job: DownloadJob, playback_url: str) -> None:
        duration_s = (job.end - job.start).total_seconds()
        job.status = "running"
        self._notify(job)

        proc = await asyncio.create_subprocess_exec(
            self.ffmpeg, "-hide_banner", "-nostats", "-y",
            "-rtsp_transport", "tcp",
            "-i", playback_url,
            # video is copied untouched; NVR audio is G.711 (pcm_mulaw/alaw),
            # which mp4 can't hold, so transcode it to AAC
            "-c:v", "copy",
            "-c:a", "aac",
            "-movflags", "+faststart",
            "-t", str(duration_s),          # safety cap; URL is already end-bounded
            "-progress", "pipe:1",
            job.output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._procs[job.id] = proc
        stderr_task = asyncio.create_task(proc.stderr.read())
        last_notify = 0.0
        last_rate_sample: tuple[float, int] | None = None  # (monotonic, bytes)
        try:
            assert proc.stdout is not None
            # ffmpeg -progress emits key=value blocks terminated by "progress=..."
            async for line in proc.stdout:
                if m := _TIME_RE.search(line):
                    if duration_s > 0:
                        done_s = int(m.group(1)) / 1_000_000
                        job.progress = min(done_s / duration_s, 1.0)
                elif m := _SIZE_RE.search(line):
                    now = time.monotonic()
                    size = int(m.group(1))
                    if last_rate_sample and now > last_rate_sample[0]:
                        job.rate_bps = (size - last_rate_sample[1]) / (now - last_rate_sample[0])
                    last_rate_sample = (now, size)
                    job.downloaded_bytes = size
                elif m := _SPEED_RE.search(line):
                    job.speed_x = float(m.group(1))
                elif line.startswith(b"progress=") and time.monotonic() - last_notify >= 1.0:
                    last_notify = time.monotonic()
                    self._notify(job)
            code = await proc.wait()
        finally:
            self._procs.pop(job.id, None)

        if job.status == "cancelled":
            Path(job.output_path).unlink(missing_ok=True)
        elif code == 0:
            job.status = "done"
            job.progress = 1.0
        else:
            stderr = (await stderr_task).decode(errors="replace")
            # ffmpeg ends with a generic "Conversion failed!"; the real cause
            # is in the lines just before it
            lines = [l.strip() for l in stderr.splitlines()
                     if l.strip() and "Conversion failed" not in l]
            job.status = "error"
            job.error = " | ".join(lines[-2:]) if lines else f"ffmpeg exited {code}"
            Path(job.output_path).unlink(missing_ok=True)
        self._notify(job)

    async def stop(self) -> None:
        for task in self._workers:
            task.cancel()
        for proc in self._procs.values():
            if proc.returncode is None:
                proc.terminate()
