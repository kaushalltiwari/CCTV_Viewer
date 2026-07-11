# CCTV Desktop Client — Project Plan

A Windows PC application that replicates the core functionality of the **gCMOB** mobile app
for **CP Plus NVRs**: live view, searching recorded footage, playback, and downloading
recordings to local disk.

---

## 1. Background: how gCMOB talks to a CP Plus NVR

CP Plus does not manufacture its own NVR firmware — their devices are OEM rebrands of two
different platforms, and the protocol differs by model line:

| Family | Typical CP Plus models | Native protocol | Ports |
|---|---|---|---|
| **Dahua-based** (most common) | CP-UNR-*, CP-UVR-*, Orange series | Dahua private protocol + HTTP CGI API | 37777 (TCP), 80 (HTTP), 554 (RTSP) |
| **Xiongmai/XMeye-based** (Sofia firmware) | some CP-VNR / older DVRs | DVRIP ("Sofia") — this is what gCMOB/XMeye speak | 34567 (TCP), 554 (RTSP) |

Both families additionally support **ONVIF** (live view universally; recording search/replay
via Profile G on most Dahua-based models) and **RTSP** for actual video transport.

**We do not need the gCMOB cloud (P2P) path.** On a LAN (or via port-forward/VPN), the NVR
can be reached directly by IP, which is simpler, faster, and has no vendor cloud dependency.

### Step 0 — identify which family your NVR is (do this first)

Run against the NVR's IP:

```powershell
# Dahua family listens on 37777; Xiongmai family on 34567
Test-NetConnection <NVR_IP> -Port 37777
Test-NetConnection <NVR_IP> -Port 34567
Test-NetConnection <NVR_IP> -Port 554     # RTSP — should be open on both
```

Also try in a browser: `http://<NVR_IP>` — a Dahua-based unit shows a web login whose UI
matches the CP Plus "blue" web client and answers `http://<NVR_IP>/cgi-bin/magicBox.cgi?action=getDeviceType`
after login. The result of this probe decides which protocol adapter we implement first
(the architecture below supports both).

---

## 2. Feature scope (parity with gCMOB)

### Must have (v1)
- [ ] Add/save NVR devices (IP, port, username, password) — credentials stored encrypted
- [ ] Channel list with camera names pulled from the NVR
- [ ] **Live view** — single channel + 2×2 grid, main/sub-stream toggle
- [ ] **Recording search** — pick channel + date, see a calendar of days that have footage
      and a timeline of segments within the day (color-coded: continuous vs. motion event)
- [ ] **Playback** — play a recorded segment with pause/seek
- [ ] **Download** — select a time range (or a whole segment) and save it as a playable
      `.mp4` on the PC, with a download queue and progress display

### Nice to have (v2)
- [ ] Multi-day / multi-channel batch download
- [ ] Snapshot (JPEG) from live or playback
- [ ] Playback speed control (2x/4x) and frame-step
- [ ] Motion-event list view (jump straight to events)
- [ ] PTZ control (if any cameras are PTZ)
- [ ] Auto-discovery of NVRs on the LAN (ONVIF WS-Discovery / Dahua broadcast)

