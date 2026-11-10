import { useState, useEffect, useCallback } from "react";
import {
  getDevices,
  setMonitoring,
  revokeDevice,
  deleteDevice,
  updateScopes,
  approvePairing,
  getSessions,
  revokeSession,
  getAudit,
  getReleases,
  type Device,
  type UserSession,
  type AuditEvent,
  type ReleaseItem,
  type Me,
} from "./api";

const ALL_SCOPES = [
  { id: "browser.discovery", name: "Brauzerlarni aniqlash", desc: "Mavjud brauzerlar va ularning yo'llarini aniqlash" },
  { id: "profile.discovery", name: "Profillarni aniqlash", desc: "Brauzer profillari ro'yxatini olish" },
  { id: "history.read", name: "Tarixni o'qish", desc: "Brauzer ko'rishlar tarixini o'qish" },
  { id: "login.inventory", name: "Login metama'lumotlari", desc: "Saqlangan login va hisob ma'lumotlari" },
  { id: "traffic.aggregate", name: "Umumiy trafik", desc: "Download va upload tezligi monitoringi" },
  { id: "traffic.connections", name: "Faol ulanishlar", desc: "Tarmoq ulanishlari metama'lumotlari" },
  { id: "traffic.http", name: "HTTP hodisalari", desc: "HTTP so'rovlar metama'lumotlari" },
];

interface Props {
  page: "Statistika" | "Xavfsizlik" | "Foydalanuvchilar" | "Sozlamalar" | "Yordam";
  currentUser: Me;
  onToast: (m: string, err?: boolean) => void;
  onRefreshDevices?: () => void;
}

