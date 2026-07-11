# CCTV — CP Plus NVR Web Client

View live cameras, search recordings, play them back, and download them to your PC —
a gCMOB replacement for the desktop. See [PLAN.md](PLAN.md) for architecture and roadmap.

## Prerequisites

- Python 3.10+
- Node.js 20+
- **ffmpeg** (downloads) and **go2rtc** (live view/playback in the browser):
  drop `ffmpeg.exe` and `go2rtc.exe` into `backend/src/cctv/vendor/`, or have them on PATH.
  - ffmpeg: https://www.gyan.dev/ffmpeg/builds/ (release essentials → copy `bin/ffmpeg.exe`)
  - go2rtc: https://github.com/AlexxIT/go2rtc/releases (`go2rtc_win64.zip` → `go2rtc.exe`)

  The app runs without them, but live view / downloads stay disabled until installed
  (the sidebar shows what's missing).

## Development setup

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
uvicorn cctv.main:app --port 8080 --reload

# frontend (second terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api to the backend)
```

## Production-style run (single server)

```powershell
cd frontend && npm run build && cd ..
cd backend && .venv\Scripts\python -m cctv.main
# open http://localhost:8080
```

## First use

1. Open the **Devices** tab → add your NVR (IP, HTTP port 80, RTSP port 554,
   username/password — same credentials as gCMOB/the NVR web page).
2. Click **Test** — it should report the channel count.
3. **Live** tab → pick the device → all cameras appear in a grid.
   Use the **⬇ Download** button on any camera to pick a date + time range
   (the popup shows recorded coverage for that day).
4. **Downloads** tab → progress, transfer speed, and the destination folder
   setting. Files are saved as standard `.mp4` (one job runs at a time).

Passwords are stored in the Windows Credential Manager, not in config files.
The selected device/tab and stream quality are remembered between sessions.

## Status

- [x] Milestone 1 — skeleton, device management, connect + channel list (Dahua family)
- [x] Milestone 2 — live view via go2rtc (first pass; embedded go2rtc player)
- [x] Milestone 3 — recording search (day timeline + segment list)
- [x] Milestone 4 — playback (first pass)
- [x] Milestone 5 — downloads (ffmpeg `-c copy`, queue + progress)
- [ ] Verify against a real CP Plus NVR (Milestone 0 hardware probe)
- [ ] Milestone 6 — polish + packaging (PyInstaller launcher)
- [ ] ONVIF / DVRIP adapters if the device turns out not to be Dahua-based
