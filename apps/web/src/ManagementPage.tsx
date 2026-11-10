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
  getInstallers,
  changePassword,
  type Device,
  type UserSession,
  type AuditEvent,
  type ReleaseItem,
  type InstallerItem,
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

function detectUserOS() {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  const isMac = ua.includes("mac");
  const isWin = ua.includes("win");
  const isArm = ua.includes("arm") || (isMac && typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const platform = isMac ? "darwin" : isWin ? "windows" : "linux";
  const architecture = isArm ? "arm64" : "amd64";
  const name = isMac ? (isArm ? "macOS (Apple Silicon arm64)" : "macOS (Intel x64)") : isWin ? "Windows (64-bit)" : "Linux";
  return { platform, architecture, name };
}

export default function ManagementPage({ page, currentUser, onToast, onRefreshDevices }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [installers, setInstallers] = useState<InstallerItem[]>([]);
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

  // Re-pair / Update modal state
  const [rePairDevice, setRePairDevice] = useState<Device | null>(null);
  const [rePairCode, setRePairCode] = useState("");
  const [rePairLoading, setRePairLoading] = useState(false);

  // Password change state
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  // System preferences
  const [themePreference, setThemePreference] = useState<"light" | "dark" | "system">(() => {
    const t = typeof document !== "undefined" ? document.documentElement.dataset.theme : "";
    return t === "light" ? "light" : t === "dark" ? "dark" : "system";
  });
  const [soundNotify, setSoundNotify] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

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
      if (page === "Sozlamalar" || page === "Yordam" || page === "Statistika") {
        const rels = await getReleases().catch(() => []);
        setReleases(rels);
        const inst = await getInstallers().catch(() => ({ items: [], status: "unavailable" }));
        setInstallers(inst.items || []);
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

  const handleRePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rePairDevice || !rePairCode.trim()) return;
    setRePairLoading(true);
    try {
      await approvePairing(rePairCode.trim().toUpperCase(), rePairDevice.scopes || [
        "browser.discovery",
        "profile.discovery",
        "history.read",
        "traffic.aggregate",
      ]);
      onToast(`"${rePairDevice.display_name}" qurilmasi yangilandi va muvaffaqiyatli ulandi!`);
      setRePairDevice(null);
      setRePairCode("");
      await loadData();
      onRefreshDevices?.();
    } catch (err: unknown) {
      onToast((err as Error).message || "Qayta ulashda xatolik", true);
    } finally {
      setRePairLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 12) {
      onToast("Yangi parol kamida 12 belgidan iborat bo'lishi kerak", true);
      return;
    }
    if (newPwd !== confirmPwd) {
      onToast("Yangi parollar bir-biriga mos kelmadi", true);
      return;
    }
    setPwdLoading(true);
    try {
      const res = await changePassword(currentPwd, newPwd);
      onToast(res.message || "Parol muvaffaqiyatli yangilandi!");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err: unknown) {
      onToast((err as Error).message || "Parolni o'zgartirishda xatolik", true);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleThemeChange = (mode: "light" | "dark" | "system") => {
    setThemePreference(mode);
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
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
                  <th>Versiya</th>
                  <th>Holat</th>
                  <th>Monitoring</th>
                  <th>Oxirgi aloqa</th>
                  <th className="r">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">Hozircha ulangan qurilmalar yo'q. "+ Agentni ulash" tugmasini bosing.</div>
                    </td>
                  </tr>
                ) : (
                  devices.map(d => {
                    const isOnline = !d.revoked && d.last_seen_at
                      ? (Date.now() - new Date(d.last_seen_at).getTime() < 60000)
                      : false;
                    const latestVer = installers[0]?.version || releases[0]?.version || "0.1.8";
                    const isOutdated = d.version && d.version !== latestVer;
                    const matchedInst = installers.find(
                      i => (i.platform === d.operating_system || (d.operating_system === "macos" && i.platform === "darwin")) &&
                           i.architecture === d.architecture
                    );
                    return (
                      <tr key={d.id}>
                        <td>
                          <b>{d.display_name}</b>
                          <small style={{ display: "block", color: "var(--mut)" }}>{d.architecture}</small>
                        </td>
                        <td>{d.operating_system}</td>
                        <td>
                          <span>v{d.version || latestVer}</span>
                          {isOutdated && (
                            <span className="tag off" style={{ marginLeft: 6, fontSize: 11 }}>
                              ⚠️ Yangilanish mavjud
                            </span>
                          )}
                        </td>
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
                                {matchedInst && (
                                  <a
                                    href={matchedInst.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mini"
                                    title="Yangi versiyani yuklab olish"
                                  >
                                    📥 Agent
                                  </a>
                                )}
                                <button
                                  className="mini"
                                  style={{ color: "var(--ac)" }}
                                  onClick={() => {
                                    setRePairDevice(d);
                                    setRePairCode("");
                                  }}
                                  title="Ushbu kompyuterga yangi agentni bog'lash"
                                >
                                  🔄 Yangilashni tasdiqlash
                                </button>
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

          {/* Distributivlar bloki Statistika sahifasida */}
          <div className="panel" style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Agent yuklab olish paketlari</h3>
              <span className="tag ok">Sizning tizim: {detectUserOS().name}</span>
            </div>
            {installers.length > 0 ? (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Fayl</th>
                      <th>OS</th>
                      <th>Arxitektura</th>
                      <th>Versiya</th>
                      <th className="r">Yuklab olish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installers.map((inst, i) => {
                      const current = detectUserOS();
                      const isMatch = inst.platform === current.platform && inst.architecture === current.architecture;
                      return (
                        <tr key={i} style={isMatch ? { background: "var(--acs)" } : {}}>
                          <td>
                            <b>{inst.filename}</b>
                            {isMatch && <span className="tag ok" style={{ marginLeft: 8 }}>Sizga mos</span>}
                          </td>
                          <td>{inst.platform === "darwin" ? "macOS" : "Windows"}</td>
                          <td>{inst.architecture}</td>
                          <td>v{inst.version}</td>
                          <td className="r">
                            <a href={inst.download_url} target="_blank" rel="noreferrer" className="btn sm">
                              Yuklab olish
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Oxirgi versiya: <b>v0.1.8</b>. Mahalliy sinov uchun <code>./start-local.command</code> dan foydalanishingiz mumkin.
              </p>
            )}
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
        <div style={{ maxWidth: 750, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Profil ma'lumotlari */}
          <div className="panel">
            <h3 style={{ margin: "0 0 14px" }}>Foydalanuvchi profili</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <div>
                <span className="muted" style={{ fontSize: 12 }}>Elektron pochta</span>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{currentUser.email}</div>
              </div>
              <div>
                <span className="muted" style={{ fontSize: 12 }}>Hisob holati</span>
                <div style={{ marginTop: 4 }}>
                  <span className="tag ok">Faol / Tasdiqlangan</span>
                </div>
              </div>
              <div>
                <span className="muted" style={{ fontSize: 12 }}>Roli</span>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>Administrator</div>
              </div>
            </div>
          </div>

          {/* 2. Parolni o'zgartirish */}
          <div className="panel">
            <h3 style={{ margin: "0 0 8px" }}>Parolni o'zgartirish</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Hisobingiz xavfsizligini ta'minlash uchun kuchli paroldan foydalaning (kamida 12 ta belgi).
            </p>
            <form onSubmit={handlePasswordChange} style={{ maxWidth: 450 }}>
              <div className="form-field">
                <label>Joriy parol</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>Yangi parol</label>
                <input
                  type="password"
                  placeholder="Kamida 12 ta belgi"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  required
                  minLength={12}
                />
              </div>

              <div className="form-field">
                <label>Yangi parolni takrorlang</label>
                <input
                  type="password"
                  placeholder="Takror kiriting"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn" disabled={pwdLoading} style={{ marginTop: 12 }}>
                {pwdLoading ? "Saqlanmoqda..." : "Parolni yangilash"}
              </button>
            </form>
          </div>

          {/* 3. Tizim mavzusi */}
          <div className="panel">
            <h3 style={{ margin: "0 0 10px" }}>Interfeys ko'rinishi</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Sayt rang sxemasi va tungi rejim sozlamasi:
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                className={`btn sm ${themePreference === "light" ? "" : "ghost"}`}
                onClick={() => handleThemeChange("light")}
              >
                ☀️ Yorug' (Light)
              </button>
              <button
                type="button"
                className={`btn sm ${themePreference === "dark" ? "" : "ghost"}`}
                onClick={() => handleThemeChange("dark")}
              >
                🌙 Tungi (Dark)
              </button>
              <button
                type="button"
                className={`btn sm ${themePreference === "system" ? "" : "ghost"}`}
                onClick={() => handleThemeChange("system")}
              >
                💻 Tizim bilan birga (System)
              </button>
            </div>
          </div>

          {/* 4. Bildirishnomalar va xavfsizlik preferensiyalari */}
          <div className="panel">
            <h3 style={{ margin: "0 0 14px" }}>Bildirishnomalar va xavfsizlik</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="switch"
                  checked={soundNotify}
                  onChange={e => setSoundNotify(e.target.checked)}
                />
                <div>
                  <b>Ovozli bildirishnomalar</b>
                  <small style={{ display: "block", color: "var(--mut)" }}>
                    Yangi qurilma ulanganda yoki ogohlantirish paytida signal berish
                  </small>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="switch"
                  checked={securityAlerts}
                  onChange={e => setSecurityAlerts(e.target.checked)}
                />
                <div>
                  <b>Xavfsizlik hodisalari bo'yicha ogohlantirish</b>
                  <small style={{ display: "block", color: "var(--mut)" }}>
                    Kutilmagan IP yoki seans aniqlanganda ekranda ogohlantirish
                  </small>
                </div>
              </label>
            </div>
          </div>

          {/* 5. Maxfiylik kafolati */}
          <div className="panel">
            <h3>Xavfsizlik va maxfiylik kafolati</h3>
            <p className="muted" style={{ lineHeight: 1.6, margin: 0 }}>
              • Brauzer tarixi, hisob ma'lumotlari, shaxsiy parollar va tarmoq trafigi <b>hech qachon markaziy server bazasida saqlanmaydi</b>.<br />
              • Barcha ma'lumotlar faqat kompyuteringizdagi agent tomonidan bevosita sizning brauzeringizga bir martalik shifrlangan kanal orqali uzatiladi.
            </p>
          </div>
        </div>
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

      {/* Re-pair / Update Device Modal */}
      {rePairDevice && (
        <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget && !rePairLoading) setRePairDevice(null); }}>
          <div className="dialog">
            <h2>Qurilmani yangilashni tasdiqlash</h2>
            <p className="muted" style={{ lineHeight: 1.5, marginBottom: 16 }}>
              <b>{rePairDevice.display_name}</b> kompyuterida yangi versiya agentini o'rnatganingizdan so'ng, ekranda paydo bo'lgan bir martalik <b>Pairing kodi</b>ni kiriting.
              <br /><br />
              <span style={{ color: "var(--ok)", fontWeight: 600 }}>
                ✓ Mavjud qurilma qayta ulanadi va ro'yxatda takroriy (dublikat) kompyuter yaratilmaydi.
              </span>
            </p>

            <form onSubmit={handleRePairSubmit}>
              <div className="form-field">
                <label>Agent ko'rsatgan 8-12 xonali ulanish kodi</label>
                <input
                  type="text"
                  placeholder="Masalan: A1B2-C3D4"
                  value={rePairCode}
                  onChange={e => setRePairCode(e.target.value)}
                  style={{ textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, fontSize: 16 }}
                  required
                  autoFocus
                />
              </div>

              <div style={{ background: "var(--bg2)", padding: 12, borderRadius: 8, margin: "14px 0", fontSize: 13 }}>
                <b>Saqlanadigan ruxsatlar:</b>
                <div className="scopes" style={{ marginTop: 6 }}>
                  {(rePairDevice.scopes || ["browser.discovery", "profile.discovery", "history.read", "traffic.aggregate"]).map(s => (
                    <span key={s} className="scope-chip on">✓ {s}</span>
                  ))}
                </div>
              </div>

              <div className="dialog-buttons">
                <button
                  type="button"
                  className="btn o"
                  disabled={rePairLoading}
                  onClick={() => setRePairDevice(null)}
                >
                  Bekor qilish
                </button>
                <button type="submit" className="btn" disabled={rePairLoading}>
                  {rePairLoading ? "Bog'lanmoqda..." : "Tasdiqlash va qayta ulash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
