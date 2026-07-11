# How this app works — in simple terms

This project turns your PC into a gCMOB-style client for your CP Plus NVR.
It is made of **four programs working together**, all running on your PC:

```
 Your browser  ──(web page, clicks)──►  Backend (Python/FastAPI)
      │                                     │
      │                                     ├──(asks for camera lists,
      │                                     │   recordings, playback URLs)──►  NVR
      │                                     │
      │◄──(live video via WebRTC)──  go2rtc ◄──(RTSP video)──────────────────  NVR
      │
      └── Downloads tab shows progress of… ffmpeg ◄──(RTSP playback)─────────  NVR
                                             │
                                             └──► saves .mp4 files on your disk
```

## The four pieces

1. **The web page (frontend)** — what you see at `http://localhost:8080`.
   Built with React. It has three tabs (Live, Downloads, Devices) and just
   sends simple requests to the backend, like "give me the camera list" or
   "download CH5 from 10:00 to 11:00". It never talks to the NVR directly.

2. **The backend (Python, FastAPI)** — the brain. It stores your saved
   devices, knows how to speak the NVR's language (the Dahua HTTP protocol
   your CP Plus uses), and coordinates the other two programs. All "NVR
   dialect" knowledge lives in one file (`adapters/dahua.py`), so a
   different NVR brand later only needs a new adapter, nothing else changes.

3. **go2rtc** — the video translator. Browsers cannot play the RTSP video
   that NVRs produce. go2rtc takes the NVR's RTSP stream and re-serves it
   as WebRTC, which browsers play natively with under a second of delay.
   The backend just tells go2rtc "stream X = this NVR URL"; the actual
   video flows NVR → go2rtc → browser and never touches Python.

4. **ffmpeg** — the downloader. To save a recording, the backend asks the
   NVR to "play back" the chosen time range over RTSP, and ffmpeg records
   that stream into a standard `.mp4` on your disk. The video is copied
   bit-for-bit (no quality loss); only the audio is converted (the NVR's
   telephone-era G.711 format isn't allowed inside MP4, so it becomes AAC).

## What happens when you…

- **Open Live** → backend asks the NVR for its camera list, registers one
  go2rtc stream per camera, and the page embeds a small go2rtc player for
  each. (Sub-stream = the NVR's lower-quality feed, easier on bandwidth.)

- **Click ⬇ Download on a camera** → the page asks the backend "what
  recordings exist on this date?" The backend runs the NVR's file search
  (in hour-ish chunks, because the firmware only returns a few results per
  query) and the overlay draws them on the 24-hour timeline.

- **Queue a download** → the job enters a queue (one at a time). ffmpeg
  records the playback stream to your chosen folder while the backend
  reads its progress output and pushes percent/MB/speed updates to the
  Downloads tab over a WebSocket (a live connection, no page refresh).

## Where things are stored

| What | Where | Committed to git? |
|---|---|---|
| Code | `d:\Working\CCTV` | yes |
| Saved devices (name, IP, port, username) | `%APPDATA%\cctv\devices.json` | **no** |
| NVR passwords | Windows Credential Manager (OS keyring) | **no** |
| App settings (download folder) | `%APPDATA%\cctv\settings.json` | **no** |
| Downloaded videos | your chosen folder (default `Downloads\CCTV`) | **no** |
| ffmpeg.exe / go2rtc.exe | `backend/src/cctv/vendor/` | **no** (gitignored) |
| UI state (selected tab/device) | browser localStorage | **no** |

## Ports used (all local-only)

| Port | Who | What |
|---|---|---|
| 8080 | backend | the web app and its API (binds to 127.0.0.1) |
| 1984 | go2rtc | stream API + embedded players (127.0.0.1) |
| 8555 | go2rtc | WebRTC media |
| 80 / 554 | NVR | HTTP API / RTSP video (on your LAN) |
