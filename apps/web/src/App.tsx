import { useState, lazy, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  APIError,
  queryAgent,
  type Device,
  type Browser,
  type History,
} from "./api";
import { useSelection } from "./store";
import Downloads from "./Downloads";
import DeviceSettings from "./DeviceSettings";
import {
  scopes,
  toggleBrowser,
  queryParams,
  unwrap,
  safeURL,
} from "./model.mjs";
const TrafficView = lazy(() => import("./TrafficView"));
const time = (value?: string) =>
  value ? new Date(value).toLocaleString("uz-UZ") : "Hali ulanmagan";
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
    <main className="auth">
      <div className="brand">◈ Brauzer nazorati</div>
      <h1>Qurilmalaringiz. Sizning nazoratingiz.</h1>
      <p className="muted">
        Brauzer maʼlumotlari markaziy bazada saqlanmaydi. Faqat oʻzingiz ruxsat
        bergan qurilmalarga ulaning.
      </p>
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
    </main>
  );
}
export function Pairing({ onDone }: { onDone: () => void }) {
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
    <section className="panel">
      <h2>Yangi qurilmani ulash</h2>
      <p>
        Agentni faqat oʻzingiz boshqaradigan kompyuterda ishga tushiring. Agent
        koʻrsatgan bir martalik kodni kiriting.
      </p>
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
          <p role="status">Ulash tasdiqlandi. Agent ulanishini kuting.</p>
        )}
        <button disabled={!chosen.length || mutation.isPending}>
          Ulashni tasdiqlash
        </button>
      </form>
    </section>
  );
}
function HistoryView({
  device,
  browser,
  profile,
}: {
  device: string;
  browser: string;
  profile: string;
}) {
  const [filters, setFilters] = useState({
    search: "",
    start: "",
    end: "",
    sort: "desc",
    page: 1,
  });
  const [applied, setApplied] = useState(filters);
  const history = useQuery<History>({
    queryKey: ["history", device, browser, profile, applied],
    queryFn: async () =>
      unwrap(
        await queryAgent(
          device,
          "HISTORY_QUERY",
          queryParams(browser, profile, applied),
        ),
      ) as History,
  });
  return (
    <section>
      <h2>Koʻrish tarixi</h2>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...filters, page: 1 });
        }}
      >
        <label>
          URL, sarlavha yoki domen
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
        <label>
          Boshlanish (UTC)
          <input
            type="date"
            value={filters.start}
            onChange={(e) => setFilters({ ...filters, start: e.target.value })}
          />
        </label>
        <label>
          Tugash (UTC)
          <input
            type="date"
            value={filters.end}
            onChange={(e) => setFilters({ ...filters, end: e.target.value })}
          />
        </label>
        <label>
          Tartib
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="desc">Eng yangi</option>
            <option value="asc">Eng eski</option>
          </select>
        </label>
        <button>Qidirish</button>
        <button
          type="button"
          className="secondary"
          onClick={() => history.refetch()}
        >
          Yangilash
        </button>
      </form>
      <ErrorBox error={history.error} />
      {history.isFetching && <p role="status">Agentdan olinmoqda…</p>}
      {history.data && (
        <>
          <p className="muted">
            {history.data.total === undefined
              ? "Jami yozuvlar soni mavjud emas"
              : `${history.data.total} ta yozuv`}{" "}
            · Sahifa {applied.page}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Sahifa</th>
                  <th>Domen</th>
                  <th>Vaqt</th>
                  <th>Tashrif</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((row, i) => (
                  <tr key={`${row.url}-${i}`}>
                    <td>
                      {safeURL(row.url) ? (
                        <a
                          href={safeURL(row.url)!}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {row.title || row.url}
                        </a>
                      ) : (
                        <span>{row.title || row.url}</span>
                      )}
                      <small>{row.url}</small>
                    </td>
                    <td>{row.domain}</td>
                    <td>{time(row.visited_at)}</td>
                    <td>{row.visit_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!history.data.items.length && (
            <p>Tanlangan filtrlarda tarix topilmadi.</p>
          )}
          <div className="actions">
            <button
              disabled={applied.page === 1 || history.isFetching}
              onClick={() => setApplied({ ...applied, page: applied.page - 1 })}
            >
              Oldingi
            </button>
            <button
              disabled={history.data.items.length < 25 || history.isFetching}
              onClick={() => setApplied({ ...applied, page: applied.page + 1 })}
            >
              Keyingi
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function Explorer({ device }: { device: Device }) {
  const selection = useSelection();
  const [tab, setTab] = useState("history");
  const tabs = [
    ...(device.scopes.includes("history.read") ? [["history", "Tarix"]] : []),
    ...(device.operating_system === "linux" &&
    device.scopes.includes("traffic.aggregate")
      ? [["traffic", "Trafik"]]
      : []),
  ];
  const activeTab = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0];
  const browsers = useQuery<{ items: Browser[] }>({
    queryKey: ["browsers", device.id],
    queryFn: async () =>
      unwrap(await queryAgent(device.id, "BROWSER_LIST_REQUEST")) as {
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
  return (
    <section className="panel">
      <h2>{device.display_name}</h2>
      <p className="muted">
        {device.operating_system} · {device.architecture} ·{" "}
        {device.status === "online" ? "Tarmoqda" : "Tarmoqdan tashqarida"}
      </p>
      <DeviceSettings device={device} />
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
          <div className="explorer">
            <nav aria-label="Brauzer va profillar">
              <button className="secondary" onClick={() => browsers.refetch()}>
                Brauzerlarni yangilash
              </button>
              {browsers.isFetching && <p>Qidirilmoqda…</p>}
              {browsers.data?.items.length === 0 && (
                <p>Qoʻllab-quvvatlanadigan brauzer topilmadi.</p>
              )}
              {browsers.data?.items.map((browser) => (
                <div key={browser.id}>
                  <button
                    className="browser"
                    aria-expanded={selection.browser === browser.id}
                    onClick={() =>
                      selection.selectBrowser(
                        toggleBrowser(selection.browser, browser.id),
                      )
                    }
                  >
                    {browser.name}
                    <span>{selection.browser === browser.id ? "−" : "+"}</span>
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
                          onClick={() => selection.selectProfile(profile.id)}
                        >
                          {profile.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
            <div className="detail">
              {selectedProfile && selectedBrowser ? (
                <>
                  <h3>
                    {selectedBrowser.name} / {selectedProfile.name}
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
                        onClick={() => setTab(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {activeTab === "history" && (
                    <HistoryView
                      key={`${device.id}-${selection.profile}`}
                      device={device.id}
                      browser={selectedBrowser.id}
                      profile={selectedProfile.id}
                    />
                  )}{" "}
                  {!tabs.length && (
                    <p role="status">
                      Bu profil uchun maʼlumot oʻqish ruxsati berilmagan.
                    </p>
                  )}
                  {activeTab === "traffic" && (
                    <Suspense
                      fallback={
                        <p role="status">Trafik grafigi yuklanmoqda…</p>
                      }
                    >
                      <TrafficView device={device.id} />
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
  return (
    <div className="app">
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("devices");
          }}
        >
          ◈ Brauzer nazorati
        </a>
        <nav aria-label="Asosiy menyu">
          <button
            className={page === "devices" ? "active" : ""}
            onClick={() => setPage("devices")}
          >
            Qurilmalar
          </button>
          <button
            className={page === "pairing" ? "active" : ""}
            onClick={() => setPage("pairing")}
          >
            Qurilma ulash
          </button>
          <button
            className={page === "downloads" ? "active" : ""}
            onClick={() => setPage("downloads")}
          >
            Agent yuklash
          </button>
          <button
            className={page === "account" ? "active" : ""}
            onClick={() => setPage("account")}
          >
            Hisob
          </button>
        </nav>
        <button
          className="secondary"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Chiqish
        </button>
      </header>
      <main className="content">
        <ErrorBox error={logout.error} />
        {page === "downloads" ? (
          <Downloads />
        ) : page === "account" ? (
          <Account email={me.data.email} />
        ) : page === "pairing" ? (
          <Pairing
            onDone={() => {
              void devices.refetch();
            }}
          />
        ) : (
          <>
            <div className="section-head">
              <div>
                <p className="eyebrow">SHAXSIY ISH MAYDONI</p>
                <h1>Qurilmalaringiz</h1>
              </div>
              <button onClick={() => setPage("pairing")}>
                + Qurilma ulash
              </button>
            </div>
            <div className="stats">
              <article>
                <span>Jami qurilmalar</span>
                <strong>{devices.data ? list.length : "—"}</strong>
              </article>
              <article>
                <span>Tarmoqda</span>
                <strong>
                  {devices.data
                    ? list.filter((d) => d.status === "online").length
                    : "—"}
                </strong>
              </article>
              <article>
                <span>Tarmoqdan tashqarida</span>
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
              <section className="panel empty">
                <h2>Hali qurilma ulanmagan</h2>
                <p>
                  Agentni kompyuteringizda ishga tushiring va bir martalik kod
                  bilan ulang.
                </p>
              </section>
            )}
            <div className="device-grid">
              {list.map((device) => (
                <article
                  className={`device-card ${selection.device === device.id ? "chosen" : ""}`}
                  key={device.id}
                >
                  <div className="section-head">
                    <h2>{device.display_name}</h2>
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
                  <p>
                    {device.operating_system} · {device.architecture}
                  </p>
                  <small>Oxirgi ulanish: {time(device.last_seen_at)}</small>
                  <div className="actions">
                    <button
                      disabled={device.status === "revoked"}
                      onClick={() => selection.selectDevice(device.id)}
                    >
                      Ochish
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
            {selected && <Explorer key={selected.id} device={selected} />}
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
