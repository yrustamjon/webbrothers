import { useState, lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, APIError, queryAgent, type Device, type Browser } from "./api";
import { useSelection } from "./store";
import Downloads from "./Downloads";
import DeviceSettings from "./DeviceSettings";
import { scopes, toggleBrowser, unwrap } from "./model.mjs";
import LocalPasswords from "./LocalPasswords";
const HistoryView = lazy(() => import("./HistoryView"));
const Inventory = lazy(() => import("./Inventory"));
const TrafficView = lazy(() => import("./TrafficView"));
const time = (value?: string) =>
  value ? new Date(value).toLocaleString("uz-UZ") : "Hali ulanmagan";
const platformName = (value: string) =>
  (
    ({ darwin: "macOS", windows: "Windows", linux: "Linux" }) as Record<
      string,
      string
    >
  )[value] ?? value;
function Icon({
  name,
}: {
  name: "devices" | "download" | "link" | "account" | "arrow" | "shield";
}) {
  const paths = {
    devices: "M3 4h18v12H3zM8 21h8m-4-5v5",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
    account:
      "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    shield: "M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function Brand() {
  return (
    <span className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">
        w<span />
      </span>
      <span>
        webbrothers<small>BRAUZER ISH MAYDONI</small>
      </span>
    </span>
  );
}

export function SetupJourney({
  step,
  connected,
  onStep,
}: {
  step: number;
  connected: number;
  onStep: (step: number) => void;
}) {
  const steps = [
    ["Agent yuklash", "Windows yoki macOS", "download"],
    ["Ilovani ochish", "Kompyuteringizda", "devices"],
    ["Kodni tasdiqlash", "Ruxsatlarni tanlang", "link"],
    ["Profilni tanlash", "Maʼlumotlarni koʻring", "account"],
  ] as const;
  return (
    <section className="setup-journey" aria-label="Qurilmani ulash bosqichlari">
      <div className="journey-heading">
        <div>
          <p className="eyebrow">ULANISH YOʻLI</p>
          <h2>
            {connected
              ? "Ish maydoningiz tayyor."
              : "Birinchi ulanish, toʻrtta oddiy qadam."}
          </h2>
          <p>
            {connected
              ? `${connected} ta qurilma ulangan. Profilni tanlang yoki yangi kompyuter qoʻshing.`
              : "Agentni oʻrnating, ulash kodini tasdiqlang va kerakli profilni oching."}
          </p>
        </div>
        <span className="journey-current">
          {step}
          <span>/ 4 bosqich</span>
        </span>
      </div>
      <ol className="journey-steps">
        {steps.map(([title, detail, icon], index) => (
          <li key={title}>
            <button
              className={
                step === index + 1 ? "journey-step current" : "journey-step"
              }
              aria-label={`${index + 1} ${title}: ${detail}`}
              aria-current={step === index + 1 ? "step" : undefined}
              onClick={() => onStep(index + 1)}
            >
              <span className="step-number">{index + 1}</span>
              <span className="step-copy">
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <Icon name={icon} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      {error instanceof Error ? error.message : "Kutilmagan xato yuz berdi."}
    </p>
  ) : null;
}
export function Auth({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const action = useMutation({
    mutationFn: () => api(`/auth/${mode}`, { email, password }),
    onSuccess: () => {
      setPassword("");
      if (mode === "register") {
        setNotice(
          "Hisob yaratildi. Tizimga kirib, hisob sozlamalaridan tasdiqlash xatini soʻrang.",
        );
        setMode("login");
      } else onLogin();
    },
  });
  return (
    <main className="auth auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <p className="eyebrow">SIZNING RAQAMLI ISH MAYDONINGIZ</p>
          <h1>
            Qurilmalaringiz.
            <br />
            Bitta aniq manzara.
          </h1>
          <p>
            Brauzerlaringiz, profillaringiz va kerakli maʼlumotlar — oʻzingiz
            boshqaradigan yagona ish maydonida.
          </p>
        </div>
        <div className="auth-topology" aria-hidden="true">
          <div className="topology-orbit" />
          <div className="topology-center">
            <Icon name="shield" />
          </div>
          <span className="topology-node node-one">
            <Icon name="devices" /> Qurilma
          </span>
          <span className="topology-node node-two">
            <Icon name="account" /> Profil
          </span>
          <span className="topology-node node-three">
            <Icon name="link" /> Xavfsiz ulanish
          </span>
        </div>
        <div className="auth-trust">
          <Icon name="shield" />
          <p>
            Faqat sizning roziligingiz bilan.
            <small>Brauzer tarixi markaziy bazada saqlanmaydi.</small>
          </p>
        </div>
      </aside>
      <div className="auth-form-wrap">
        <p className="eyebrow">XUSH KELIBSIZ</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate();
          }}
        >
          <h2>{mode === "login" ? "Hisobga kirish" : "Roʻyxatdan oʻtish"}</h2>
          <label>
            Elektron pochta
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Parol
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorBox error={action.error} />
          {notice && <p role="status">{notice}</p>}
          <button disabled={action.isPending}>
            {action.isPending
              ? "Kutilmoqda…"
              : mode === "login"
                ? "Kirish"
                : "Hisob yaratish"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              action.reset();
            }}
          >
            {mode === "login" ? "Yangi hisob yaratish" : "Kirishga qaytish"}
          </button>
        </form>
        <Recovery />
        <p className="auth-footnote">
          Parollar va cookie fayllari yigʻilmaydi.
        </p>
      </div>
    </main>
  );
}
export function Pairing({
  onDone,
  onDownload,
  onOpenDevices,
}: {
  onDone: () => void;
  onDownload?: () => void;
  onOpenDevices?: () => void;
}) {
  const [code, setCode] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [approved, setApproved] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      api("/pairing/approve", { code: code.trim(), scopes: chosen }),
    onSuccess: () => {
      setApproved(true);
      setCode("");
      onDone();
    },
  });
  return (
    <section className="panel pairing-panel">
      <div className="section-kicker">
        <Icon name="link" />
        <span>3-BOSQICH · TASDIQLASH</span>
      </div>
      <h2>Yangi qurilmani ulash</h2>
      <p>
        Agentni faqat oʻzingiz boshqaradigan kompyuterda ishga tushiring. Agent
        koʻrsatgan bir martalik kodni kiriting.
      </p>
      {onDownload && (
        <button type="button" className="text-button" onClick={onDownload}>
          Agent hali oʻrnatilmaganmi? Yuklab olish <Icon name="arrow" />
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          Ulash kodi
          <input
            required
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            className="pairing-code"
            placeholder="Agentdagi kodni kiriting"
          />
        </label>
        <fieldset>
          <legend>Ruxsat beriladigan maʼlumotlar</legend>
          {scopes.map(([scope, label]) => (
            <label className="check" key={scope}>
              <input
                type="checkbox"
                checked={chosen.includes(scope)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, scope]
                      : chosen.filter((s) => s !== scope),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="muted">
          Parollar, cookie va autentifikatsiya tokenlari yigʻilmaydi.
          Tanlanmagan ruxsatlar avtomatik qoʻshilmaydi.
        </p>
        <ErrorBox error={mutation.error} />
        {approved && (
          <div className="success-message" role="status">
            <Icon name="shield" />
            <div>
              <strong>Ulash tasdiqlandi.</strong>
              <p>Agent ulanishini kuting, keyin qurilma va profilni tanlang.</p>
              {onOpenDevices && (
                <button type="button" onClick={onOpenDevices}>
                  Qurilmalarni ochish <Icon name="arrow" />
                </button>
              )}
            </div>
          </div>
        )}
        <button disabled={!chosen.length || mutation.isPending}>
          Ulashni tasdiqlash
        </button>
      </form>
    </section>
  );
}
function ProfileLabel({
  name,
  metadataAvailable,
}: {
  name: string;
  metadataAvailable: boolean;
}) {
  const parts = name.split(" · ");
  const email = parts.find((part) => /^[^\s@]+@[^\s@]+$/.test(part));
  const generic =
    /^(?:profile[\s_-]*\d+|person[\s_-]*\d+|default|guest(?: profile)?)$/i;
  const human = parts.find((part) => part !== email && !generic.test(part));
  const primary =
    email ||
    human ||
    (parts.some((part) => /^guest/i.test(part))
      ? "Mehmon profil"
      : metadataAvailable
        ? "Email aniqlanmadi"
        : "Email hali olinmagan");
  const secondary =
    email && human
      ? human
      : !email && !human && !/^guest/i.test(name)
        ? name
        : undefined;
  return (
    <span className="profile-label">
      <span>{primary}</span>
      {secondary && <small>{secondary}</small>}
    </span>
  );
}

function CategoryAccess({
  scope,
  browser,
  granted,
  onDownload,
}: {
  scope: string;
  browser: Browser;
  granted: boolean;
  onDownload?: () => void;
}) {
  const unsupportedPasswords =
    scope === "login.inventory" && ["firefox", "safari"].includes(browser.id);
  const oldAgent = !browser.capabilities;
  const label =
    scope === "history.read"
      ? "Tarix"
      : scope === "login.inventory"
        ? "Parollar"
        : "Trafik";
  const heading = unsupportedPasswords
    ? "Loginlar uchun brauzer parol menejeridan foydalaning"
    : oldAgent
      ? "Bu boʻlim uchun agentni yangilang"
      : !granted
        ? "Bu boʻlimga ruxsat berilmagan"
        : "Bu brauzerda imkoniyat hali mavjud emas";
  return (
    <section className="category-access" aria-label={`${label} sozlamasi`}>
      <span className="access-icon">
        <Icon name={scope === "login.inventory" ? "shield" : "devices"} />
      </span>
      <p className="eyebrow">{label.toLocaleUpperCase()} · SOZLASH</p>
      <h2>{heading}</h2>
      <p>
        {unsupportedPasswords
          ? "Firefox va Safari login metamaʼlumotlarini agent hozir oʻqimaydi. Parolni shu qurilmadagi brauzer yoki OS parol menejerida koʻring."
          : oldAgent
            ? "Eski agent bu imkoniyatni eʼlon qilmayapti. Oxirgi agentni oʻrnating va qayta ishga tushiring."
            : !granted
              ? "Agentga berilgan dastlabki rozilikda bu maʼlumot turi tanlanmagan. Sayt oʻzi yangi ruxsat qoʻsha olmaydi."
              : "Tanlangan brauzer bu maʼlumot turini qoʻllamaydi. Boshqa profil yoki qoʻllanadigan brauzerni tanlang."}
      </p>
      {!unsupportedPasswords && (oldAgent || !granted) && (
        <ol>
          <li>
            Agentni qurilmangizda oching{oldAgent ? " va yangilang" : ""}.
          </li>
          <li>
            Mahalliy menyuda{" "}
            <strong>3 — Ruxsatlarni yangilash / qayta ulash</strong>ni tanlang
            va kerakli ruxsatga rozilik bering.
          </li>
          <li>
            Yangi ulash kodini saytda tasdiqlang; faqat kerakli ruxsatlarni
            belgilang.
          </li>
        </ol>
      )}
      {oldAgent && !unsupportedPasswords && onDownload && (
        <button onClick={onDownload}>
          Oxirgi agentni yuklash <Icon name="arrow" />
        </button>
      )}
      {scope === "login.inventory" && <LocalPasswords browser={browser.id} />}
    </section>
  );
}

export function Explorer({
  device,
  onDownload,
}: {
  device: Device;
  onDownload?: () => void;
}) {
  const selection = useSelection();
  const [tab, setTab] = useState("history");
  const [profileSearch, setProfileSearch] = useState("");
  const browsers = useQuery<{ items: Browser[] }>({
    queryKey: ["browsers", device.id],
    queryFn: async ({ signal }) =>
      unwrap(
        await queryAgent(device.id, "BROWSER_LIST_REQUEST", {}, signal),
      ) as {
        items: Browser[];
      },
    enabled: device.status === "online" && !device.monitoring_paused,
  });
  const selectedBrowser = browsers.data?.items.find(
    (b) => b.id === selection.browser,
  );
  const selectedProfile = selectedBrowser?.profiles.find(
    (p) => p.id === selection.profile,
  );
  const search = profileSearch.trim().toLocaleLowerCase();
  const filteredBrowsers = browsers.data?.items
    .map((browser) => ({
      ...browser,
      allProfiles: browser.profiles.length,
      profiles: browser.profiles.filter(
        (profile) =>
          !search ||
          browser.name.toLocaleLowerCase().includes(search) ||
          profile.name.toLocaleLowerCase().includes(search),
      ),
    }))
    .filter(
      (browser) =>
        !search ||
        browser.profiles.length > 0 ||
        browser.name.toLocaleLowerCase().includes(search),
    );
  const capabilities = selectedBrowser?.capabilities;
  const has = (scope: string) =>
    device.scopes.includes(scope) &&
    (capabilities
      ? capabilities.includes(scope)
      : scope === "history.read"
        ? selectedBrowser?.id !== "safari"
        : scope === "traffic.aggregate" && device.operating_system === "linux");
  const tabs = [
    ["history", "Tarix"],
    ["inventory", "Parollar"],
    ["traffic", "Trafik"],
  ];
  const activeTab = tab;
  const tabScopes: Record<string, string> = {
    history: "history.read",
    inventory: "login.inventory",
    traffic: "traffic.aggregate",
  };
  return (
    <section className="panel">
      <h2>{device.display_name}</h2>
      <p className="muted">
        {platformName(device.operating_system)} · {device.architecture} ·{" "}
        {device.status === "online" ? "Tarmoqda" : "Tarmoqdan tashqarida"}
      </p>
      <DeviceSettings device={device} />
      {!!capabilities &&
        (!device.scopes.includes("login.inventory") ||
          !device.scopes.includes("traffic.aggregate")) && (
          <p className="muted">
            Loginlar va trafik uchun yangi agentni ochib, “Ruxsatlarni yangilash
            / qayta ulash”ni tanlang. Yangi ulash kodini tasdiqlaganda kerakli
            ruxsatlarni belgilang.
          </p>
        )}
      {device.monitoring_paused ? (
        <p role="status">
          Kuzatuv toʻxtatilgan. Maʼlumot olish uchun uni davom ettiring.
        </p>
      ) : device.status !== "online" ? (
        <p role="status">
          Qurilma ulanmagan. Agentning internetga ulanishini tekshiring.
        </p>
      ) : (
        <>
          <ErrorBox error={browsers.error} />
          {selectedBrowser && !selectedBrowser.capabilities && (
            <aside
              className="success-message"
              role="note"
              aria-label="Agentni yangilash"
            >
              <Icon name="devices" />
              <div>
                <strong>Profil emaili uchun agentni yangilang</strong>
                <p>
                  Bu agent profil emailini yubormaydi. Agentni yangilang va
                  qayta ishga tushiring.
                </p>
              </div>
            </aside>
          )}
          <div className="explorer">
            <nav aria-label="Brauzer va profillar">
              <div className="profile-tools">
                <div className="profile-tools-head">
                  <h3>Brauzerlar</h3>
                  <button
                    className="secondary"
                    onClick={() => browsers.refetch()}
                    aria-label="Brauzerlarni yangilash"
                  >
                    Yangilash
                  </button>
                </div>
                <label>
                  Brauzer, profil yoki email
                  <input
                    type="search"
                    placeholder="Nom yoki email bilan qidiring"
                    value={profileSearch}
                    onChange={(event) => setProfileSearch(event.target.value)}
                  />
                </label>
                {browsers.data && (
                  <p className="profile-summary">
                    {filteredBrowsers?.reduce(
                      (total, browser) => total + browser.profiles.length,
                      0,
                    )}{" "}
                    profil
                    {search
                      ? " topildi"
                      : ` · ${browsers.data.items.length} brauzer`}
                  </p>
                )}
              </div>
              {browsers.isFetching && <p>Qidirilmoqda…</p>}
              {browsers.data?.items.length === 0 && (
                <p>Qoʻllab-quvvatlanadigan brauzer topilmadi.</p>
              )}
              {search && filteredBrowsers?.length === 0 && (
                <p role="status" className="profile-no-results">
                  Mos brauzer yoki profil topilmadi.
                </p>
              )}
              <div className="browser-list">
                {filteredBrowsers?.map((browser) => (
                  <div key={browser.id} className="browser-group">
                    <button
                      className="browser"
                      aria-expanded={selection.browser === browser.id}
                      onClick={() =>
                        selection.selectBrowser(
                          toggleBrowser(selection.browser, browser.id),
                        )
                      }
                    >
                      <span className="browser-name">{browser.name}</span>
                      <span
                        className="profile-count"
                        aria-label={`${browser.allProfiles} ta profil`}
                      >
                        {search
                          ? `${browser.profiles.length}/${browser.allProfiles}`
                          : browser.allProfiles}
                      </span>
                      <span aria-hidden="true">
                        {selection.browser === browser.id ? "−" : "+"}
                      </span>
                    </button>
                    {selection.browser === browser.id && (
                      <div className="profiles">
                        {browser.profiles.length === 0 && (
                          <p>Profil mavjud emas.</p>
                        )}
                        {browser.profiles.map((profile) => (
                          <button
                            key={profile.id}
                            className={
                              selection.profile === profile.id
                                ? "selected"
                                : "secondary"
                            }
                            aria-pressed={selection.profile === profile.id}
                            aria-label={profile.name}
                            title={profile.name}
                            onClick={() => {
                              if (selection.browser !== browser.id)
                                selection.selectBrowser(browser.id);
                              selection.selectProfile(profile.id);
                            }}
                          >
                            <ProfileLabel
                              name={profile.name}
                              metadataAvailable={
                                browser.capabilities !== undefined
                              }
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </nav>
            <div className="detail">
              {selectedProfile && selectedBrowser ? (
                <>
                  <h3 className="selected-profile-heading">
                    <span className="selected-browser-label">
                      {selectedBrowser.name}
                    </span>
                    <ProfileLabel
                      name={selectedProfile.name}
                      metadataAvailable={
                        selectedBrowser.capabilities !== undefined
                      }
                    />
                  </h3>
                  <div
                    className="tabs"
                    role="tablist"
                    aria-label="Profil boʻlimlari"
                  >
                    {tabs.map(([key, label]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={activeTab === key}
                        aria-label={label}
                        onClick={() => setTab(key)}
                      >
                        {label}
                        {!has(tabScopes[key]) && (
                          <span className="tab-setup" aria-hidden="true">
                            ·
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {!has(tabScopes[activeTab]) && (
                    <CategoryAccess
                      scope={tabScopes[activeTab]}
                      browser={selectedBrowser}
                      granted={device.scopes.includes(tabScopes[activeTab])}
                      onDownload={onDownload}
                    />
                  )}
                  {activeTab === "history" && has("history.read") && (
                    <Suspense
                      fallback={<p role="status">Tarix moduli yuklanmoqda…</p>}
                    >
                      <HistoryView
                        key={`${device.id}-${selection.profile}`}
                        capabilities={capabilities}
                        device={device.id}
                        browser={selectedBrowser.id}
                        profile={selectedProfile.id}
                      />
                    </Suspense>
                  )}{" "}
                  {activeTab === "inventory" && has("login.inventory") && (
                    <Suspense
                      fallback={
                        <p role="status">Loginlar moduli yuklanmoqda…</p>
                      }
                    >
                      <Inventory
                        key={`${device.id}-${selection.profile}`}
                        capabilities={capabilities}
                        browserName={selectedBrowser.name}
                        profileName={selectedProfile.name}
                        device={device.id}
                        browser={selectedBrowser.id}
                        profile={selectedProfile.id}
                      />
                    </Suspense>
                  )}
                  {activeTab === "traffic" && has("traffic.aggregate") && (
                    <Suspense
                      fallback={
                        <p role="status">Trafik grafigi yuklanmoqda…</p>
                      }
                    >
                      <TrafficView
                        key={`${device.id}-${selection.profile}`}
                        device={device.id}
                        capabilities={capabilities}
                        scopes={device.scopes}
                        browser={selectedBrowser.id}
                        profile={selectedProfile.id}
                      />
                    </Suspense>
                  )}
                </>
              ) : (
                <p className="empty">Brauzer va profilni tanlang.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Recovery() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const forgot = useMutation({
    mutationFn: () =>
      api<{ message: string }>("/auth/password/forgot", { email }),
  });
  const reset = useMutation({
    mutationFn: () =>
      api<{ message: string }>("/auth/password/reset", { token, password }),
    onSuccess: () => {
      setPassword("");
      setToken("");
    },
  });
  if (!open)
    return (
      <button className="secondary" onClick={() => setOpen(true)}>
        Parolni unutdingizmi?
      </button>
    );
  return (
    <section className="panel">
      <h2>Parolni tiklash</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          forgot.mutate();
        }}
      >
        <label>
          Hisob elektron pochtasi
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button disabled={forgot.isPending}>Tiklash xatini yuborish</button>
        <ErrorBox error={forgot.error} />
        {forgot.data && <p role="status">{forgot.data.message}</p>}
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        <label>
          Xatdagi tiklash kodi
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Yangi parol
          <input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button disabled={reset.isPending}>Parolni yangilash</button>
        <ErrorBox error={reset.error} />
        {reset.data && (
          <p role="status">
            Parol yangilandi. Yangi parol bilan tizimga kiring.
          </p>
        )}
      </form>
    </section>
  );
}
function Account({ email }: { email: string }) {
  const client = useQueryClient();
  const [token, setToken] = useState("");
  const sessions = useQuery<{
    items: { id: string; expires_at: string; current: boolean }[];
  }>({ queryKey: ["sessions"], queryFn: () => api("/auth/sessions") });
  const audit = useQuery<{
    items: { action: string; device_id?: string; created_at: string }[];
  }>({ queryKey: ["audit"], queryFn: () => api("/audit") });
  const send = useMutation({
    mutationFn: () => api<{ message: string }>("/auth/verification/send", {}),
  });
  const confirm = useMutation({
    mutationFn: () =>
      api<{ message: string }>("/auth/verification/confirm", { token }),
    onSuccess: () => setToken(""),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/auth/sessions/${encodeURIComponent(id)}`, {}, "DELETE"),
    onSuccess: (_, id) => {
      if (sessions.data?.items.find((item) => item.id === id)?.current) {
        client.clear();
        location.reload();
        return;
      }
      void client.invalidateQueries({ queryKey: ["sessions"] });
      void client.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const labels: Record<string, string> = {
    "account.register": "Hisob yaratildi",
    "session.login": "Hisobga kirildi",
    "device.approve": "Ulash tasdiqlandi",
    "device.enrolled": "Qurilma ulandi",
    "device.revoked": "Qurilma ruxsati bekor qilindi",
  };
  return (
    <>
      <section className="panel">
        <h1>Hisob va xavfsizlik</h1>
        <p>{email}</p>
        <h2>Elektron pochtani tasdiqlash</h2>
        <button onClick={() => send.mutate()} disabled={send.isPending}>
          Tasdiqlash xatini yuborish
        </button>
        <ErrorBox error={send.error} />
        {send.data && <p role="status">{send.data.message}</p>}
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <label>
            Xatdagi tasdiqlash kodi
            <input
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button disabled={confirm.isPending}>Tasdiqlash</button>
        </form>
        <ErrorBox error={confirm.error} />
        {confirm.data && <p role="status">{confirm.data.message}</p>}
        <p>
          Agent paketlari va oʻrnatish koʻrsatmalari “Agent yuklash” boʻlimida.
        </p>
      </section>
      <section className="panel">
        <h2>Faol sessiyalar</h2>
        <ErrorBox error={sessions.error} />
        <ErrorBox error={revoke.error} />
        {sessions.isPending && <p>Yuklanmoqda…</p>}
        {sessions.data?.items.map((session) => (
          <div className="section-head" key={session.id}>
            <span>
              {session.current ? "Ushbu sessiya" : "Boshqa sessiya"} · Tugash:{" "}
              {time(session.expires_at)}
            </span>
            <button
              className="danger"
              onClick={() => revoke.mutate(session.id)}
              disabled={revoke.isPending}
            >
              Sessiyani bekor qilish
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Xavfsizlik auditi</h2>
        <ErrorBox error={audit.error} />
        {audit.isPending && <p>Yuklanmoqda…</p>}
        {audit.data?.items.length === 0 && <p>Hodisalar mavjud emas.</p>}
        <ul>
          {audit.data?.items.map((item, i) => (
            <li key={i}>
              {time(item.created_at)} ·{" "}
              {labels[item.action] ?? "Xavfsizlik hodisasi"}
              {item.device_id && ` · ${item.device_id}`}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function App() {
  const client = useQueryClient();
  const selection = useSelection();
  const [page, setPage] = useState("devices");
  const [setupStep, setSetupStep] = useState(1);
  const [pairingApproved, setPairingApproved] = useState(false);
  const me = useQuery<{ email: string }>({
    queryKey: ["me"],
    queryFn: () => api("/auth/me"),
  });
  const devices = useQuery<{ items: Device[] }>({
    queryKey: ["devices"],
    queryFn: () => api("/devices"),
    enabled: !!me.data,
    refetchInterval: 10000,
  });
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", {}),
    onSuccess: () => {
      selection.clear();
      client.clear();
      location.reload();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(`/devices/${encodeURIComponent(id)}/revoke`, {}),
    onSuccess: () => {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      selection.clear();
      void devices.refetch();
    },
  });
  if (me.isPending)
    return (
      <main className="auth" role="status">
        Hisob tekshirilmoqda…
      </main>
    );
  if (!me.data) {
    if (me.error instanceof APIError && me.error.status !== 401)
      return (
        <main className="auth">
          <h1>Serverga ulanib boʻlmadi</h1>
          <ErrorBox error={me.error} />
          <button onClick={() => me.refetch()}>Qayta urinish</button>
        </main>
      );
    return (
      <Auth
        onLogin={() => {
          void client.invalidateQueries({ queryKey: ["me"] });
        }}
      />
    );
  }
  const list = devices.data?.items ?? [];
  const selected = list.find((d) => d.id === selection.device);
  const connected = list.filter((d) => d.status !== "revoked").length;
  const currentStep =
    page === "pairing"
      ? pairingApproved
        ? 4
        : 3
      : page === "downloads"
        ? setupStep === 2
          ? 2
          : 1
        : connected
          ? 4
          : setupStep;
  const navigateStep = (step: number) => {
    setSetupStep(step);
    if (step === 3) setPairingApproved(false);
    setPage(step < 3 ? "downloads" : step === 3 ? "pairing" : "devices");
  };
  const titles: Record<string, [string, string]> = {
    devices: ["Ish maydoni", "Qurilmalaringiz va brauzer profillari"],
    device: [
      "Qurilma profillari",
      selected?.display_name ?? "Tanlangan qurilma",
    ],
    downloads: [
      "Agentni oʻrnatish",
      "Kompyuteringizni ish maydoniga tayyorlang",
    ],
    pairing: ["Qurilmani ulash", "Bir martalik kod orqali xavfsiz tasdiqlash"],
    account: ["Hisob va xavfsizlik", "Shaxsiy hisobingizni boshqaring"],
  };
  return (
    <div className="app">
      <header className="app-sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("devices");
          }}
        >
          <Brand />
        </a>
        <p className="nav-caption">BOSHQARUV</p>
        <nav aria-label="Asosiy menyu">
          <button
            className={page === "devices" || page === "device" ? "active" : ""}
            aria-current={
              page === "devices" || page === "device" ? "page" : undefined
            }
            onClick={() => setPage("devices")}
          >
            <Icon name="devices" /> Qurilmalar
          </button>
          <button
            className={page === "pairing" ? "active" : ""}
            aria-current={page === "pairing" ? "page" : undefined}
            onClick={() => navigateStep(3)}
          >
            <Icon name="link" /> Qurilma ulash
          </button>
          <button
            className={page === "downloads" ? "active" : ""}
            aria-current={page === "downloads" ? "page" : undefined}
            onClick={() => navigateStep(1)}
          >
            <Icon name="download" /> Agent yuklash
          </button>
          <button
            className={page === "account" ? "active" : ""}
            aria-current={page === "account" ? "page" : undefined}
            onClick={() => setPage("account")}
          >
            <Icon name="account" /> Hisob
          </button>
        </nav>
        <div className="sidebar-note">
          <Icon name="shield" />
          <strong>Ruxsat sizning qoʻlingizda</strong>
          <p>Faqat tasdiqlangan qurilmalar. Faqat tanlangan maʼlumotlar.</p>
        </div>
        <button
          className="secondary"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Chiqish
        </button>
      </header>
      <main className="content workspace-content">
        <div className="workspace-topbar">
          <div>
            <p className="eyebrow">
              WEBBROTHERS / {page === "account" ? "HISOB" : "ISH MAYDONI"}
            </p>
            <h1>{titles[page][0]}</h1>
            <p>{titles[page][1]}</p>
          </div>
          <div className="user-chip">
            <span>{me.data.email.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>Shaxsiy hisob</strong>
              <small>{me.data.email}</small>
            </div>
          </div>
        </div>
        <ErrorBox error={logout.error} />
        {(page === "downloads" ||
          page === "pairing" ||
          (page === "devices" && !!devices.data && connected === 0)) && (
          <SetupJourney
            step={currentStep}
            connected={connected}
            onStep={navigateStep}
          />
        )}
        {page === "downloads" ? (
          <Downloads
            onDownload={() => setSetupStep(2)}
            onPair={() => navigateStep(3)}
          />
        ) : page === "account" ? (
          <Account email={me.data.email} />
        ) : page === "pairing" ? (
          <Pairing
            onDone={() => {
              setPairingApproved(true);
              setSetupStep(4);
              void devices.refetch();
            }}
            onDownload={() => navigateStep(1)}
            onOpenDevices={() => setPage("devices")}
          />
        ) : page === "device" ? (
          <div className="device-workspace">
            <div className="workspace-breadcrumb">
              <button
                className="text-button"
                onClick={() => setPage("devices")}
              >
                ← Qurilmalarga qaytish
              </button>
              <span aria-hidden="true">/</span>
              <span>{selected?.display_name ?? "Qurilma"}</span>
            </div>
            <ErrorBox error={devices.error} />
            {devices.isPending ? (
              <p role="status">Qurilma yuklanmoqda…</p>
            ) : selected && selected.status !== "revoked" ? (
              <Explorer
                key={selected.id}
                device={selected}
                onDownload={() => navigateStep(1)}
              />
            ) : (
              <section className="panel empty">
                <h2>
                  {selected?.status === "revoked"
                    ? "Qurilma ruxsati bekor qilingan"
                    : "Qurilma topilmadi"}
                </h2>
                <p>Qurilmalar roʻyxatiga qayting yoki agentni qayta ulang.</p>
                <button onClick={() => setPage("devices")}>
                  Qurilmalarni ochish
                </button>
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="section-head">
              <div>
                <p className="eyebrow">QURILMALAR</p>
                <h2>Kompyuterlaringiz</h2>
              </div>
              <div className="section-actions">
                <button
                  className="secondary"
                  onClick={() => devices.refetch()}
                  disabled={devices.isFetching}
                >
                  Yangilash
                </button>
                <button onClick={() => navigateStep(3)}>
                  <Icon name="link" /> Qurilma qoʻshish
                </button>
              </div>
            </div>
            <div className="stats">
              <article>
                <span>
                  <Icon name="devices" />
                  Jami qurilmalar
                </span>
                <strong>{devices.data ? list.length : "—"}</strong>
              </article>
              <article>
                <span>
                  <span className="live-dot" />
                  Tarmoqda
                </span>
                <strong>
                  {devices.data
                    ? list.filter((d) => d.status === "online").length
                    : "—"}
                </strong>
              </article>
              <article>
                <span>
                  <span className="offline-dot" />
                  Tarmoqdan tashqarida
                </span>
                <strong>
                  {devices.data
                    ? list.filter((d) => d.status !== "online").length
                    : "—"}
                </strong>
              </article>
            </div>
            <ErrorBox error={devices.error} />
            <ErrorBox error={revoke.error} />
            {devices.isPending && <p>Qurilmalar yuklanmoqda…</p>}
            {devices.data && !list.length && (
              <section className="panel empty device-empty">
                <span className="empty-icon">
                  <Icon name="devices" />
                </span>
                <h2>Hali qurilma ulanmagan</h2>
                <p>
                  Birinchi kompyuteringizni qoʻshing. Agentni oʻrnating, soʻng
                  undagi ulash kodini tasdiqlang.
                </p>
                <div className="actions">
                  <button onClick={() => navigateStep(1)}>
                    Agentni yuklab olish <Icon name="arrow" />
                  </button>
                  <button className="secondary" onClick={() => navigateStep(3)}>
                    Menda ulash kodi bor
                  </button>
                </div>
              </section>
            )}
            <div className="device-grid">
              {list.map((device) => (
                <article
                  className={`device-card ${selection.device === device.id ? "chosen" : ""}`}
                  key={device.id}
                >
                  <div className="section-head">
                    <span className={`device-icon ${device.operating_system}`}>
                      <Icon name="devices" />
                    </span>
                    <span
                      className={`status ${device.status === "online" ? "online" : ""}`}
                    >
                      {device.status === "online"
                        ? "Tarmoqda"
                        : device.status === "revoked"
                          ? "Bekor qilingan"
                          : "Tarmoqdan tashqarida"}
                    </span>
                  </div>
                  <h2>{device.display_name}</h2>
                  <p className="device-platform">
                    {platformName(device.operating_system)}{" "}
                    <span>· {device.architecture}</span>
                  </p>
                  <small>
                    Oxirgi ulanish:{" "}
                    {device.status === "online" && !device.last_seen_at
                      ? "Hozir tarmoqda"
                      : time(device.last_seen_at)}
                  </small>
                  <div className="actions">
                    <button
                      disabled={device.status === "revoked"}
                      onClick={() => {
                        selection.selectDevice(device.id);
                        setPage("device");
                      }}
                    >
                      {selection.device === device.id
                        ? "Tanlangan qurilma"
                        : "Profil va maʼlumotlar"}{" "}
                      <Icon name="arrow" />
                    </button>
                    <button
                      className="danger"
                      disabled={revoke.isPending || device.status === "revoked"}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Qurilma ruxsatini bekor qilasizmi? Agent qayta ulanish uchun yangi tasdiq olishi kerak.",
                          )
                        )
                          revoke.mutate(device.id);
                      }}
                    >
                      Ruxsatni bekor qilish
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <footer>
          Maʼlumotlar faqat ruxsat etilgan qurilmadan soʻraladi. Parollar va
          cookie fayllari yigʻilmaydi.
        </footer>
      </main>
    </div>
  );
}