### Explicitly out of scope
- P2P/cloud relay (gCMOB's serial-number connection) — LAN/direct IP only
- Mobile push notifications
- Two-way audio

---

## 3. Tech stack (recommended)

**Local web app**: a Python backend runs on the PC and serves a browser-based UI.
Python keeps the best library coverage for the NVR protocols; web tech gives us a modern,
flexible UI — and the same app can later be opened from a phone/another PC on the LAN
for free.

The one problem web tech introduces: **browsers cannot play RTSP.** We solve it with
**go2rtc**, a single ~15 MB binary that ingests RTSP and re-serves it as WebRTC/MSE with
sub-second latency, hardware-friendly and battle-tested (it's what Frigate and Home
Assistant use). The backend registers streams with go2rtc on demand; the frontend plays
them with go2rtc's `video-rtc` web component (WebRTC with automatic MSE fallback).

| Concern | Choice | Why |
|---|---|---|
| Frontend | **React 18 + TypeScript + Vite** | Component model fits the UI (grid, calendar, timeline, download queue); Vite for fast dev; built bundle is served as static files by the backend |
| UI components | **Tailwind CSS** + headless components | Quick, clean dark UI (CCTV apps are used in the dark); no heavy component-library lock-in |
| Video in browser | **go2rtc** (bundled binary) + its `video-rtc.js` web component | RTSP → WebRTC/MSE; handles H.264 natively; transcodes H.265→H.264 via ffmpeg only when the browser can't play it |
| Backend | **Python 3.12 + FastAPI + uvicorn** | Async REST API for devices/search/downloads; WebSocket for progress events; serves the built frontend; best protocol-library ecosystem |
| Download / remux | **ffmpeg** (bundled binary) | Records the RTSP *playback* stream to `.mp4` with `-c copy` (no re-encode, fast, lossless); also remuxes native `.dav` files if we use the CGI download path |
| Dahua HTTP API | `httpx` with Digest auth | Recording search (`mediaFileFind.cgi`), file download (`loadfile.cgi`), device info, channel names |
| ONVIF | `onvif-zeep-async` | Fallback/universal path: device info, stream URIs, Profile G recording search |
| DVRIP (Xiongmai) | `python-dvr` (dvrip module) | Only if Step 0 shows the NVR is XMeye-based: login, file search, file download over port 34567 |
| Credential storage | `keyring` (Windows Credential Manager) | Never store NVR passwords in plaintext config |
| Config | `pydantic` + JSON file in `%APPDATA%` | Typed, validated settings |
| Packaging | **PyInstaller** one-folder build + `CCTV.exe` launcher | Starts backend + go2rtc, opens the default browser at `http://localhost:8080`; ffmpeg/go2rtc binaries included |

App model: run the launcher → backend + go2rtc start → browser opens `http://localhost:8080`.
Binds to `localhost` only by default; a settings toggle can bind to the LAN interface
(with auth) if you later want to open the UI from other devices.

### Alternatives considered (and why not)

- **PySide6/Qt native desktop app** — self-contained and great for embedded video, but the
  user prefers web technologies, and the web stack adds multi-device access for free.
- **Electron/Tauri wrapper** — packages the same web UI as a "real" window, but adds build
  complexity for little gain over launching the default browser. Tauri can be added later
  as a thin shell if a proper desktop window is wanted.
- **HLS instead of go2rtc/WebRTC** — simpler pipeline (pure ffmpeg) but 3–10 s latency,
  which feels broken for live view. HLS remains a fallback for playback-only use.
- **C# / WinForms + official Dahua NetSDK** — most feature-complete (it's what the vendor
  tools use), but ties us to closed-source DLLs, Dahua-family only, and slower iteration.
  Keep as fallback if the HTTP API turns out to be locked down on this firmware.

---

## 4. Architecture

```
┌───────────────────── Browser (React + TS) ─────────────────────────┐
│  Device manager │ Live grid  │ Search (calendar+timeline) │ Player │
│                 │ video-rtc  │                            │video-rtc│
│                 Download queue (progress via WebSocket)            │
└───────┬──────────────────┬─────────────────────────────────────────┘
        │ REST + WebSocket │ WebRTC / MSE  (video)
┌───────┴──────────────┐ ┌─┴──────────────────────┐
│  FastAPI backend     │ │  go2rtc                │
│  (localhost:8080)    │→│  (localhost:1984)      │  backend registers
│                      │ │  RTSP → WebRTC/MSE     │  streams on demand
├──────────────────────┤ └───────────┬────────────┘
│ NVR adapter interface│             │ RTSP
│ connect · channels · │             ▼
│ live_url · query_days│      ┌─────────────┐
│ query_segments ·     │─────→│  CP Plus NVR │  HTTP CGI / ONVIF /
│ playback_url ·       │      │  (LAN IP)    │  DVRIP + RTSP :554
│ download(range)→file │      └─────────────┘
├──────┬───────┬───────┤
│Dahua │ ONVIF │ DVRIP │  ffmpeg subprocess (downloads → .mp4)
└──────┴───────┴───────┘
```

The **adapter interface** is the key design decision: the UI and API never know which
protocol is underneath, so supporting either NVR family (or a second NVR later) is just
another adapter. Live/playback video never passes through the FastAPI process — the
backend only hands go2rtc an RTSP URL and returns the stream name to the frontend.

### How each core operation works (Dahua-family, the likely case)

- **Live view**: `rtsp://user:pass@ip:554/cam/realmonitor?channel=N&subtype=0` → libmpv
- **Day calendar / segments**: `GET /cgi-bin/mediaFileFind.cgi` (factory.create →
  findFile with channel+time range → findNextFile) — returns file list with start/end
  times, size, and event type (regular/motion)
- **Playback**: `rtsp://ip:554/cam/playback?channel=N&starttime=YYYY_MM_DD_HH_MM_SS&endtime=...`
  → libmpv (seek within range supported)
