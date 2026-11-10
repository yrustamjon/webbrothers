import { useState, useEffect, useCallback, useRef } from "react";
import { query, streamQuery } from "./api";
import type { Profile } from "./Sidebar";

interface HistoryItem {
  url: string;
  title: string;
  domain?: string;
  visited_at?: string;
  visit_count?: number;
}

interface LoginItem {
  id?: string;
  domain: string;
  username: string;
  password?: string;
}

interface StreamPage {
  items: unknown[];
  total?: number;
  next_cursor?: string | null;
}

function ic(color: string, letter: string) {
  return <span className="fav" style={{ background: color }}>{letter}</span>;
}

function domainColor(domain: string) {
  const colors = ["#2f6bf0", "#a259ff", "#f0506e", "#e5483b", "#24292f", "#3a34e6", "#1fa463", "#0fb59a"];
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = domain.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function domainLetter(domain: string) {
  return (domain.replace(/^www\./, "").charAt(0) || "?").toUpperCase();
}

function fmtDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleString("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

/* ---- History ---- */
export function HistoryView({ deviceId, profile, onToast }: { deviceId: string; profile: Profile; onToast: (m: string, err?: boolean) => void }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (search = "", cur: string | null = null, replace = true) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        browser_id: profile.browser_id,
        profile_id: profile.profile_id,
        page_size: pageSize,
        stream: true,
      };
      if (search) params.search = search;
      if (cur) params.cursor = cur;

      const all: HistoryItem[] = [];
      let nextCursor: string | null = null;

      for await (const frame of streamQuery<{ payload?: StreamPage }>(
        deviceId,
        "HISTORY_QUERY",
        params,
        abortRef.current?.signal
      )) {
        if (frame.payload?.items) all.push(...(frame.payload.items as HistoryItem[]));
        if (frame.payload?.next_cursor !== undefined) nextCursor = frame.payload.next_cursor ?? null;
      }

      setItems(prev => replace ? all : [...prev, ...all]);
      setCursor(nextCursor);
      setHasMore(!!nextCursor);
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError")
        onToast((err as Error).message || "Tarix yuklanmadi", true);
    } finally {
      setLoading(false);
    }
  }, [deviceId, profile, pageSize, onToast]);

  useEffect(() => { setItems([]); setCursor(null); setHasMore(false); load(""); }, [profile.profile_id, profile.browser_id]);

  const filtered = q
    ? items.filter(r => (r.title + r.url).toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <section>
      <div className="bar">
        <div className="srch">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Sayt yoki sarlavha qidirish" />
        </div>
        <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
          <option value={50}>50 ta</option><option value={100}>100 ta</option>
        </select>
        <button className="btn o" onClick={() => load(q)} disabled={loading}>
          <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" /></svg>
          Yangilash
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : (
        <>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Sahifa</th><th>Domen</th><th>Tashrif vaqti</th><th className="r">Tashriflar</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty">Yozuv topilmadi</div></td></tr>
                ) : filtered.map((r, i) => {
                  const dom = r.domain || new URL(r.url).hostname;
                  return (
                    <tr key={i}>
                      <td>
                        <div className="site">
                          {ic(domainColor(dom), domainLetter(dom))}
                          <div>
                            <b>{r.title || dom}</b>
                            <small>{r.url}</small>
                          </div>
                        </div>
                      </td>
                      <td>{dom}</td>
                      <td>{fmtDate(r.visited_at)}</td>
                      <td className="r">{r.visit_count ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="foot">
            <span><b>{filtered.length}</b> ta yozuv{hasMore ? " (yana bor)" : ""}</span>
            <div className="pg">
              {hasMore && (
                <button className="btn o" onClick={() => load(q, cursor, false)} disabled={loading}>
                  Yana yuklash
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ---- Logins ---- */
export function LoginsView({ deviceId, profile, onToast }: { deviceId: string; profile: Profile; onToast: (m: string, err?: boolean) => void }) {
  const [items, setItems] = useState<LoginItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [revealed, setRevealed] = useState<Record<number, string | null>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ domain: "", username: "", password: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all: LoginItem[] = [];
      for await (const frame of streamQuery<{ payload?: { items?: LoginItem[] } }>(
        deviceId,
        "LOGIN_INVENTORY_QUERY",
        { browser_id: profile.browser_id, profile_id: profile.profile_id, page_size: 100 }
      )) {
        if (frame.payload?.items) all.push(...frame.payload.items);
      }
      setItems(all);
    } catch (err: unknown) {
      onToast((err as Error).message || "Loginlar yuklanmadi", true);
    } finally {
      setLoading(false);
    }
  }, [deviceId, profile, onToast]);

  useEffect(() => { setItems([]); load(); }, [profile.profile_id, profile.browser_id, load]);

  const revealPassword = async (idx: number, item: LoginItem) => {
    if (revealed[idx] !== undefined) {
      setRevealed(r => ({ ...r, [idx]: r[idx] === null ? item.password ?? null : null }));
      return;
    }
    try {
      const data = await query<{ payload?: { password?: string } }>(
        deviceId,
        "PASSWORD_REVEAL_QUERY",
        { browser_id: profile.browser_id, profile_id: profile.profile_id, domain: item.domain, username: item.username }
      );
      setRevealed(r => ({ ...r, [idx]: data.payload?.password ?? item.password ?? null }));
    } catch {
      setRevealed(r => ({ ...r, [idx]: item.password ?? null }));
    }
  };

  const deleteItem = async (item: LoginItem, idx: number) => {
    try {
      await query(
        deviceId,
        "LOGIN_DELETE_COMMAND",
        { browser_id: profile.browser_id, profile_id: profile.profile_id, domain: item.domain, username: item.username }
      );
      setItems(prev => prev.filter((_, i) => i !== idx));
      onToast("Login o'chirildi");
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik", true);
    }
  };

  const addLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await query(
        deviceId,
        "LOGIN_CREATE_COMMAND",
        { browser_id: profile.browser_id, profile_id: profile.profile_id, ...form }
      );
      setItems(prev => [...prev, { ...form }]);
      setForm({ domain: "", username: "", password: "" });
      setAdding(false);
      onToast("Login qo'shildi");
    } catch (err: unknown) {
      onToast((err as Error).message || "Xatolik", true);
    }
  };

  const filtered = q ? items.filter(r => (r.domain + r.username).toLowerCase().includes(q.toLowerCase())) : items;

  return (
    <section>
      <div className="bar">
        <div className="srch">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Domen yoki username qidirish" />
        </div>
        <button className="btn" onClick={() => setAdding(true)}>＋ Qo'shish</button>
        <button className="btn o" onClick={load} disabled={loading}>
          <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" /></svg>
          Yangilash
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr><th>Sayt</th><th>Username / email</th><th>Parol</th><th>Brauzer</th><th>Holat</th><th className="r">Amallar</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><div className="empty">Login topilmadi</div></td></tr>
              ) : filtered.map((r, i) => (
                <tr key={i}>
                  <td><div className="site">{ic(domainColor(r.domain), domainLetter(r.domain))}<b>{r.domain}</b></div></td>
                  <td>{r.username}</td>
                  <td>
                    <span>{revealed[i] != null ? (revealed[i] || "—") : "••••••••"}</span>{" "}
                    <button className="eye" onClick={() => revealPassword(i, r)}>
                      {revealed[i] != null ? "Yashirish" : "Ko'rish"}
                    </button>
                  </td>
                  <td>{profile.browser_name}</td>
                  <td><span className="pill"><i />Saqlangan</span></td>
                  <td>
                    <div className="data-actions">
                      <button className="mini danger" onClick={() => deleteItem(r, i)}>O'chirish</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="foot">
        <span className="muted">
          {profile.browser_name} · {profile.profile_name} · <b>{filtered.length}</b> yozuv
        </span>
      </div>

      {adding && (
        <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) setAdding(false); }}>
          <div className="dialog">
            <h2>Yangi login qo'shish</h2>
            <form onSubmit={addLogin}>
              <label className="form-field">Sayt domeni<input required value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="example.com" /></label>
              <label className="form-field">Username / email<input required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></label>
              <label className="form-field">Parol<input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></label>
              <div className="dialog-buttons">
                <button type="button" className="btn o" onClick={() => setAdding(false)}>Bekor qilish</button>
                <button type="submit" className="btn">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
