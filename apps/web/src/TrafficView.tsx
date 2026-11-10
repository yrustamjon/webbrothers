import { useState, useEffect, useRef } from "react";
import type { Profile } from "./Sidebar";

interface TrafficSample {
  download_bps?: number;
  upload_bps?: number;
  timestamp?: string;
}

interface Connection {
  remote_address?: string;
  remote_port?: number;
  protocol?: string;
  browser?: string;
  created_at?: string;
}

const N = 60;

function fmt(bps: number) {
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(1) + " MB/s";
  if (bps >= 1_000) return (bps / 1_000).toFixed(0) + " KB/s";
  return bps + " B/s";
}

function fmtTotal(bytes: number) {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + " GB";
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

export default function TrafficView({ deviceId, profile }: { deviceId: string; profile?: Profile }) {
  const [dlArr, setDlArr] = useState<number[]>(Array(N).fill(0));
  const [ulArr, setUlArr] = useState<number[]>(Array(N).fill(0));
  const [liveStats, setLiveStats] = useState({ dl: "—", ul: "—", tdl: "—", tul: "—" });
  const [conns, setConns] = useState<Connection[]>([]);
  const [running, setRunning] = useState(true);
  const [connTab, setConnTab] = useState<"traffic" | "connections" | "http">("traffic");
  const abortRef = useRef<AbortController | null>(null);
  const totalDl = useRef(0);
  const totalUl = useRef(0);

  // Trafik stream
  useEffect(() => {
    if (!running) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    (async () => {
      try {
        const res = await fetch(`/api/v1/devices/${deviceId}/stream`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "TRAFFIC_STATS_REQUEST",
            params: { stream: true, sample_count: 20, interval_ms: 1000 },
          }),
          signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const frame = JSON.parse(line) as { payload?: { items?: TrafficSample[] } };
            const samples = frame.payload?.items ?? [];
            for (const s of samples) {
              const dl = s.download_bps ?? 0;
              const ul = s.upload_bps ?? 0;
              totalDl.current += dl;
              totalUl.current += ul;
              setDlArr(prev => [...prev.slice(1), dl]);
              setUlArr(prev => [...prev.slice(1), ul]);
              setLiveStats({
                dl: fmt(dl), ul: fmt(ul),
                tdl: fmtTotal(totalDl.current),
                tul: fmtTotal(totalUl.current),
              });
            }
          }
        }
      } catch { /* stream ended or aborted */ }
    })();

    return () => abortRef.current?.abort();
  }, [deviceId, running]);

  // Connections
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/devices/${deviceId}/query`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "CONNECTIONS_QUERY", params: { page_size: 50 } }),
        });
        const data = await res.json();
        setConns(data.payload?.items ?? []);
      } catch { /* ignore */ }
    })();
  }, [deviceId]);

  // SVG chart
  const mx = Math.max(...dlArr, ...ulArr, 1024);
  const pts = (arr: number[]) =>
    arr.map((v, i) => [40 + i * (750 / (N - 1)), 210 - (v / mx) * 190] as [number, number]);
  const L = (p: [number, number][]) => "M" + p.map(q => q.map(n => n.toFixed(1)).join(",")).join("L");
  const dPts = pts(dlArr);
  const uPts = pts(ulArr);
  const gridVals = [0, mx * 0.33, mx * 0.66, mx].map(v => ({ y: 210 - (v / mx) * 190, label: fmt(v) }));

  return (
    <section>
      <div className="seg">
        {(["traffic", "connections", "http"] as const).map(t => (
          <button key={t} className={connTab === t ? "on" : ""} onClick={() => setConnTab(t)}>
            {t === "traffic" ? "Umumiy trafik" : t === "connections" ? "Ulanishlar" : "HTTP"}
          </button>
        ))}
      </div>

      {!profile && <p className="note">ⓘ Qurilma darajasida · Profil tanlanmagan</p>}

      <div className="cards">
        <div className="card"><div className="ci"><svg viewBox="0 0 24 24"><path d="M12 4v12m-5-5 5 5 5-5M5 20h14" /></svg></div><div><small>Download</small><b>{liveStats.dl}</b></div></div>
        <div className="card"><div className="ci"><svg viewBox="0 0 24 24"><path d="M12 20V8m-5 5 5-5 5 5M5 4h14" /></svg></div><div><small>Upload</small><b>{liveStats.ul}</b></div></div>
        <div className="card"><div className="ci"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3 3 7 3s7-1.3 7-3" /></svg></div><div><small>Jami qabul</small><b>{liveStats.tdl}</b></div></div>
        <div className="card"><div className="ci"><svg viewBox="0 0 24 24"><path d="M12 15V4m-4 4 4-4 4 4M4 15v5h16v-5" /></svg></div><div><small>Jami yuborildi</small><b>{liveStats.tul}</b></div></div>
      </div>

      <div className="box">
        <div className="bh">
          <h3>Jonli tezlik</h3><span>(oxirgi 60 soniya)</span>
          <span className="gap" />
          <span className="pill" style={{ opacity: running ? 1 : 0.6 }}>
            <i />{running ? "Jonli" : "To'xtatilgan"}
          </span>
          <button className="btn o" onClick={() => setRunning(r => !r)}>
            {running ? "■ To'xtatish" : "▶ Davom ettirish"}
          </button>
        </div>
        <svg viewBox="0 0 800 240" preserveAspectRatio="none" style={{ width: "100%", height: 240, display: "block" }}>
          {gridVals.map((g, i) => (
            <g key={i}>
              <line x1="40" x2="790" y1={g.y} y2={g.y} stroke="var(--line)" />
              <text x="34" y={g.y + 4} textAnchor="end" fontSize="10" fill="var(--mut)">{g.label}</text>
            </g>
          ))}
          <path d={`${L(dPts)}L790,210L40,210Z`} fill="var(--dl)" opacity="0.14" />
          <path d={L(dPts)} fill="none" stroke="var(--dl)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
          <path d={L(uPts)} fill="none" stroke="var(--ul)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="leg">
          <span><i style={{ background: "var(--dl)" }} />Download</span>
          <span><i style={{ background: "var(--ul)" }} />Upload</span>
        </div>
      </div>

      <div className="box">
        <div className="bh"><h3>Kuzatilgan ulanishlar</h3><span className="gap" /></div>
        <div className="tw" style={{ border: 0 }}>
          <table>
            <thead><tr><th>Manzil</th><th>Port</th><th>Protokol</th><th>Brauzer</th><th>Vaqt</th></tr></thead>
            <tbody>
              {conns.length === 0
                ? <tr><td colSpan={5}><div className="empty">Ulanish topilmadi</div></td></tr>
                : conns.map((c, i) => (
                  <tr key={i}>
                    <td>🌐 {c.remote_address ?? "—"}</td>
                    <td>{c.remote_port ?? "—"}</td>
                    <td>{c.protocol ?? "—"}</td>
                    <td>{c.browser ?? "—"}</td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleTimeString() : "—"}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