- **Download** (two paths, in preference order):
  1. `ffmpeg -i <playback RTSP URL> -c copy out.mp4` — arbitrary time ranges, always
     produces a standard mp4. Runs at stream speed unless the NVR honors fast playback.
  2. `GET /cgi-bin/loadfile.cgi?action=startLoad&file=<path from search>` — direct file
     transfer (fast, native `.dav` container) → remux to mp4 with ffmpeg. Firmware-dependent;
     we test on the real device and keep whichever works.

### Project layout

```
CCTV/
├─ PLAN.md                    ← this file
├─ backend/
│  ├─ pyproject.toml
│  └─ src/cctv/
│     ├─ main.py              # FastAPI app; serves API + built frontend; launcher logic
│     ├─ api/
│     │  ├─ devices.py        # CRUD for saved NVRs
│     │  ├─ streams.py        # register live/playback streams with go2rtc
│     │  ├─ recordings.py     # day calendar + segment search endpoints
│     │  └─ downloads.py      # queue endpoints + WebSocket progress
│     ├─ adapters/
│     │  ├─ base.py           # NVRAdapter ABC + models (Channel, Segment, ...)
│     │  ├─ dahua.py
│     │  ├─ onvif_adapter.py
│     │  └─ dvrip.py
│     ├─ services/
│     │  ├─ go2rtc.py         # manage go2rtc process + its REST API
│     │  ├─ download_manager.py  # queue, ffmpeg subprocess control, progress parse
│     │  └─ device_store.py   # config + keyring
│     └─ vendor/              # bundled ffmpeg.exe, go2rtc.exe
├─ frontend/
│  ├─ package.json            # React + TS + Vite + Tailwind
│  └─ src/
│     ├─ App.tsx              # routing/layout (sidebar: Live / Search / Downloads / Devices)
│     ├─ components/
│     │  ├─ VideoPlayer.tsx   # wraps go2rtc video-rtc web component
│     │  ├─ LiveGrid.tsx      # 1×1 / 2×2 layout, stream toggle
│     │  ├─ RecordingCalendar.tsx
│     │  ├─ Timeline.tsx      # 24 h segment bar, range-select for download
│     │  └─ DownloadQueue.tsx
│     ├─ api/                 # typed client for backend REST + WS
│     └─ pages/
└─ tests/
```

---

## 5. Milestones

| # | Milestone | Deliverable | Est. |
|---|---|---|---|
| 0 | **Device probe** | Confirm NVR family, firmware, open ports; verify RTSP live URL plays in VLC; verify one CGI search call with `curl` | ½ day |
| 1 | **Skeleton + connect** | FastAPI + Vite scaffold, device add/edit UI, adapter connects and lists channels | 1 day |
| 2 | **Live view** | go2rtc integration; single channel then 2×2 grid in the browser, stream toggle | 1–2 days |
| 3 | **Search** | Calendar with recorded days, per-day timeline of segments | 1–2 days |
| 4 | **Playback** | Click a segment → plays in browser with pause/seek | 1 day |
| 5 | **Download** | Timeline range selection, ffmpeg-based download queue with WS progress, mp4 output | 1–2 days |
| 6 | **Polish + package** | Error handling, reconnects, keyring, PyInstaller build + launcher | 1–2 days |

Milestone 0 is the gate: everything after it is de-risked once we've seen the real device
answer RTSP and one search query.

---

## 6. Risks & open questions

| Risk / question | Mitigation |
|---|---|
| **Which NVR model/firmware do you have?** (biggest unknown) | Step 0 probe; adapter design absorbs either answer |
| Firmware may disable HTTP CGI or `loadfile.cgi` | ONVIF Profile G fallback for search; ffmpeg-over-RTSP fallback for download always works if playback RTSP works |
| **H.265 streams may not play in the browser** (Chrome/Edge support HEVC only with hardware decode) | go2rtc can transcode H.265→H.264 via ffmpeg on the fly; or set NVR sub-stream to H.264 for live view; downloads are unaffected (`-c copy`) |
| H.265 recordings in `.mp4` container have patchy player support | ffmpeg `-c copy` into mp4 with `-tag:v hvc1`; offer `.mkv` output option |
| RTSP-based download runs at ~1× real time for long clips | Prefer `loadfile.cgi`/DVRIP file transfer when available (native speed); allow parallel downloads |
| Account lockout from wrong credentials during testing | Back-off on auth failures; never retry in a loop |
| Remote (non-LAN) access | Out of scope for v1; recommend VPN (WireGuard/Tailscale) to reach the NVR rather than exposing ports |

---

## 7. Prerequisites before coding starts

1. NVR IP address, admin (or dedicated viewer) username/password
2. Result of the Step 0 port probe
3. NVR model number (printed on the unit or shown in gCMOB → device details)
4. PC on the same LAN as the NVR (for development)
