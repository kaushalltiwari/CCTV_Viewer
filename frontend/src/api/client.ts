// Typed client for the backend REST API (proxied by Vite in dev).

export interface Device {
  id: string;
  name: string;
  host: string;
  http_port: number;
  rtsp_port: number;
  username: string;
  family: string;
}

export interface DeviceCreate {
  name: string;
  host: string;
  http_port: number;
  rtsp_port: number;
  username: string;
  password: string;
  family: string;
}

export interface Channel {
  index: number;
  name: string;
}

export interface Segment {
  channel: number;
  start: string; // ISO datetime
  end: string;
  kind: string;
  size_bytes: number | null;
  file_path: string | null;
}

export interface StreamHandle {
  name: string;
  player_url: string;
}

export interface DownloadJob {
  id: string;
  device_id: string;
  device_name: string;
  channel: number;
  start: string;
  end: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  progress: number;
  downloaded_bytes: number;
  rate_bps: number;
  speed_x: number;
  output_path: string;
  error: string;
}

export interface Settings {
  download_dir: string;
}

export interface Health {
  ok: boolean;
  go2rtc: boolean;
  ffmpeg: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch { /* not json */ }
    throw new Error(detail);
  }
  return resp.json();
}

export const api = {
  health: () => req<Health>("/api/health"),

  devices: {
    list: () => req<Device[]>("/api/devices"),
    add: (spec: DeviceCreate) =>
      req<Device>("/api/devices", { method: "POST", body: JSON.stringify(spec) }),
    update: (id: string, spec: DeviceCreate) =>
      req<Device>(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify(spec) }),
    remove: (id: string) => req<{ ok: boolean }>(`/api/devices/${id}`, { method: "DELETE" }),
    channels: (id: string) => req<Channel[]>(`/api/devices/${id}/channels`),
  },

  streams: {
    live: (deviceId: string, channel: number, substream = false) =>
      req<StreamHandle>(
        `/api/devices/${deviceId}/live?channel=${channel}&substream=${substream}`,
        { method: "POST" },
      ),
    playback: (deviceId: string, channel: number, start: string, end: string) =>
      req<StreamHandle>(
        `/api/devices/${deviceId}/playback?channel=${channel}` +
          `&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { method: "POST" },
      ),
  },

  recordings: {
    days: (deviceId: string, channel: number, year: number, month: number) =>
      req<number[]>(
        `/api/devices/${deviceId}/recordings/days?channel=${channel}&year=${year}&month=${month}`,
      ),
    segments: (deviceId: string, channel: number, day: string) =>
      req<Segment[]>(`/api/devices/${deviceId}/recordings?channel=${channel}&day=${day}`),
  },

  settings: {
    get: () => req<Settings>("/api/settings"),
    update: (s: Settings) =>
      req<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  },

  downloads: {
    list: () => req<DownloadJob[]>("/api/downloads"),
    enqueue: (job: { device_id: string; channel: number; start: string; end: string }) =>
      req<DownloadJob>("/api/downloads", { method: "POST", body: JSON.stringify(job) }),
    cancel: (id: string) =>
      req<DownloadJob>(`/api/downloads/${id}/cancel`, { method: "POST" }),
    progressSocket: (): WebSocket => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      return new WebSocket(`${proto}://${location.host}/api/downloads/ws`);
    },
  },
};
