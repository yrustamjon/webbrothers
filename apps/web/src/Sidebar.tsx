import { useState, useEffect, useCallback } from "react";
import { getDevices, type Device } from "./api";

export interface Profile {
  browser_id: string;
  browser_name: string;
  browser_color: string;
  profile_id: string;
  profile_name: string;
}

interface Props {
  deviceId: string;
  selectedProfile: Profile | null;
  onSelectProfile: (p: Profile) => void;
}

const BROWSER_COLORS: Record<string, string> = {
  chrome: "#4285f4", firefox: "#ff7139", safari: "#1d9bf0",
  edge: "#0078d4", brave: "#fb542b", opera: "#ff1b2d",
};

function browserColor(name: string) {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(BROWSER_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "#6b7188";
}

function browserLetter(name: string) {
  return name.charAt(0).toUpperCase();
}

export default function Sidebar({ deviceId, selectedProfile, onSelectProfile }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [browsers, setBrowsers] = useState<Record<string, { id: string; name: string; profiles: { id: string; name: string }[] }[]>>({});
  const [openDevices, setOpenDevices] = useState<Record<string, boolean>>({});
  const [openBrowsers, setOpenBrowsers] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    try {
      const devs = await getDevices();
      setDevices(devs);
      // Birinchi online qurilmani oching
      const first = devs.find(d => !d.revoked);
      if (first) setOpenDevices(o => ({ ...o, [first.id]: true }));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Brauzerlar va profillarni agent orqali yuklash
  const loadBrowsers = useCallback(async (dev: Device) => {
    if (browsers[dev.id]) return;
    if (!dev.scopes.includes("browser.discovery")) return;
    try {
      const { payload } = await fetch(`/api/v1/devices/${dev.id}/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "BROWSER_LIST_REQUEST", params: {} }),
      }).then(r => r.json());

      const browserList: { id: string; name: string }[] = payload?.items ?? [];
      const withProfiles: typeof browsers[string] = [];

      for (const b of browserList.slice(0, 10)) {
        try {
          const pr = await fetch(`/api/v1/devices/${dev.id}/query`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "PROFILE_LIST_REQUEST", params: { browser_id: b.id } }),
          }).then(r => r.json());
          withProfiles.push({ id: b.id, name: b.name, profiles: pr.payload?.items ?? [] });
        } catch {
          withProfiles.push({ id: b.id, name: b.name, profiles: [] });
        }
      }
      setBrowsers(prev => ({ ...prev, [dev.id]: withProfiles }));
    } catch {/* ignore */}
  }, [browsers]);

  const toggleDevice = (dev: Device) => {
    const willOpen = !openDevices[dev.id];
    setOpenDevices(o => ({ ...o, [dev.id]: willOpen }));
    if (willOpen) loadBrowsers(dev);
  };

  const q = query.toLowerCase();

  return (
    <aside className="side" aria-label="Qurilmalar">
      <div className="brand">WebBrothers</div>
      <div className="srch">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Qurilma yoki profil qidirish…" />
      </div>

      {loading ? (
        <div style={{ padding: 20 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : devices.length === 0 ? (
        <p className="muted" style={{ padding: "0 8px", fontSize: 13 }}>Qurilma topilmadi. Agent o'rnating.</p>
      ) : (
        devices.filter(d => !d.revoked).map((dev, i) => {
          const isOnline = dev.last_seen_at
            ? new Date().getTime() - new Date(dev.last_seen_at).getTime() < 60000
            : false;
          const isOpen = openDevices[dev.id] ?? false;
          const devBrowsers = browsers[dev.id] ?? [];

          return (
            <div key={dev.id}>
              {i > 0 && <div className="sep" />}
              <button className="tree-row" onClick={() => toggleDevice(dev)}>
                <svg className={`chev${isOpen ? " open" : ""}`} viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
                <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="11" rx="1.5" /><path d="M2 20h20" /></svg>
                <span>
                  {dev.display_name}
                  <small>
                    <span className={`dot${isOnline ? " on" : ""}`} />
                    {isOnline ? "Onlayn" : "Oflayn"}
                  </small>
                </span>
              </button>

              {isOpen && (
                <div className="tree-kids">
                  {devBrowsers.length === 0 && (
                    <p className="muted" style={{ padding: "4px 8px", fontSize: 12 }}>
                      {dev.scopes.includes("browser.discovery") ? "Yuklanmoqda…" : "Ruxsat yo'q"}
                    </p>
                  )}
                  {devBrowsers.map(b => {
                    const color = browserColor(b.name);
                    const isOpenBr = openBrowsers[b.id] ?? false;
                    const filteredProfiles = b.profiles.filter(p =>
                      !q || (p.name + b.name + dev.display_name).toLowerCase().includes(q)
                    );
                    if (q && filteredProfiles.length === 0) return null;
                    return (
                      <div key={b.id}>
                        <button className="tree-row" onClick={() => setOpenBrowsers(o => ({ ...o, [b.id]: !o[b.id] }))}>
                          <svg className={`chev${isOpenBr ? " open" : ""}`} viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
                          <span className="ico" style={{ background: color }} />
                          {b.name}
                        </button>
                        {isOpenBr && (
                          <div className="tree-kids">
                            {filteredProfiles.map(p => {
                              const isSel = selectedProfile?.profile_id === p.id && selectedProfile?.browser_id === b.id;
                              return (
                                <button
                                  key={p.id}
                                  className={`tree-row${isSel ? " sel" : ""}`}
                                  onClick={() => onSelectProfile({ browser_id: b.id, browser_name: b.name, browser_color: color, profile_id: p.id, profile_name: p.name })}
                                >
                                  <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
                                  {p.name}
                                </button>
                              );
                            })}
                            {filteredProfiles.length === 0 && (
                              <p className="muted" style={{ padding: "4px 8px", fontSize: 12 }}>Profil topilmadi</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </aside>
  );
}
