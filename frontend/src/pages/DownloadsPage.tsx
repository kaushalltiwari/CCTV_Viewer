import { useEffect, useState } from "react";
import { api, DownloadJob } from "../api/client";

const STATUS_STYLE: Record<DownloadJob["status"], string> = {
  queued: "text-neutral-400",
  running: "text-emerald-400",
  done: "text-emerald-500",
  error: "text-red-400",
  cancelled: "text-neutral-500",
};

export default function DownloadsPage() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);

  useEffect(() => {
    api.downloads.list().then(setJobs).catch(console.error);
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

  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-lg font-semibold text-white">Downloads</h1>
      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing here yet — queue a download from the Search tab. Files are saved to
          <span className="text-neutral-300"> Downloads\CCTV</span>.
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
                <div className="mt-2 h-1.5 w-full rounded bg-neutral-800">
                  <div className="h-full rounded bg-emerald-500 transition-all"
                    style={{ width: `${Math.round(j.progress * 100)}%` }} />
                </div>
              )}
              {j.status === "done" && (
                <div className="mt-1 text-xs text-neutral-400">{j.output_path}</div>
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
