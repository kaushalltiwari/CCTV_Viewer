import { useEffect, useState } from "react";
import { api, DownloadJob } from "../api/client";

const STATUS_STYLE: Record<DownloadJob["status"], string> = {
  queued: "text-neutral-400",
  running: "text-emerald-400",
  done: "text-emerald-500",
  error: "text-red-400",
  cancelled: "text-neutral-500",
};

function mb(bytes: number) {
  return (bytes / 1_048_576).toFixed(1);
}

export default function DownloadsPage() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [dir, setDir] = useState("");
  const [dirSaved, setDirSaved] = useState("");
  const [dirMsg, setDirMsg] = useState("");

  useEffect(() => {
    api.downloads.list().then(setJobs).catch(console.error);
    api.settings.get().then((s) => { setDir(s.download_dir); setDirSaved(s.download_dir); });
    const ws = api.downloads.progressSocket();
    ws.onmessage = (ev) => {
      const job: DownloadJob = JSON.parse(ev.data);
      setJobs((prev) => {
        const i = prev.findIndex((j) => j.id === job.id);
        if (i === -1) return [job, ...prev];
        const next = [...prev];
        next[i] = job;
        return next;
      });
    };
    return () => ws.close();
  }, []);

  const saveDir = async () => {
    setDirMsg("");
    try {
      const s = await api.settings.update({ download_dir: dir });
      setDir(s.download_dir);
      setDirSaved(s.download_dir);
      setDirMsg("✓ saved");
    } catch (err) {
      setDirMsg(`✗ ${(err as Error).message}`);
    }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-lg font-semibold text-white">Downloads</h1>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <span className="text-neutral-400">Save to:</span>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          spellCheck={false}
          className="min-w-72 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 font-mono text-xs focus:border-emerald-600 focus:outline-none"
        />
        <button onClick={saveDir} disabled={dir === dirSaved}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
          Save
        </button>
        {dirMsg && <span className={dirMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}>{dirMsg}</span>}
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing here yet — open a device in the Live tab and use the ⬇ Download button on a camera.
        </p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-white">{j.device_name}</span>
                  <span className="text-neutral-400"> · CH{j.channel} · </span>
                  <span className="text-neutral-300">
                    {new Date(j.start).toLocaleString()} → {new Date(j.end).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs uppercase ${STATUS_STYLE[j.status]}`}>{j.status}</span>
                  {(j.status === "queued" || j.status === "running") && (
                    <button onClick={() => api.downloads.cancel(j.id)}
                      className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {j.status === "running" && (
                <>
                  <div className="mt-2 h-1.5 w-full rounded bg-neutral-800">
                    <div className="h-full rounded bg-emerald-500 transition-all"
                      style={{ width: `${Math.round(j.progress * 100)}%` }} />
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-neutral-400">
                    <span>{Math.round(j.progress * 100)}%</span>
                    <span>{mb(j.downloaded_bytes)} MB</span>
                    <span>{mb(j.rate_bps)} MB/s</span>
                    {j.speed_x > 0 && <span>{j.speed_x.toFixed(2)}× realtime</span>}
                  </div>
                </>
              )}
              {j.status === "done" && (
                <div className="mt-1 text-xs text-neutral-400">
                  {j.output_path}{j.downloaded_bytes > 0 && ` · ${mb(j.downloaded_bytes)} MB`}
                </div>
              )}
              {j.status === "error" && (
                <div className="mt-1 text-xs text-red-400">{j.error}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
