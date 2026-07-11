import { useState } from "react";
import { api, Device, Segment, StreamHandle } from "../api/client";
import ChannelPicker from "../components/ChannelPicker";
import VideoPlayer from "../components/VideoPlayer";

const KIND_COLOR: Record<string, string> = {
  regular: "bg-emerald-600",
  motion: "bg-amber-500",
  alarm: "bg-red-500",
};

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dayFraction(iso: string, day: string) {
  const t = new Date(iso).getTime();
  const start = new Date(`${day}T00:00:00`).getTime();
  return Math.min(Math.max((t - start) / 86_400_000, 0), 1);
}

export default function SearchPage({ devices }: { devices: Device[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [deviceId, setDeviceId] = useState("");
  const [channel, setChannel] = useState(1);
  const [day, setDay] = useState(today);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [player, setPlayer] = useState<{ handle: StreamHandle; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const search = async () => {
    setBusy(true);
    setError("");
    setSegments(null);
    setPlayer(null);
    try {
      setSegments(await api.recordings.segments(deviceId, channel, day));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const play = async (seg: Segment) => {
    setError("");
    try {
      const handle = await api.streams.playback(deviceId, seg.channel, seg.start, seg.end);
      setPlayer({ handle, label: `CH${seg.channel} ${hhmm(seg.start)} – ${hhmm(seg.end)}` });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const download = async (seg: Segment) => {
    setError("");
    setNotice("");
    try {
      await api.downloads.enqueue({
        device_id: deviceId, channel: seg.channel, start: seg.start, end: seg.end,
      });
      setNotice(`Queued download ${hhmm(seg.start)} – ${hhmm(seg.end)} → see Downloads tab`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="max-w-5xl">
      <h1 className="mb-4 text-lg font-semibold text-white">Recording search</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ChannelPicker devices={devices} deviceId={deviceId} channel={channel}
          onDevice={setDeviceId} onChannel={setChannel} />
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none" />
        <button onClick={search} disabled={!deviceId || busy}
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-400">{notice}</p>}

      {segments && (
        <>
          {/* 24h timeline */}
          <div className="mb-1 flex justify-between text-[10px] text-neutral-500">
            {["00", "04", "08", "12", "16", "20", "24"].map((h) => <span key={h}>{h}:00</span>)}
          </div>
          <div className="relative mb-6 h-6 w-full rounded bg-neutral-800">
            {segments.map((s, i) => {
              const left = dayFraction(s.start, day) * 100;
              const width = Math.max((dayFraction(s.end, day) - dayFraction(s.start, day)) * 100, 0.15);
              return (
                <button key={i} title={`${hhmm(s.start)} – ${hhmm(s.end)} (${s.kind})`}
                  onClick={() => play(s)}
                  className={`absolute top-0 h-full ${KIND_COLOR[s.kind] ?? "bg-emerald-600"} opacity-80 hover:opacity-100`}
                  style={{ left: `${left}%`, width: `${width}%` }} />
              );
            })}
          </div>

          {segments.length === 0 ? (
            <p className="text-sm text-neutral-500">No recordings on {day} for this channel.</p>
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
                      <button onClick={() => download(s)}
                        className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800">⬇ Download</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {player && (
        <div className="mt-6 max-w-3xl">
          <h2 className="mb-2 text-sm font-medium text-neutral-300">Playback — {player.label}</h2>
          <VideoPlayer playerUrl={player.handle.player_url} title={player.label} />
        </div>
      )}
    </div>
  );
}
