import { useEffect, useState } from "react";
import { api, Channel, Segment } from "../api/client";

const KIND_COLOR: Record<string, string> = {
  regular: "bg-emerald-600",
  motion: "bg-amber-500",
  alarm: "bg-red-500",
};

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

export default function DownloadModal({ deviceId, channel, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  const [start, setStart] = useState("00:00:00");
  const [end, setEnd] = useState("23:59:59");
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSegments(null);
    setError("");
    api.recordings
      .segments(deviceId, channel.index, day)
      .then(setSegments)
      .catch((e) => setError(e.message));
  }, [deviceId, channel.index, day]);

  const queue = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.downloads.enqueue({
        device_id: deviceId,
        channel: channel.index,
        start: `${day}T${start}`,
        end: `${day}T${end}`,
      });
      setNotice("Queued — check the Downloads tab");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input =
    "rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">
            Download — CH{channel.index} {channel.name}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={input} />
          <input type="time" step="1" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
          <span className="text-neutral-500">→</span>
          <input type="time" step="1" value={end} onChange={(e) => setEnd(e.target.value)} className={input} />
        </div>

        {/* recorded coverage for the picked day; click a block to select its range */}
        {segments === null && !error ? (
          <p className="mb-3 text-xs text-neutral-500">Loading recordings…</p>
        ) : segments && segments.length === 0 ? (
          <p className="mb-3 text-xs text-neutral-500">No recordings on {day} for this camera.</p>
        ) : segments && (
          <>
            <div className="relative mb-1 h-5 w-full rounded bg-neutral-800">
              {segments.map((s, i) => {
                const left = dayFraction(s.start, day) * 100;
                const width = Math.max((dayFraction(s.end, day) - dayFraction(s.start, day)) * 100, 0.15);
                return (
                  <button key={i}
                    title={`${s.start.slice(11, 19)} – ${s.end.slice(11, 19)} (${s.kind}) — click to select`}
                    onClick={() => { setStart(s.start.slice(11, 19)); setEnd(s.end.slice(11, 19)); }}
                    className={`absolute top-0 h-full ${KIND_COLOR[s.kind] ?? "bg-emerald-600"} opacity-80 hover:opacity-100`}
                    style={{ left: `${left}%`, width: `${width}%` }} />
                );
              })}
            </div>
            <div className="mb-3 flex justify-between text-[10px] text-neutral-500">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
            </div>
          </>
        )}

        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
        {notice && <p className="mb-2 text-sm text-emerald-400">{notice}</p>}

        <div className="flex items-center gap-3">
          <button onClick={queue} disabled={busy || !segments?.length}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
            ⬇ Download
          </button>
          <span className="text-xs text-neutral-500">
            downloads run at playback speed — long ranges take a while
          </span>
        </div>
      </div>
    </div>
  );
}
