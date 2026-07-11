import { useEffect, useState } from "react";
import { api, Channel, Device } from "../api/client";

interface Props {
  devices: Device[];
  deviceId: string;
  channel: number;
  onDevice: (id: string) => void;
  onChannel: (ch: number) => void;
}

export default function ChannelPicker({ devices, deviceId, channel, onDevice, onChannel }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setChannels([]);
    setError("");
    if (!deviceId) return;
    api.devices
      .channels(deviceId)
      .then((chs) => {
        setChannels(chs);
        if (chs.length && !chs.some((c) => c.index === channel)) onChannel(chs[0].index);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const select =
    "rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none";

  return (
    <div className="flex items-center gap-2">
      <select className={select} value={deviceId} onChange={(e) => onDevice(e.target.value)}>
        <option value="">— device —</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <select
        className={select}
        value={channel}
        onChange={(e) => onChannel(Number(e.target.value))}
        disabled={!channels.length}
      >
        {channels.map((c) => (
          <option key={c.index} value={c.index}>
            {c.index}. {c.name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
