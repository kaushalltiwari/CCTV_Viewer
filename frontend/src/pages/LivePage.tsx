import { useEffect, useState } from "react";
import { api, Channel, Device, StreamHandle } from "../api/client";
import DownloadModal from "../components/DownloadModal";
import VideoPlayer from "../components/VideoPlayer";

export default function LivePage({ devices }: { devices: Device[] }) {
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem("cctv.device") ?? "");
  const [substream, setSubstream] = useState(() => localStorage.getItem("cctv.substream") !== "0");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [streams, setStreams] = useState<Record<number, StreamHandle>>({});
  const [download, setDownload] = useState<Channel | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pickDevice = (id: string) => {
    setDeviceId(id);
    localStorage.setItem("cctv.device", id);
  };
  const toggleSubstream = (on: boolean) => {
    setSubstream(on);
    localStorage.setItem("cctv.substream", on ? "1" : "0");
  };

  // saved device may have been deleted
  useEffect(() => {
    if (deviceId && devices.length && !devices.some((d) => d.id === deviceId)) pickDevice("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  // device picked → load all its cameras and open a stream for each
  useEffect(() => {
    setChannels([]);
    setStreams({});
    setError("");
    if (!deviceId) return;
    let stale = false;
    setLoading(true);
    (async () => {
      try {
        const chs = await api.devices.channels(deviceId);
        if (stale) return;
        setChannels(chs);
        const handles = await Promise.all(
          chs.map((c) => api.streams.live(deviceId, c.index, substream)),
        );
        if (stale) return;
        setStreams(Object.fromEntries(chs.map((c, i) => [c.index, handles[i]])));
      } catch (err) {
        if (!stale) setError((err as Error).message);
      } finally {
        if (!stale) setLoading(false);
      }
    })();
    return () => { stale = true; };
  }, [deviceId, substream]);

  const cols = channels.length <= 1 ? "grid-cols-1 max-w-4xl"
    : channels.length <= 4 ? "grid-cols-2"
    : "grid-cols-2 xl:grid-cols-3";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-white">Live</h1>
        <select
          value={deviceId}
          onChange={(e) => pickDevice(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none"
        >
          <option value="">— select device —</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-400">
          <input type="checkbox" checked={substream} onChange={(e) => toggleSubstream(e.target.checked)} />
          sub-stream (lower bandwidth)
        </label>
        {loading && <span className="text-sm text-neutral-500">connecting…</span>}
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {!deviceId ? (
        <p className="text-sm text-neutral-500">Select a device to see all its cameras.</p>
      ) : (
        <div className={`grid gap-4 ${cols}`}>
          {channels.map((c) => (
            <div key={c.index}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-neutral-300">{c.index}. {c.name}</span>
                <button
                  onClick={() => setDownload(c)}
                  className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  ⬇ Download
                </button>
              </div>
              {streams[c.index] ? (
                <VideoPlayer playerUrl={streams[c.index].player_url} />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-neutral-800 bg-black text-xs text-neutral-600">
                  connecting…
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {download && deviceId && (
        <DownloadModal deviceId={deviceId} channel={download} onClose={() => setDownload(null)} />
      )}
    </div>
  );
}
