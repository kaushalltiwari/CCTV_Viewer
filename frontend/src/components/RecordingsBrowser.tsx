// Full-screen overlay for one camera: date picker, 24h timeline, segment list
// with play/download, range download, and inline playback. Opened from the
// Live grid's ⬇ Download button — same UI as the former Search tab.
import { useEffect, useState } from "react";
import { api, Channel, Segment, StreamHandle } from "../api/client";
import VideoPlayer from "./VideoPlayer";

const KIND_COLOR: Record<string, string> = {
  regular: "bg-emerald-600",
  motion: "bg-amber-500",
  alarm: "bg-red-500",
};

function hhmm(iso: string) {
  return iso.slice(11, 19);
}

function dayFraction(iso: string, day: string) {
  const t = new Date(iso).getTime();
  const start = new Date(`${day}T00:00:00`).getTime();
  return Math.min(Math.max((t - start) / 86_400_000, 0), 1);
}

interface Props {
  deviceId: string;
  channel: Channel;
  onClose: () => void;
}

export default function RecordingsBrowser({ deviceId, channel, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [player, setPlayer] = useState<{ handle: StreamHandle; label: string } | null>(null);
  const [rangeStart, setRangeStart] = useState("00:00:00");
  const [rangeEnd, setRangeEnd] = useState("23:59:59");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSegments(null);
    setPlayer(null);
    setError("");
    setNotice("");
    setBusy(true);
    api.recordings
      .segments(deviceId, channel.index, day)
      .then(setSegments)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [deviceId, channel.index, day]);

  const play = async (seg: Segment) => {
    setError("");
    try {
      const handle = await api.streams.playback(deviceId, seg.channel, seg.start, seg.end);
      setPlayer({ handle, label: `${hhmm(seg.start)} – ${hhmm(seg.end)}` });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const download = async (start: string, end: string) => {
    setError("");
    setNotice("");
    try {
      await api.downloads.enqueue({ device_id: deviceId, channel: channel.index, start, end });
      setNotice(`Queued ${hhmm(start)} – ${hhmm(end)} → see Downloads tab`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const input =
    "rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 md:p-8"
      onClick={onClose}>
      <div className="w-full max-w-5xl rounded-xl border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Recordings — CH{channel.index} {channel.name}
          </h2>
          <button onClick={onClose}
            className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white">✕</button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={input} />
          {busy && <span className="text-sm text-neutral-500">searching…</span>}
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {notice && <p className="mb-3 text-sm text-emerald-400">{notice}</p>}

        {segments && (
          <>
            {/* 24h timeline */}
            <div className="mb-1 flex justify-between text-[10px] text-neutral-500">
              {["00", "04", "08", "12", "16", "20", "24"].map((h) => <span key={h}>{h}:00</span>)}
            </div>
            <div className="relative mb-5 h-6 w-full rounded bg-neutral-800">
              {segments.map((s, i) => {
                const left = dayFraction(s.start, day) * 100;
                const width = Math.max((dayFraction(s.end, day) - dayFraction(s.start, day)) * 100, 0.15);
                return (
                  <button key={i} title={`${hhmm(s.start)} – ${hhmm(s.end)} (${s.kind}) — click to play`}
                    onClick={() => play(s)}
                    className={`absolute top-0 h-full ${KIND_COLOR[s.kind] ?? "bg-emerald-600"} opacity-80 hover:opacity-100`}
                    style={{ left: `${left}%`, width: `${width}%` }} />
                );
              })}
            </div>

            {/* range download */}
            {segments.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm">
                <span className="text-neutral-400">Download range:</span>
                <input type="time" step="1" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className={input} />
                <span className="text-neutral-500">→</span>
                <input type="time" step="1" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className={input} />
                <button onClick={() => download(`${day}T${rangeStart}`, `${day}T${rangeEnd}`)}
                  className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-600">
                  ⬇ Download range
                </button>
                <span className="text-xs text-neutral-500">
                  one .mp4 · runs at playback speed, long ranges take a while
                </span>
              </div>
            )}

            {player && (
              <div className="mb-5 max-w-3xl">
                <h3 className="mb-2 text-sm font-medium text-neutral-300">Playback — {player.label}</h3>
                <VideoPlayer playerUrl={player.handle.player_url} title={player.label} />
              </div>
            )}

            {segments.length === 0 ? (
              <p className="text-sm text-neutral-500">No recordings on {day} for this camera.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-500">
                  <tr>
                    <th className="pb-2">Start</th><th className="pb-2">End</th>
                    <th className="pb-2">Type</th><th className="pb-2">Size</th><th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="py-1.5">{hhmm(s.start)}</td>
                      <td>{hhmm(s.end)}</td>
                      <td>
                        <span className={`rounded px-1.5 py-0.5 text-xs text-black ${KIND_COLOR[s.kind] ?? "bg-emerald-600"}`}>
                          {s.kind}
                        </span>
                      </td>
                      <td className="text-neutral-400">
                        {s.size_bytes ? `${(s.size_bytes / 1_048_576).toFixed(1)} MB` : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => play(s)}
                          className="mr-2 rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800">▶ Play</button>
                        <button onClick={() => download(s.start, s.end)}
                          className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800">⬇ Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
