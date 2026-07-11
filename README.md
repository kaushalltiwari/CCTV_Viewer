```text
 ██████╗ ██████╗████████╗██╗   ██╗
██╔════╝██╔════╝╚══██╔══╝██║   ██║
██║     ██║        ██║   ██║   ██║
██║     ██║        ██║   ╚██╗ ██╔╝
╚██████╗╚██████╗   ██║    ╚████╔╝
 ╚═════╝ ╚═════╝   ╚═╝     ╚═══╝
   closed-circuit, open source
```

# CCTV — a desktop web client for CP Plus NVRs

View your cameras live, browse recordings on a timeline, play them back, and save them
as standard `.mp4` files — a **gCMOB replacement for the PC**, running entirely on your
own machine over the LAN. No vendor cloud, no P2P relay, no account.

Tested against a real CP Plus NVR (Dahua-based firmware, H.265 cameras with G.711 audio).

## Features

- **Live view** — all cameras of the selected NVR in a grid, with sub-stream toggle
  for lower bandwidth. Sub-second latency via WebRTC.
- **Recording browser** — per camera: pick a date, see the 24-hour timeline of what
  was recorded (continuous vs. motion, color-coded), click any segment to play it back
  in the browser.
- **Downloads** — save any segment or custom time range as one `.mp4`. Video is copied
  losslessly from the NVR (no re-encode); audio is converted G.711 → AAC so the file
  plays anywhere. Queue with live progress, transfer speed, and cancel; one job at a
  time; configurable destination folder.
- **Remembers your state** — selected tab, device, and stream quality survive restarts.
  NVR passwords go into the Windows Credential Manager, never into files.

## Requirements

- Windows 10/11, Python **3.10+**, Node.js **20+** (Node is only needed to build the UI)
- A CP Plus (or other Dahua-based) NVR reachable on your network, with its HTTP (80)
  and RTSP (554) ports enabled
- Two free binaries dropped into `backend/src/cctv/vendor/` (or available on PATH):

  | Binary | Purpose | Get it from |
  |---|---|---|
  | `go2rtc.exe` | plays NVR video in the browser (RTSP → WebRTC) | [github.com/AlexxIT/go2rtc/releases](https://github.com/AlexxIT/go2rtc/releases) |
  | `ffmpeg.exe` | records downloads to `.mp4` | [gyan.dev/ffmpeg/builds](https://www.gyan.dev/ffmpeg/builds/) ("essentials" build, copy `bin/ffmpeg.exe`) |

  The app runs without them; the sidebar tells you what's missing and what it disables.

## Setup

```powershell
# 1. backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .

# 2. frontend (one-time build)
cd ..\frontend
npm install
npm run build

# 3. run
cd ..\backend
python -m cctv.main
# open http://localhost:8080
```

For UI development, run `npm run dev` in `frontend/` instead of building — it serves on
`http://localhost:5173` and proxies API calls to the backend
(`uvicorn cctv.main:app --port 8080 --reload` for backend auto-reload).

## Using it

1. **Devices tab** — add your NVR: LAN IP, ports (defaults are right for most units),
   and the same username/password you use in gCMOB or the NVR's web page. Click
   **Test** to confirm it connects and reports your channel count.
2. **Live tab** — pick the device; every camera appears automatically.
3. **⬇ Download** on any camera opens its recording browser: choose a date, click
   timeline blocks to play, use per-segment download buttons or set a custom
   time range.
4. **Downloads tab** — watch progress/speed, cancel jobs, and set the folder where
   files are saved (default `Downloads\CCTV`).

Downloads stream from the NVR at roughly real-time speed, so a full day takes hours —
prefer the narrowest range that covers what you need.

## How it works

See [ARCHITECTURE.md](ARCHITECTURE.md) for a plain-language tour and
[PLAN.md](PLAN.md) for the original design plan. Short version: a FastAPI backend
speaks the Dahua HTTP/RTSP protocol to the NVR; bundled **go2rtc** converts RTSP to
WebRTC for the browser; bundled **ffmpeg** records playback streams into `.mp4` files.
All NVR-protocol knowledge is isolated in an adapter interface, so other NVR families
(ONVIF, Xiongmai/DVRIP) can be added without touching the UI.

Everything binds to `127.0.0.1` — nothing is exposed to your network or the internet.

### Firmware quirks handled (learned the hard way)

- File search results are returned in small batches per query — the search re-issues
  queries from the last file's end until the day is covered.
- Timestamps must be percent-encoded with `%20`; `+` for spaces silently breaks the
  NVR's time filter.
- Search conditions use 1-based channel numbers, but results report 0-based ones.
- "No files found" comes back as HTTP 400, not an empty result.
- G.711 audio can't be muxed into MP4 — it's transcoded to AAC during download.

## Project status

Core features work end-to-end against real hardware. Not yet done:

- [ ] ONVIF / DVRIP adapters (for non-Dahua-based NVRs)
- [ ] Motion-event list view, playback speed control, snapshots, PTZ
- [ ] One-click packaged build (PyInstaller launcher)
