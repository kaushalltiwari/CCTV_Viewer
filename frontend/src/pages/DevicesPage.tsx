import { FormEvent, useState } from "react";
import { api, Device, DeviceCreate } from "../api/client";

const EMPTY: DeviceCreate = {
  name: "", host: "", http_port: 80, rtsp_port: 554,
  username: "admin", password: "", family: "dahua",
};

export default function DevicesPage({ devices, onChanged }: { devices: Device[]; onChanged: () => void }) {
  const [form, setForm] = useState<DeviceCreate>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");

  const set = (patch: Partial<DeviceCreate>) => setForm({ ...form, ...patch });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editingId) await api.devices.update(editingId, form);
      else await api.devices.add(form);
      setForm(EMPTY);
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async (id: string) => {
    setTestResult("testing…");
    try {
      const chs = await api.devices.channels(id);
      setTestResult(`✓ connected — ${chs.length} channel(s)`);
    } catch (err) {
      setTestResult(`✗ ${(err as Error).message}`);
    }
  };

  const edit = (d: Device) => {
    setEditingId(d.id);
    setForm({ ...d, password: "" });
  };

  const remove = async (id: string) => {
    await api.devices.remove(id);
    if (editingId === id) { setEditingId(null); setForm(EMPTY); }
    onChanged();
  };

  const input =
    "w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none";
  const label = "mb-1 block text-xs text-neutral-400";

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-8 lg:grid-cols-2">
      <section>
        <h1 className="mb-4 text-lg font-semibold text-white">NVR Devices</h1>
        {devices.length === 0 && (
          <p className="text-sm text-neutral-500">No devices yet — add your NVR on the right.</p>
        )}
        <ul className="space-y-2">
          {devices.map((d) => (
            <li key={d.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">{d.name}</div>
                  <div className="text-xs text-neutral-400">
                    {d.host}:{d.http_port} · rtsp {d.rtsp_port} · {d.family} · {d.username}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => testConnection(d.id)} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">Test</button>
                  <button onClick={() => edit(d)} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">Edit</button>
                  <button onClick={() => remove(d.id)} className="rounded border border-red-900 px-2 py-1 text-red-400 hover:bg-red-950">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {testResult && <p className="mt-3 text-sm text-neutral-300">{testResult}</p>}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">
          {editingId ? "Edit device" : "Add device"}
        </h2>
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div>
            <label className={label}>Name</label>
            <input className={input} required value={form.name}
              onChange={(e) => set({ name: e.target.value })} placeholder="Home NVR" />
          </div>
          <div>
            <label className={label}>IP address / hostname</label>
            <input className={input} required value={form.host}
              onChange={(e) => set({ host: e.target.value })} placeholder="192.168.1.100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>HTTP port</label>
              <input className={input} type="number" value={form.http_port}
                onChange={(e) => set({ http_port: Number(e.target.value) })} />
            </div>
            <div>
              <label className={label}>RTSP port</label>
              <input className={input} type="number" value={form.rtsp_port}
                onChange={(e) => set({ rtsp_port: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Username</label>
              <input className={input} required value={form.username}
                onChange={(e) => set({ username: e.target.value })} />
            </div>
            <div>
              <label className={label}>Password {editingId && "(blank = keep)"}</label>
              <input className={input} type="password" required={!editingId} value={form.password}
                onChange={(e) => set({ password: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Family</label>
            <select className={input} value={form.family} onChange={(e) => set({ family: e.target.value })}>
              <option value="dahua">Dahua-based (most CP Plus NVRs)</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button disabled={busy} className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
              {editingId ? "Save" : "Add"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}
                className="rounded border border-neutral-700 px-4 py-1.5 text-sm hover:bg-neutral-800">
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
