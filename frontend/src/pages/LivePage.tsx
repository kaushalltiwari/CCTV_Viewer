import { useState } from "react";
import { api, Device, StreamHandle } from "../api/client";
import ChannelPicker from "../components/ChannelPicker";
import VideoPlayer from "../components/VideoPlayer";

interface Cell {
  handle: StreamHandle;
  label: string;
}

export default function LivePage({ devices }: { devices: Device[] }) {
  const [deviceId, setDeviceId] = useState("");
  const [channel, setChannel] = useState(1);
  const [substream, setSubstream] = useState(true);
  const [cells, setCells] = useState<Cell[]>([]);
  const [error, setError] = useState("");

  const addStream = async () => {
    setError("");
    try {
      const handle = await api.streams.live(deviceId, channel, substream);
      const device = devices.find((d) => d.id === deviceId);
      const label = `${device?.name ?? deviceId} · CH${channel} ${substream ? "(sub)" : "(main)"}`;
      setCells((prev) => {
        const next = prev.filter((c) => c.handle.name !== handle.name);
        return [...next, { handle, label }].slice(-4); // max 2×2
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-white">Live view</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ChannelPicker
          devices={devices} deviceId={deviceId} channel={channel}
          onDevice={setDeviceId} onChannel={setChannel}
        />
        <label className="flex items-center gap-1.5 text-sm text-neutral-400">
          <input type="checkbox" checked={substream} onChange={(e) => setSubstream(e.target.checked)} />
          sub-stream (lower bandwidth)
        </label>
        <button
          onClick={addStream} disabled={!deviceId}
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Add to grid
        </button>
        {cells.length > 0 && (
          <button onClick={() => setCells([])}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Clear
          </button>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {cells.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Pick a device and channel, then “Add to grid” (up to 4 streams).
        </p>
      ) : (
        <div className={`grid gap-3 ${cells.length === 1 ? "grid-cols-1 max-w-4xl" : "grid-cols-2"}`}>
          {cells.map((c) => (
            <VideoPlayer key={c.handle.name} playerUrl={c.handle.player_url} title={c.label} />
          ))}
        </div>
      )}
    </div>
  );
}
