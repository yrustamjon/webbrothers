import { useState, useEffect, useRef } from "react";
import { type Device, type InstallerItem, type ReleaseItem, streamQuery } from "./api";
import type { NavPage } from "./App";

interface Props {
  devices: Device[];
  userEmail: string;
  installers: InstallerItem[];
  releases: ReleaseItem[];
  onNavigate: (page: NavPage) => void;
  onSelectDevice: (device: Device) => void;
  onOpenPairModal: () => void;
}

function detectOS() {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  const isMac = ua.includes("mac");
  const isWin = ua.includes("win");
  const isArm = ua.includes("arm") || (isMac && typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  return {
    platform: isMac ? "darwin" : isWin ? "windows" : "linux",
    arch: isArm ? "arm64" : "amd64",
    label: isMac ? (isArm ? "macOS (Apple Silicon)" : "macOS (Intel)") : isWin ? "Windows (x64)" : "Linux",
  };
}

function fmt(bps: number) {
  if (bps >= 1_000_000) return (bps / 1_000_000).toFixed(1) + " MB/s";
  if (bps >= 1_000) return (bps / 1_000).toFixed(0) + " KB/s";
  return bps + " B/s";
}

const N = 30;

export default function Dashboard({
  devices,
  userEmail,
  installers,
  releases,
  onNavigate,
  onSelectDevice,
  onOpenPairModal,
}: Props) {
  const [dlArr, setDlArr] = useState<number[]>(Array(N).fill(0));
  const [ulArr, setUlArr] = useState<number[]>(Array(N).fill(0));
  const [currentDl, setCurrentDl] = useState("0 B/s");
  const [currentUl, setCurrentUl] = useState("0 B/s");
  const abortRef = useRef<AbortController | null>(null);

  const activeDevice = devices.find(d => !d.revoked && d.last_seen_at && (Date.now() - new Date(d.last_seen_at).getTime() < 120000));
  const latestVersion = installers[0]?.version || releases[0]?.version || "0.1.8";
  const userOS = detectOS();
  const matchedInstaller = installers.find(i => i.platform === userOS.platform && i.architecture === userOS.arch) || installers[0];

  useEffect(() => {
    if (!activeDevice) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    (async () => {
      try {
        for await (const frame of streamQuery<{ payload?: { items?: { download_bps?: number; upload_bps?: number }[] } }>(
          activeDevice.id,
          "TRAFFIC_STATS_REQUEST",
          { sample_count: 10 },
          signal
        )) {
          const samples = frame.payload?.items ?? [];
          for (const s of samples) {
            const dl = s.download_bps ?? 0;
            const ul = s.upload_bps ?? 0;
            setDlArr(prev => [...prev.slice(1), dl]);
            setUlArr(prev => [...prev.slice(1), ul]);
            setCurrentDl(fmt(dl));
            setCurrentUl(fmt(ul));
          }
        }
      } catch {
        /* aborted */
      }
    })();

    return () => abortRef.current?.abort();
  }, [activeDevice?.id]);

  // Mini SVG points
  const mx = Math.max(...dlArr, ...ulArr, 512);
  const pts = (arr: number[]) =>
    arr.map((v, i) => [i * (240 / (N - 1)), 60 - (v / mx) * 55] as [number, number]);
  const L = (p: [number, number][]) => "M" + p.map(q => q.map(n => n.toFixed(1)).join(",")).join("L");
  const dPts = pts(dlArr);
  const uPts = pts(ulArr);

  const onlineCount = devices.filter(d => !d.revoked && d.last_seen_at && (Date.now() - new Date(d.last_seen_at).getTime() < 120000)).length;
  const monitoringCount = devices.filter(d => !d.revoked && !d.monitoring_paused).length;

  return (
    <div>
      {/* Salohiyat / Header */}
      <div className="toolbar">
        <div>
          <h2>Boshqaruv paneli</h2>
          <span className="muted">Xush kelibsiz, <b>{userEmail}</b>. Tizim holati barqaror.</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onOpenPairModal}>
            + Yangi qurilma ulash
          </button>
        </div>
      </div>

      {/* KPI Kartalari */}
      <div className="panel-grid">
        <div className="panel">
          <div className="muted">Jami qurilmalar</div>
          <div className="big">{devices.length}</div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
            Hisobingizga biriktirilgan kompyuterlar
          </div>
        </div>

        <div className="panel">
          <div className="muted">Faol (Online)</div>
          <div className="big" style={{ color: onlineCount > 0 ? "var(--ok)" : "inherit" }}>
            {onlineCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
            Hozirda tarmoqqa ulangan agentlar
          </div>
        </div>

        <div className="panel">
          <div className="muted">Kuzatuv holati</div>
          <div className="big" style={{ color: "var(--ac)" }}>
            {monitoringCount} / {devices.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
            Monitoringi faollashtirilgan
          </div>
        </div>

        <div className="panel">
          <div className="muted">Xavfsizlik & Ruxsatlar</div>
          <div className="big" style={{ color: "var(--ok)" }}>
            Himoyalangan
          </div>
          <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>
            TLS 1.3 & mTLS shifrlash
          </div>
        </div>
      </div>

      {/* Jonli mini monitoring & Tezkor holat */}
      {activeDevice && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>Jonli tarmoq trafigi — {activeDevice.display_name}</h3>
              <span className="muted" style={{ fontSize: 12 }}>
                OS: {activeDevice.operating_system} ({activeDevice.architecture})
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--dl)", marginRight: 6 }} />
                Yuklanish: <b>{currentDl}</b>
              </span>
              <span style={{ fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--ul)", marginRight: 6 }} />
                Uzatilish: <b>{currentUl}</b>
              </span>
              <button className="mini" onClick={() => onSelectDevice(activeDevice)}>
                To'liq ko'rish →
              </button>
            </div>
          </div>

          <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 14px", height: 80, display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 240 60" style={{ width: "100%", height: "100%", overflow: "visible" }} preserveAspectRatio="none">
              <path d={L(dPts)} fill="none" stroke="var(--dl)" strokeWidth="2" />
              <path d={L(uPts)} fill="none" stroke="var(--ul)" strokeWidth="2" />
            </svg>
          </div>
        </div>
      )}

      {/* Birorta ham qurilma ulanmagan bo'lsa: Chiroyli Banner */}
      {devices.length === 0 && (
        <div className="panel" style={{ padding: 32, textAlign: "center", marginBottom: 20 }}>
          <div style={{ maxWidth: 540, margin: "0 auto" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--acs)", color: "var(--ac)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
              <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            </div>
            <h2 style={{ margin: "0 0 10px" }}>WebBrothers tizimiga xush kelibsiz!</h2>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              Kompyuteringiz brauzerlari (Chrome, Safari, Edge, Firefox), xavfsiz loginlar inventarizatsiyasi va tarmoq trafigini kuzatish uchun agent dasturini o'rnating.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {matchedInstaller && (
                <a href={matchedInstaller.download_url} target="_blank" rel="noreferrer" className="btn">
                  📥 {userOS.label} uchun yuklab olish (v{matchedInstaller.version})
                </a>
              )}
              <button className="btn ghost" onClick={onOpenPairModal}>
                + Kod orqali ulash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ulangan kompyuterlar ro'yxati */}
      {devices.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Ulangan qurilmalar ({devices.length})</h3>
            <button className="btn sm ghost" onClick={() => onNavigate("Qurilmalar")}>
              Barchasini boshqarish →
            </button>
          </div>

          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Qurilma</th>
                  <th>Operatsion tizim</th>
                  <th>Holati</th>
                  <th>Versiya</th>
                  <th>So'nggi faollik</th>
                  <th className="r">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => {
                  const isOnline = !d.revoked && d.last_seen_at && (Date.now() - new Date(d.last_seen_at).getTime() < 120000);
                  const isOutdated = d.version && d.version !== latestVersion;
                  return (
                    <tr key={d.id}>
                      <td>
                        <b>{d.display_name}</b>
                        {d.monitoring_paused && <span className="tag off" style={{ marginLeft: 6 }}>To'xtatilgan</span>}
                      </td>
                      <td>{d.operating_system} / {d.architecture}</td>
                      <td>
                        {d.revoked ? (
                          <span className="tag off">Bekor qilingan</span>
                        ) : isOnline ? (
                          <span className="tag ok">● Onlayn</span>
                        ) : (
                          <span className="tag" style={{ background: "var(--bg2)", color: "var(--mut)" }}>Oflayn</span>
                        )}
                      </td>
                      <td>
                        <span>v{d.version || latestVersion}</span>
                        {isOutdated && (
                          <span className="tag off" style={{ marginLeft: 6, fontSize: 11 }}>
                            ⚠️ Yangilanish mavjud
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--mut)" }}>
                        {d.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="r">
                        <button className="mini" onClick={() => onSelectDevice(d)}>
                          Brauzerlarni ochish
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tezkor Harakatlar */}
      <div className="panel">
        <h3 style={{ margin: "0 0 12px" }}>Tezkor bo'limlar</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div
            onClick={() => onNavigate("Qurilmalar")}
            style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", background: "var(--bg2)" }}
          >
            <b>🖥️ Qurilmalar va Brauzerlar</b>
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Tarix, saqlangan loginlar va tarmoq ulanishlari</p>
          </div>
          <div
            onClick={() => onNavigate("Statistika")}
            style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", background: "var(--bg2)" }}
          >
            <b>📊 Qurilmalar boshqaruvi</b>
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Ruxsatlar, yangilashlar va distributivlar</p>
          </div>
          <div
            onClick={() => onNavigate("Xavfsizlik")}
            style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", background: "var(--bg2)" }}
          >
            <b>🛡️ Xavfsizlik auditi</b>
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Barcha harakatlar va seanslar jurnali</p>
          </div>
          <div
            onClick={() => onNavigate("Sozlamalar")}
            style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", background: "var(--bg2)" }}
          >
            <b>⚙️ Tizim sozlamalari</b>
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Parolni o'zgartirish va profil sozlamalari</p>
          </div>
        </div>
      </div>
    </div>
  );
}
