import { useState, useEffect, useCallback } from "react";
import {
  getMe,
  logout,
  refreshCsrf,
  getDevices,
  getInstallers,
  getReleases,
  type Me,
  type Device,
  type InstallerItem,
  type ReleaseItem,
} from "./api";
import AuthPage from "./AuthPage";
import Sidebar, { type Profile } from "./Sidebar";
import { HistoryView, LoginsView } from "./BrowserViews";
import TrafficView from "./TrafficView";
import ManagementPage from "./ManagementPage";
import Dashboard from "./Dashboard";

export type NavPage = "Dashboard" | "Qurilmalar" | "Statistika" | "Xavfsizlik" | "Foydalanuvchilar" | "Sozlamalar" | "Yordam";
export type TabId = "tarix" | "login" | "trafik";

const NAV_ITEMS: { page: NavPage; title: string; icon: React.ReactNode }[] = [
  {
    page: "Dashboard",
    title: "Boshqaruv paneli",
    icon: <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>,
  },
  {
    page: "Qurilmalar",
    title: "Qurilmalar va Brauzerlar",
    icon: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  },
  {
    page: "Statistika",
    title: "Qurilmalar boshqaruvi",
    icon: <svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>,
  },
  {
    page: "Xavfsizlik",
    title: "Xavfsizlik",
    icon: <svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>,
  },
  {
    page: "Foydalanuvchilar",
    title: "Foydalanuvchilar",
    icon: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.8 3.5 2.6 3.5 6" /></svg>,
  },
  {
    page: "Sozlamalar",
    title: "Sozlamalar",
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>,
  },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<Me | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [page, setPage] = useState<NavPage>("Dashboard");
  const [tab, setTab] = useState<TabId>("tarix");
  const [installers, setInstallers] = useState<InstallerItem[]>([]);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);

  // Device & Profile
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const showToast = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Check auth on load
  const checkAuth = useCallback(async () => {
    try {
      await refreshCsrf();
      const me = await getMe();
      setCurrentUser(me);
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const devs = await getDevices();
      setDevices(devs);
      const active = devs.find(d => !d.revoked);
      if (active && (!selectedDevice || !devs.some(d => d.id === selectedDevice.id))) {
        setSelectedDevice(active);
      }
    } catch {
      // not logged in or error
    }
  }, [selectedDevice]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (currentUser) {
      loadDevices();
      getInstallers().then(res => setInstallers(res.items || [])).catch(() => {});
      getReleases().then(res => setReleases(res)).catch(() => {});
    }
  }, [currentUser, loadDevices]);

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setSelectedDevice(null);
      setSelectedProfile(null);
      showToast("Tizimdan chiqildi");
    } catch {
      setCurrentUser(null);
    }
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme === "dark" || (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = isDark ? "light" : "dark";
  };

  if (authChecking) {
    return (
      <div className="loading-wrap" style={{ height: "100vh", width: "100vw" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPage
        onLogin={(_email) => {
          checkAuth();
          showToast("Muvaffaqiyatli kirdingiz");
        }}
      />
    );
  }

  const isDevicePage = page === "Qurilmalar";

  return (
    <>
      {/* ---------------- RAIL NAVIGATION ---------------- */}
      <nav className="rail" aria-label="Asosiy menyu">
        <div className="logo">W</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.page}
            className={`rail-btn${page === item.page ? " on" : ""}`}
            title={item.title}
            onClick={() => setPage(item.page)}
          >
            {item.icon}
          </button>
        ))}
        <div className="rail-sp" />
        <button
          className={`rail-btn${page === "Yordam" ? " on" : ""}`}
          title="Yordam"
          onClick={() => setPage("Yordam")}
        >
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" /></svg>
        </button>
        <button className="rail-btn" title="Chiqish" onClick={handleLogout}>
          <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </nav>

      {/* ---------------- SIDEBAR ---------------- */}
      {isDevicePage && (
        <Sidebar
          deviceId={selectedDevice?.id ?? ""}
          selectedProfile={selectedProfile}
          onSelectProfile={(p) => {
            setSelectedProfile(p);
          }}
        />
      )}

      {/* ---------------- MAIN CONTAINER ---------------- */}
      <div className="main">
        {/* TOP BAR */}
        <div className="top">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="11" rx="1.5" /><path d="M2 20h20" /></svg>
          {isDevicePage ? (
            <>
              <span>{selectedDevice?.display_name || "Qurilma tanlanmagan"}</span>
              <span>/</span>
              <span>{selectedProfile?.browser_name || "Brauzer"}</span>
              <span>/</span>
              <b>{selectedProfile?.profile_name || "Profil tanlang"}</b>
            </>
          ) : (
            <>
              <span>Boshqaruv</span>
              <span>/</span>
              <b>{page}</b>
            </>
          )}

          <span className="gap" />

          {selectedDevice && !selectedDevice.revoked && (
            <span className="pill">
              <i />
              {selectedDevice.monitoring_paused ? "Monitoring to'xtatilgan" : "Agent faol"}
            </span>
          )}

          <button className="theme-btn" onClick={toggleTheme} title="Mavzuni almashtirish" aria-label="Mavzuni almashtirish">
            <svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>
          </button>
        </div>

        {/* PAGE CONTENT */}
        <main className="page">
          <div className="head">
            <h1>
              {isDevicePage
                ? tab === "tarix"
                  ? "Brauzer tarixi"
                  : tab === "login"
                  ? "Saqlangan loginlar"
                  : "Trafik monitoringi"
                : page}
            </h1>
          </div>

          {isDevicePage && (
            <>
              <div className="tabs" role="tablist">
                {(["tarix", "login", "trafik"] as const).map(t => (
                  <button
                    key={t}
                    className={`tab-btn${tab === t ? " on" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "tarix" ? "Tarix" : t === "login" ? "Loginlar" : "Trafik"}
                  </button>
                ))}
              </div>

              {!selectedDevice ? (
                <div className="empty">
                  <h3>Hozircha ulangan qurilma yo'q</h3>
                  <p className="muted">
                    "Statistika" bo'limiga o'tib, agentingiz ko'rsatgan kod orqali qurilmani ulang.
                  </p>
                  <button className="btn" onClick={() => setPage("Statistika")}>
                    Qurilmani ulashga o'tish
                  </button>
                </div>
              ) : tab === "trafik" ? (
                <TrafficView deviceId={selectedDevice.id} profile={selectedProfile ?? undefined} />
              ) : !selectedProfile ? (
                <div className="empty">
                  <h3>Profil tanlanmagan</h3>
                  <p className="muted">
                    Chap paneldan brauzer va kerakli profilni (masalan, asosiy profil yoki email) tanlang.
                  </p>
                </div>
              ) : tab === "tarix" ? (
                <HistoryView deviceId={selectedDevice.id} profile={selectedProfile} onToast={showToast} />
              ) : (
                <LoginsView deviceId={selectedDevice.id} profile={selectedProfile} onToast={showToast} />
              )}
            </>
          )}

          {page === "Dashboard" && (
            <Dashboard
              devices={devices}
              userEmail={currentUser.email}
              installers={installers}
              releases={releases}
              onNavigate={(p) => setPage(p)}
              onSelectDevice={(d) => {
                setSelectedDevice(d);
                setPage("Qurilmalar");
              }}
              onOpenPairModal={() => setPage("Statistika")}
            />
          )}

          {!isDevicePage && page !== "Dashboard" && (
            <ManagementPage
              page={page}
              currentUser={currentUser}
              onToast={showToast}
              onRefreshDevices={loadDevices}
            />
          )}
        </main>

        {/* STATUS BAR */}
        <div className="status">
          <span>◷ Tizim: <b>WebBrothers</b></span>
          <span>{currentUser.email}</span>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div className={`toast${toast.err ? " err" : ""}`} role="status">
          {toast.msg}
        </div>
      )}
    </>
  );
}
