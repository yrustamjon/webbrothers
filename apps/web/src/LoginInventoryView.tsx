import { useState } from "react";
import { api } from "./api";
import { unwrap } from "./model.mjs";
import { useAgentPage } from "./useAgentPage";
import VirtualList from "./VirtualList";
import {
  PageControls,
  usePageControls,
  type DataViewProps,
} from "./PagedQuery";

type Login = { domain: string; username: string; credential_exists: boolean };

function SiteIcon({ domain }: { domain: string }) {
  const d = domain.toLowerCase();
  if (d.includes("docs.example.com") || d.includes("docs.google")) {
    return (
      <span className="site-favicon-box docs" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
        </svg>
      </span>
    );
  }
  if (
    d.includes("code.example.com") ||
    d.includes("github") ||
    d.includes("gitlab")
  ) {
    return (
      <span className="site-favicon-box code" aria-hidden="true">
        &lt;/&gt;
      </span>
    );
  }
  if (
    d.includes("mail.example.com") ||
    d.includes("gmail") ||
    d.includes("mail")
  ) {
    return (
      <span className="site-favicon-box mail" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M3 6l9 6 9-6v12H3z" opacity="0.3" />
          <path fill="#EA4335" d="M21 6l-9 6-9-6v1l9 6 9-6z" />
          <path fill="#FBBC05" d="M3 6v12h3V9l6 4 6-4v9h3V6z" />
          <path fill="#34A853" d="M3 18h18v2H3z" />
        </svg>
      </span>
    );
  }
  if (d.includes("design.example.com") || d.includes("figma")) {
    return (
      <span className="site-favicon-box design" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="8" cy="8" r="4" fill="#F24E1E" />
          <circle cx="16" cy="8" r="4" fill="#FF7262" />
          <circle cx="8" cy="16" r="4" fill="#0ACF83" />
          <circle cx="16" cy="16" r="4" fill="#1ABCFE" />
        </svg>
      </span>
    );
  }
  if (d.includes("tasks.example.com") || d.includes("asana")) {
    return (
      <span className="site-favicon-box tasks" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="7" r="3.5" fill="#F06A6A" />
          <circle cx="7" cy="16" r="3.5" fill="#F06A6A" />
          <circle cx="17" cy="16" r="3.5" fill="#F06A6A" />
        </svg>
      </span>
    );
  }
  if (d.includes("cloud.example.com") || d.includes("drive")) {
    return (
      <span className="site-favicon-box cloud" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <polygon points="8,4 16,4 21,13 13,13" fill="#FFC107" />
          <polygon points="3,13 8,4 13,13 8,22" fill="#2196F3" />
          <polygon points="8,22 13,13 21,13 16,22" fill="#4CAF50" />
        </svg>
      </span>
    );
  }
  return (
    <span className="site-favicon-box default-domain" aria-hidden="true">
      {domain.slice(0, 1).toUpperCase()}
    </span>
  );
}

function BrowserLogo({ browser }: { browser: string }) {
  const b = browser.toLowerCase();
  if (b.includes("firefox")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#FF7139" />
        <path d="M12 4a8 8 0 1 0 8 8 8 8 0 0 0-8-8z" fill="#FF9400" />
        <path
          d="M11 7a5 5 0 0 0-4 7.5A6 6 0 1 1 15 9a5 5 0 0 0-4-2z"
          fill="#0A84FF"
        />
      </svg>
    );
  }
  if (b.includes("safari")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#006CFF" />
        <circle cx="12" cy="12" r="9" fill="#FFFFFF" />
        <polygon points="12,4 14,11 12,13 10,12" fill="#FF3B30" />
        <polygon points="12,20 10,13 12,11 14,12" fill="#006CFF" />
        <circle cx="12" cy="12" r="1.5" fill="#FFFFFF" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#4285F4" />
      <circle cx="12" cy="12" r="4.5" fill="#FFFFFF" />
      <circle cx="12" cy="12" r="3.5" fill="#1A73E8" />
      <path d="M12 2a10 10 0 0 1 8.66 5H12" fill="#EA4335" />
      <path d="M20.66 7A10 10 0 0 1 12 22l4.33-7.5" fill="#FBBC05" />
      <path d="M12 22A10 10 0 0 1 3.34 7l4.33 7.5" fill="#34A853" />
    </svg>
  );
}

