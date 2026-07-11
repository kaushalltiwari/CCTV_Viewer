import { useEffect, useState } from "react";
import { api, Device, Health } from "./api/client";
import DevicesPage from "./pages/DevicesPage";
import DownloadsPage from "./pages/DownloadsPage";
import LivePage from "./pages/LivePage";

type Tab = "live" | "downloads" | "devices";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "live", label: "Live", icon: "📺" },
  { id: "downloads", label: "Downloads", icon: "⬇️" },
  { id: "devices", label: "Devices", icon: "🖥️" },
];

export default function App() {
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = localStorage.getItem("cctv.tab") as Tab | null;
    return saved && TABS.some((t) => t.id === saved) ? saved : "devices";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    localStorage.setItem("cctv.tab", t);
  };
  const [devices, setDevices] = useState<Device[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  const refreshDevices = () => api.devices.list().then(setDevices).catch(console.error);

  useEffect(() => {
    refreshDevices();
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="flex h-screen">
      <aside className="w-52 shrink-0 border-r border-neutral-800 bg-neutral-900 flex flex-col">
        <div className="px-4 py-4 text-lg font-semibold tracking-wide text-white">
          CCTV<span className="text-emerald-500">_</span>Viewer
        </div>
        <nav className="flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 ${
                tab === t.id
                  ? "bg-neutral-800 text-white border-l-2 border-emerald-500"
                  : "text-neutral-400 hover:bg-neutral-800/50"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
        {health && (!health.go2rtc || !health.ffmpeg) && (
          <div className="m-3 rounded border border-amber-700 bg-amber-950/50 p-2 text-xs text-amber-300">
            {!health.go2rtc && <div>go2rtc missing — video disabled</div>}
            {!health.ffmpeg && <div>ffmpeg missing — downloads disabled</div>}
            <div className="mt-1 text-amber-500">See README to install</div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto p-6">
        {tab === "live" && <LivePage devices={devices} />}
        {tab === "downloads" && <DownloadsPage />}
        {tab === "devices" && <DevicesPage devices={devices} onChanged={refreshDevices} />}
      </main>
    </div>
  );
}