export default function ManagementPage({ page, currentUser, onToast, onRefreshDevices }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Pairing Modal state
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "browser.discovery",
    "profile.discovery",
    "history.read",
    "traffic.aggregate",
  ]);

  // Scopes editor modal
  const [scopeDevice, setScopeDevice] = useState<Device | null>(null);
  const [editScopes, setEditScopes] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (page === "Statistika" || page === "Xavfsizlik") {
        const devs = await getDevices();
        setDevices(devs);
      }
      if (page === "Xavfsizlik") {
        const aud = await getAudit();
        setAudits(aud);
      }
      if (page === "Foydalanuvchilar") {
        const sess = await getSessions();
        setSessions(sess);
      }
      if (page === "Sozlamalar") {
        const rels = await getReleases().catch(() => []);
        setReleases(rels);
      }
    } catch (err: unknown) {
      onToast((err as Error).message || "Ma'lumotlarni yuklashda xatolik", true);
    } finally {
      setLoading(false);
    }
  }, [page, onToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions for devices
  const handleToggleMonitoring = async (d: Device) => {
    try {
      await setMonitoring(d.id, !d.monitoring_paused);
      setDevices(prev => prev.map(x => x.id === d.id ? { ...x, monitoring_paused: !x.monitoring_paused } : x));
      onToast(d.monitoring_paused ? "Kuzatuv qayta tiklandi" : "Kuzatuv to'xtatildi");
      onRefreshDevices?.();
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik yuz berdi", true);
    }
  };

  const handleRevoke = async (d: Device) => {
    if (!confirm(`"${d.display_name}" qurilmasining kirish huquqi bekor qilinsinmi?`)) return;
    try {
      await revokeDevice(d.id);
      setDevices(prev => prev.map(x => x.id === d.id ? { ...x, revoked: true } : x));
      onToast("Qurilma huquqi bekor qilindi");
      onRefreshDevices?.();
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik", true);
    }
  };

  const handleDelete = async (d: Device) => {
    if (!confirm(`"${d.display_name}" qurilmasi butunlay o'chirilsinmi?`)) return;
    try {
      await deleteDevice(d.id);
      setDevices(prev => prev.filter(x => x.id !== d.id));
      onToast("Qurilma o'chirildi");
      onRefreshDevices?.();
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik", true);
    }
  };

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode.trim()) return;
    try {
      await approvePairing(pairingCode.trim().toUpperCase(), selectedScopes);
      onToast("Qurilma muvaffaqiyatli ulandi!");
      setShowPairModal(false);
      setPairingCode("");
      loadData();
      onRefreshDevices?.();
    } catch (err: unknown) {
      onToast((err as Error).message || "Ulash kodi noto'g'ri yoki eskirgan", true);
    }
  };

  const handleSaveScopes = async () => {
    if (!scopeDevice) return;
    try {
      await updateScopes(scopeDevice.id, editScopes);
      setDevices(prev => prev.map(x => x.id === scopeDevice.id ? { ...x, scopes: editScopes } : x));
      onToast("Ruxsatlar yangilandi");
      setScopeDevice(null);
      onRefreshDevices?.();
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik", true);
    }
  };

  const handleRevokeSession = async (sid: string) => {
    try {
      await revokeSession(sid);
      setSessions(prev => prev.filter(s => s.id !== sid));
      onToast("Sessiya yakunlandi");
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik", true);
    }
  };

  return (
    <div>
      {/* ----------------- STATISTIKA ----------------- */}
      {page === "Statistika" && (
        <>
          <div className="panel-grid">
            <div className="panel">
              <div className="muted">Jami qurilmalar</div>
              <div className="big">{devices.length}</div>
            </div>
            <div className="panel">
              <div className="muted">Faol (online)</div>
              <div className="big">
                {devices.filter(d => !d.revoked && d.last_seen_at && (Date.now() - new Date(d.last_seen_at).getTime() < 60000)).length}
              </div>
            </div>
            <div className="panel">
              <div className="muted">Bekor qilingan</div>
              <div className="big">{devices.filter(d => d.revoked).length}</div>
            </div>
            <div className="panel">
              <div className="muted">Faol monitoring</div>
              <div className="big">{devices.filter(d => !d.revoked && !d.monitoring_paused).length}</div>
            </div>
          </div>

          <div className="toolbar">
            <h2>Qurilmalar ro'yxati</h2>
            <button className="btn" onClick={() => setShowPairModal(true)}>
              ＋ Agentni ulash (Pairing)
            </button>
          </div>

          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Qurilma</th>
                  <th>Operatsion tizim</th>
                  <th>Holat</th>
                  <th>Monitoring</th>
                  <th>Oxirgi aloqa</th>
                  <th className="r">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">Hozircha ulangan qurilmalar yo'q. "+ Agentni ulash" tugmasini bosing.</div>
                    </td>
                  </tr>
                ) : (
                  devices.map(d => {
                    const isOnline = !d.revoked && d.last_seen_at
                      ? (Date.now() - new Date(d.last_seen_at).getTime() < 60000)
                      : false;
                    return (
                      <tr key={d.id}>
                        <td>
                          <b>{d.display_name}</b>
                          <small style={{ display: "block", color: "var(--mut)" }}>{d.architecture}</small>
                        </td>
                        <td>{d.operating_system}</td>
                        <td>
                          {d.revoked ? (
                            <span className="tag off">Bekor qilingan</span>
                          ) : isOnline ? (
                            <span className="tag ok">Onlayn</span>
                          ) : (
                            <span className="tag">Oflayn</span>
                          )}
                        </td>
                        <td>
                          {d.revoked ? (
                            <span className="muted">—</span>
                          ) : d.monitoring_paused ? (
                            <span className="tag off">To'xtatilgan</span>
                          ) : (
                            <span className="tag ok">Faol</span>
                          )}
                        </td>
                        <td>
                          {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("uz-UZ") : "—"}
                        </td>
                        <td>
                          <div className="data-actions">
                            {!d.revoked && (
                              <>
                                <button className="mini" onClick={() => handleToggleMonitoring(d)}>
                                  {d.monitoring_paused ? "Tiklash" : "To'xtatish"}
                                </button>
                                <button
                                  className="mini"
                                  onClick={() => {
                                    setScopeDevice(d);
                                    setEditScopes(d.scopes || []);
                                  }}
                                >
                                  Ruxsatlar
                                </button>
                                <button className="mini danger" onClick={() => handleRevoke(d)}>
                                  Bekor qilish
                                </button>
                              </>
                            )}
                            <button className="mini danger" onClick={() => handleDelete(d)}>
                              O'chirish
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ----------------- FOYDALANUVCHILAR ----------------- */}
      {page === "Foydalanuvchilar" && (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h3>Joriy akkaunt</h3>
            <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap" }}>
              <div>
                <span className="muted" style={{ display: "block" }}>Email:</span>
                <b>{currentUser.email}</b>
              </div>
              <div>
                <span className="muted" style={{ display: "block" }}>Holat:</span>
                <span className={`tag ${currentUser.verified ? "ok" : ""}`}>
                  {currentUser.verified ? "Tasdiqlangan" : "Tasdiqlanmagan"}
                </span>
              </div>
              <div>
                <span className="muted" style={{ display: "block" }}>ID:</span>
                <code>{currentUser.id}</code>
              </div>
            </div>
          </div>

          <div className="toolbar">
            <h2>Faol sessiyalar</h2>
          </div>

          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Sessiya ID</th>
                  <th>Muddati</th>
                  <th>Joriy holat</th>
                  <th className="r">Amal</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={4}><div className="empty">Sessiyalar topilmadi</div></td>
                  </tr>
                ) : (
                  sessions.map(s => (
                    <tr key={s.id}>
                      <td><code>{s.id.slice(0, 16)}…</code></td>
                      <td>{new Date(s.expires_at).toLocaleString("uz-UZ")}</td>
                      <td>
                        {s.current ? (
                          <span className="tag ok">Ushbu brauzer</span>
                        ) : (
                          <span className="tag">Boshqa qurilma</span>
                        )}
                      </td>
                      <td className="r">
                        {!s.current && (
                          <button className="mini danger" onClick={() => handleRevokeSession(s.id)}>
                            Yakunlash
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ----------------- XAVFSIZLIK ----------------- */}
      {page === "Xavfsizlik" && (
        <>
          <div className="toolbar">
            <h2>Ma'lumotlar ruxsatlari (Scopes)</h2>
          </div>
          <div className="panel-grid">
            {ALL_SCOPES.map(sc => (
              <div key={sc.id} className="panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <h3>{sc.name}</h3>
                  <code>{sc.id}</code>
                </div>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{sc.desc}</p>
              </div>
            ))}
          </div>

          <div className="toolbar" style={{ marginTop: 24 }}>
            <h2>Xavfsizlik auditi (Oxirgi 100 ta hodisa)</h2>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Vaqt</th>
                  <th>Amal / Hodisa</th>
                  <th>Qurilma ID</th>
                </tr>
              </thead>
              <tbody>
                {audits.length === 0 ? (
                  <tr>
                    <td colSpan={3}><div className="empty">Hodisalar topilmadi</div></td>
                  </tr>
                ) : (
                  audits.map((a, i) => (
                    <tr key={i}>
                      <td>{new Date(a.created_at).toLocaleString("uz-UZ")}</td>
                      <td><b>{a.action}</b></td>
                      <td>{a.device_id ? <code>{a.device_id}</code> : <span className="muted">—</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ----------------- SOZLAMALAR ----------------- */}
      {page === "Sozlamalar" && (
        <>
          <div className="panel" style={{ maxWidth: 700, marginBottom: 20 }}>
            <h3>Imzolangan agent distributivlari</h3>
            <p className="muted" style={{ marginBottom: 16 }}>
              Kuzatuv agentini operatsion tizimingizga yuklab olib o'rnating.
            </p>
            {releases.length === 0 ? (
              <div className="placeholder-note">
                Hozircha serverda yuklangan rasmiy agent relizlari mavjud emas yoki ishlab chiquvchi rejimida ishlamoqda.
              </div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Platforma</th>
                      <th>Arxitektura</th>
                      <th>Versiya</th>
                      <th className="r">Yuklab olish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((rel, i) => (
                      <tr key={i}>
                        <td><b>{rel.platform}</b></td>
                        <td>{rel.architecture}</td>
                        <td>{rel.version}</td>
                        <td className="r">
                          <a href={rel.download_url} download className="btn sm">
                            Yuklab olish
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel" style={{ maxWidth: 700 }}>
            <h3>Xavfsizlik va maxfiylik siyosati</h3>
            <p className="muted">
              • Brauzer tarixi, hisob ma'lumotlari, trafik va parollar markaziy bazaga saqlanmaydi.<br />
              • Barcha ma'lumotlar to'g'ridan-to'g'ri agentdan shifrlangan kanal orqali bir martalik oqimda keladi.<br />
              • Har qanday paytda qurilmani to'xtatishingiz yoki o'chirishingiz mumkin.
            </p>
          </div>
        </>
      )}

      {/* ----------------- YORDAM ----------------- */}
      {page === "Yordam" && (
        <div style={{ maxWidth: 840 }}>
          <div className="panel-grid">
            <div className="panel">
              <h3>1. Agentni o'rnatish</h3>
              <p className="muted">
                Sozlamalar bo'limidan yoki <code>agent/</code> paketidan operatsion tizimingizga (macOS, Windows, Linux) mos agentni ishga tushiring.
              </p>
            </div>
            <div className="panel">
              <h3>2. Bir martalik kod (Pairing)</h3>
              <p className="muted">
                Agent ishga tushganda konsolda 8-12 xonali pairing kodini beradi. Uni "Statistika &gt; Agentni ulash" bo'limiga kiriting.
              </p>
            </div>
            <div className="panel">
              <h3>3. Ruxsatlarni tanlash</h3>
              <p className="muted">
                Qurilmaga qaysi ruxsatlar (tarix, loginlar, trafik) berilishini o'zingiz belgilaysiz. Ruxsat berilmagan ma'lumotlarga kirish bloklanadi.
              </p>
            </div>
            <div className="panel">
              <h3>4. Jonli monitoring</h3>
              <p className="muted">
                Qurilmalar bo'limida brauzerlar va profillar avtomatik ko'rinadi. Jonli tezlik va loginlar real agent orqali keladi.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pairing Modal */}
      {showPairModal && (
        <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowPairModal(false); }}>
          <div className="dialog">
            <h2>Agentni ulash (Pairing)</h2>
            <p className="muted">
              Agent dasturingiz ko'rsatgan bir martalik kodni kiriting va qurilmaga beriladigan ruxsatlarni tanlang.
            </p>
            <form onSubmit={handlePairSubmit}>
              <label className="form-field">
                Pairing kodi
                <input
                  required
                  placeholder="Masalan: ABCD-1234"
                  value={pairingCode}
                  onChange={e => setPairingCode(e.target.value)}
                  style={{ textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, fontSize: 16 }}
                />
              </label>

              <div style={{ marginTop: 14 }}>
                <span style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>Beriladigan ruxsatlar:</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ALL_SCOPES.map(sc => {
                    const checked = selectedScopes.includes(sc.id);
                    return (
                      <label key={sc.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          className="switch"
                          checked={checked}
                          onChange={() => {
                            setSelectedScopes(prev =>
                              checked ? prev.filter(x => x !== sc.id) : [...prev, sc.id]
                            );
                          }}
                        />
                        <div>
                          <b>{sc.name}</b>
                          <small style={{ display: "block", color: "var(--mut)" }}>{sc.id}</small>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="dialog-buttons">
                <button type="button" className="btn o" onClick={() => setShowPairModal(false)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn">
                  Tasdiqlash va ulash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scopes Edit Modal */}
      {scopeDevice && (
        <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) setScopeDevice(null); }}>
          <div className="dialog">
            <h2>Ruxsatlarni o'zgartirish</h2>
            <p className="muted">
              <b>{scopeDevice.display_name}</b> uchun ruxsatlar doirasi:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "16px 0" }}>
              {ALL_SCOPES.map(sc => {
                const checked = editScopes.includes(sc.id);
                return (
                  <label key={sc.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      className="switch"
                      checked={checked}
                      onChange={() => {
                        setEditScopes(prev =>
                          checked ? prev.filter(x => x !== sc.id) : [...prev, sc.id]
                        );
                      }}
                    />
                    <div>
                      <b>{sc.name}</b>
                      <small style={{ display: "block", color: "var(--mut)" }}>{sc.desc}</small>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="dialog-buttons">
              <button type="button" className="btn o" onClick={() => setScopeDevice(null)}>
                Bekor qilish
              </button>
              <button type="button" className="btn" onClick={handleSaveScopes}>
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