export default function LoginInventoryView({
  device,
  browser,
  profile,
  capabilities = [],
  browserName,
  profileName,
}: DataViewProps & { browserName: string; profileName: string }) {
  const controls = usePageControls({ search: "", sort: "asc" });
  const modern = capabilities.includes("query.cursor");
  const streaming = capabilities.includes("query.streaming");
  const canReveal = capabilities.includes("password.reveal");
  const canManage = capabilities.includes("login.inventory");

  // Reveal states
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const [revealError, setRevealError] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  // Delete states
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Record<string, boolean>>(
    {},
  );

  // Add login modal states
  const [showCreate, setShowCreate] = useState(false);
  const [createDomain, setCreateDomain] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const params: Record<string, unknown> = {
    browser_id: browser,
    profile_id: profile,
    ...(modern
      ? {
          search: controls.applied.search.trim(),
          sort: controls.applied.sort,
          page_size: controls.size,
          ...(controls.cursor ? { cursor: controls.cursor } : {}),
        }
      : {}),
  };

  const page = useAgentPage<Login>(
    device,
    "LOGIN_INVENTORY_QUERY",
    params,
    streaming,
    modern ? controls.ready : true,
    controls.refresh,
  );

  async function handleReveal(item: Login) {
    const key = `${item.domain}:${item.username}`;
    if (revealed[key] !== undefined) {
      setRevealed((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      return;
    }
    setRevealing((prev) => ({ ...prev, [key]: true }));
    setRevealError((prev) => ({ ...prev, [key]: "" }));
    try {
      const res = await api<unknown>(`/devices/${device}/query`, {
        type: "PASSWORD_REVEAL_QUERY",
        params: {
          browser_id: browser,
          profile_id: profile,
          domain: item.domain,
          username: item.username,
        },
      });
      const data = unwrap(res) as { password?: string };
      if (!data?.password) throw new Error("Parol topilmadi yoki bo'sh");
      setRevealed((prev) => ({ ...prev, [key]: data.password! }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Parol ochilmadi";
      setRevealError((prev) => ({ ...prev, [key]: msg }));
    } finally {
      setRevealing((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleCopy(password: string, key: string) {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(password);
        setCopied((prev) => ({ ...prev, [key]: true }));
        setTimeout(
          () => setCopied((prev) => ({ ...prev, [key]: false })),
          2000,
        );
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(item: Login) {
    const key = `${item.domain}:${item.username}`;
    if (!deleteConfirm[key]) {
      setDeleteConfirm((prev) => ({ ...prev, [key]: true }));
      setTimeout(
        () => setDeleteConfirm((prev) => ({ ...prev, [key]: false })),
        4000,
      );
      return;
    }
    setDeleting((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await api<unknown>(`/devices/${device}/query`, {
        type: "LOGIN_DELETE_COMMAND",
        params: {
          browser_id: browser,
          profile_id: profile,
          domain: item.domain,
          username: item.username,
        },
      });
      unwrap(res);
      controls.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "O'chirishda xatolik";
      alert(msg);
    } finally {
      setDeleting((prev) => ({ ...prev, [key]: false }));
      setDeleteConfirm((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const res = await api<unknown>(`/devices/${device}/query`, {
        type: "LOGIN_CREATE_COMMAND",
        params: {
          browser_id: browser,
          profile_id: profile,
          domain: createDomain.trim(),
          username: createUsername.trim(),
          password: createPassword,
        },
      });
      unwrap(res);
      setCreateSuccess("Login muvaffaqiyatli saqlandi!");
      setCreateDomain("");
      setCreateUsername("");
      setCreatePassword("");
      setTimeout(() => {
        setShowCreate(false);
        setCreateSuccess(null);
      }, 1500);
      controls.reload();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  const items = page.data?.items ?? [];
  const isEmpty = page.data && items.length === 0;

  return (
    <section className="login-workspace">
      {/* ── Toolbar ── */}
      <div className="login-toolbar">
        <form
          className="filters login-filters"
          onSubmit={(e) => {
            e.preventDefault();
            controls.apply();
          }}
        >
          <div className="search-input-wrap">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <label>
              <span className="sr-only">Sayt yoki login boʻyicha qidirish</span>
              <input
                placeholder="Domen yoki username qidirish"
                value={controls.draft.search}
                disabled={!modern}
                onChange={(e) =>
                  controls.setDraft({
                    ...controls.draft,
                    search: e.target.value,
                  })
                }
              />
            </label>
          </div>

          <label className="sort-dropdown-wrap">
            <span className="sr-only">Loginlar tartibi</span>
            <select
              disabled={!modern}
              value={controls.draft.sort}
              onChange={(e) =>
                controls.setDraft({ ...controls.draft, sort: e.target.value })
              }
            >
              <option value="asc">Yozuv tartibi: boshidan</option>
              <option value="desc">Yozuv tartibi: oxiridan</option>
            </select>
          </label>

          <button type="submit" disabled={!modern} className="sr-only">
            Qidirish
          </button>

          <button
            type="button"
            className="refresh-btn"
            onClick={controls.reload}
            disabled={page.loading}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>Yangilash</span>
          </button>
        </form>

        {canManage && (
          <button
            type="button"
            className="add-login-btn"
            onClick={() => setShowCreate(true)}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Login qo'shish
          </button>
        )}
      </div>

      {/* ── Add Login Modal ── */}
      {showCreate && canManage && (
        <div
          className="login-modal-backdrop"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="login-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="login-modal-header">
              <h3>Yangi login saqlash</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreate(false)}
                aria-label="Yopish"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="login-modal-desc">
              Ma'lumot bevosita {browserName} · {profileName} profilingizga
              shifrlanib yoziladi.
            </p>
            <form onSubmit={handleCreate} className="login-modal-form">
              <label className="modal-field">
                <span>Sayt domeni yoki URL</span>
                <input
                  required
                  placeholder="masalan, google.com"
                  value={createDomain}
                  onChange={(e) => setCreateDomain(e.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>Foydalanuvchi nomi yoki Email</span>
                <input
                  required
                  placeholder="masalan, user@gmail.com"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>Parol</span>
                <div className="modal-pw-wrap">
                  <input
                    required
                    type={showCreatePw ? "text" : "password"}
                    placeholder="Parolni kiriting"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="eye-btn modal-eye"
                    onClick={() => setShowCreatePw((v) => !v)}
                    aria-label={
                      showCreatePw ? "Parolni yashirish" : "Parolni ko'rsatish"
                    }
                  >
                    {showCreatePw ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              {createError && (
                <p role="alert" className="modal-error">
                  {createError}
                </p>
              )}
              {createSuccess && (
                <p role="status" className="modal-success">
                  ✓ {createSuccess}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setShowCreate(false)}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="modal-save-btn"
                  disabled={creating}
                >
                  {creating ? "Saqlanmoqda…" : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Errors & Loading ── */}
      {page.error && (
        <p role="alert" className="error">
          {page.error.message}
        </p>
      )}
      {page.loading && <p role="status">Loginlar olinmoqda…</p>}

      {/* ── Table ── */}
      {isEmpty ? (
        <p className="empty">Bu profilda saqlangan login topilmadi.</p>
      ) : (
        items.length > 0 && (
          <div className="login-table-container">
            <div className="login-columns" aria-hidden="true">
              <span>Sayt</span>
              <span>Username / email</span>
              <span>Parol</span>
              <span>Brauzer</span>
              <span>Holat</span>
              {canManage && <span>Amal</span>}
            </div>

            <VirtualList
              key={`${profile}-${controls.position}-${controls.size}`}
              items={items}
              rowHeight={54}
              height={380}
              label="Login ma'lumotlari"
              renderItem={(item) => {
                const key = `${item.domain}:${item.username}`;
                const isRevealed = revealed[key] !== undefined;
                const isRevealing = !!revealing[key];
                const isDeleting = !!deleting[key];
                const awaitingConfirm = !!deleteConfirm[key];
                const isCopied = !!copied[key];

                return (
                  <article className="login-table-row">
                    {/* Site */}
                    <div className="login-site">
                      <SiteIcon domain={item.domain} />
                      <strong title={item.domain}>{item.domain}</strong>
                    </div>

                    {/* Username */}
                    <span className="login-username" title={item.username}>
                      {item.username || "Ko'rsatilmagan"}
                    </span>

                    {/* Password */}
                    <div className="password-cell">
                      {isRevealed ? (
                        <>
                          <span className="revealed-password-text">
                            {revealed[key]}
                          </span>
                          <button
                            type="button"
                            className="eye-btn active"
                            onClick={() => handleReveal(item)}
                            aria-label="Parolni yashirish"
                            title="Parolni yashirish"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              aria-hidden="true"
                            >
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="copy-btn"
                            onClick={() => handleCopy(revealed[key], key)}
                            aria-label="Parolni nusxalash"
                            title="Nusxalash"
                          >
                            {isCopied ? (
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              <svg
                                viewBox="0 0 24 24"
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                <rect
                                  x="9"
                                  y="9"
                                  width="13"
                                  height="13"
                                  rx="2"
                                />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className="masked-password-dots"
                            aria-label={
                              canReveal
                                ? "Parol yashirin"
                                : "Parol APIga ulanmagan"
                            }
                          >
                            ••••••••
                          </span>
                          <button
                            type="button"
                            className={`eye-btn ${isRevealing ? "loading" : ""}`}
                            disabled={!canReveal || isRevealing}
                            aria-label={
                              canReveal
                                ? isRevealing
                                  ? "Ochilmoqda…"
                                  : "Parolni koʻrsatish"
                                : "Parol koʻrsatish ulanmagan"
                            }
                            title={
                              canReveal
                                ? "Parolni koʻrsatish"
                                : "Parol funksiyasi APIga ulanmagan"
                            }
                            onClick={() => canReveal && handleReveal(item)}
                          >
                            {isRevealing ? (
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                                className="spin-icon"
                              >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden="true"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                        </>
                      )}
                      {revealError[key] && (
                        <span
                          className="reveal-error"
                          role="alert"
                          title={revealError[key]}
                        >
                          !
                        </span>
                      )}
                    </div>

                    {/* Browser */}
                    <div className="login-browser-cell">
                      <BrowserLogo browser={browserName} />
                      <span>{browserName.replace("Google ", "")}</span>
                    </div>

                    {/* Status */}
                    <div className="login-status-cell">
                      <span className="saved-status-badge">
                        <span className="status-dot-green" />
                        <span>Saqlangan</span>
                      </span>
                    </div>

                    {/* Actions (delete) */}
                    {canManage && (
                      <div className="login-action-cell">
                        <button
                          type="button"
                          className={`delete-login-btn ${awaitingConfirm ? "confirming" : ""}`}
                          disabled={isDeleting}
                          onClick={() => handleDelete(item)}
                          aria-label={
                            isDeleting
                              ? "O'chirilmoqda…"
                              : awaitingConfirm
                                ? "Tasdiqlash uchun qayta bosing"
                                : "Loginni o'chirish"
                          }
                          title={
                            awaitingConfirm
                              ? "Tasdiqlash uchun qayta bosing"
                              : "O'chirish"
                          }
                        >
                          {isDeleting ? (
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                              className="spin-icon"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          ) : awaitingConfirm ? (
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              aria-hidden="true"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              aria-hidden="true"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          )}
                          <span className="sr-only">
                            {awaitingConfirm ? "Tasdiqlash" : "O'chirish"}
                          </span>
                        </button>
                      </div>
                    )}
                  </article>
                );
              }}
            />
          </div>
        )
      )}

      {/* ── Pagination footer ── */}
      <div className="login-pagination-bar">
        <p className="data-source-note">
          Login ma'lumotlari · {browserName.replace("Google ", "")} ·{" "}
          {profileName}
        </p>

        <div className="page-actions-group">
          {modern && (
            <PageControls
              size={controls.size}
              onSize={controls.setSize}
              position={controls.position}
              loading={page.loading || !controls.ready}
              hasMore={!!page.data?.has_more && !!page.data.next_cursor}
              previous={controls.previous}
              next={() => controls.next(page.data?.next_cursor)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
