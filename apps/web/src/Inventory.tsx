import { useState } from "react";
import { api } from "./api";
import { unwrap } from "./model.mjs";
import { useAgentPage } from "./useAgentPage";
import VirtualList from "./VirtualList";
import LocalPasswords from "./LocalPasswords";
import {
  PageControls,
  usePageControls,
  type DataViewProps,
} from "./PagedQuery";

type Login = { domain: string; username: string; credential_exists: boolean };

export default function Inventory({
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

  // Password management states
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const [revealError, setRevealError] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Record<string, boolean>>(
    {},
  );

  // Add login form states
  const [showCreate, setShowCreate] = useState(false);
  const [createDomain, setCreateDomain] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
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
      if (!data?.password) {
        throw new Error("Parol topilmadi yoki boʻsh");
      }
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
      // ignore clipboard error
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
      const msg = err instanceof Error ? err.message : "Oʻchirishda xatolik";
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
      setCreateSuccess("Login va parol muvaffaqiyatli saqlandi!");
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

  return (
    <section>
      <h2>Saqlangan saytlar va loginlar</h2>
      <p>
        Tanlangan profilingizdagi login va parollarni yagona joyda koʻrish,
        yangi qoʻshish va oʻchirish.
      </p>
      {!modern && (
        <p className="muted">
          Eski agent eng koʻpi 200 ta login metamaʼlumotini qaytaradi. Qidiruv
          va cursor sahifalash uchun agentni yangilang.
        </p>
      )}

      <div
        style={{
          margin: "14px 0",
          display: "flex",
          gap: "10px",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className={showCreate ? "secondary" : "primary"}
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Yopish" : "+ Yangi login qoʻshish"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="create-login-card">
          <h3>Yangi login va parol saqlash</h3>
          <p
            className="muted"
            style={{ margin: "4px 0 10px 0", fontSize: "12px" }}
          >
            Maʼlumot bevosita tanlangan {browserName} ({profileName})
            profilingizning Login Data bazasiga shifrlanib yoziladi.
          </p>
          <div
            style={{
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <label>
              Sayt domeni yoki URL
              <input
                required
                placeholder="masalan, google.com"
                value={createDomain}
                onChange={(e) => setCreateDomain(e.target.value)}
              />
            </label>
            <label>
              Foydalanuvchi nomi yoki Email
              <input
                required
                placeholder="masalan, user@gmail.com"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
              />
            </label>
            <label>
              Parol
              <input
                required
                type="password"
                placeholder="Parolni kiriting"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button type="submit" disabled={creating}>
              {creating ? "Saqlanmoqda…" : "Saqlash"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowCreate(false)}
            >
              Bekor qilish
            </button>
          </div>
          {createError && (
            <p role="alert" className="error" style={{ marginTop: "8px" }}>
              {createError}
            </p>
          )}
          {createSuccess && (
            <p role="status" style={{ color: "#166534", marginTop: "8px" }}>
              {createSuccess}
            </p>
          )}
        </form>
      )}

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          controls.apply();
        }}
      >
        <label>
          Sayt yoki login boʻyicha qidirish
          <input
            disabled={!modern}
            value={controls.draft.search}
            onChange={(e) =>
              controls.setDraft({ ...controls.draft, search: e.target.value })
            }
          />
        </label>
        <label>
          Loginlar tartibi
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
        <button disabled={!modern}>Qidirish</button>
        <button
          type="button"
          className="secondary"
          onClick={controls.reload}
          disabled={page.loading}
        >
          Loginlarni yangilash
        </button>
      </form>
      {page.error && (
        <p role="alert" className="error">
          {page.error.message}
        </p>
      )}
      {page.loading && <p role="status">Loginlar olinmoqda…</p>}
      {page.data && (
        <p className="muted">
          {page.data.items.length} ta login · {browserName} · {profileName}
        </p>
      )}
      {page.data &&
        (!page.data.items.length ? (
          <p>Bu profilda saqlangan login topilmadi.</p>
        ) : (
          <VirtualList
            key={`${profile}-${controls.position}-${controls.size}`}
            items={page.data.items}
            rowHeight={150}
            label="Login metamaʼlumotlari"
            renderItem={(item) => {
              const key = `${item.domain}:${item.username}`;
              const isRevealed = revealed[key] !== undefined;
              return (
                <article className="inventory-record">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <strong>{item.domain}</strong>
                    <span>{item.username || "Koʻrsatilmagan"}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      color: "#64748b",
                      fontSize: "11px",
                    }}
                  >
                    <span>
                      {browserName} · {profileName}
                    </span>
                    <span>
                      {item.credential_exists
                        ? "Saqlangan login yozuvi"
                        : "Login mavjud emas"}
                    </span>
                  </div>
                  <div className="inventory-actions">
                    {isRevealed ? (
                      <div className="password-revealed">
                        <code>{revealed[key]}</code>
                        <button
                          type="button"
                          className="small-btn secondary"
                          onClick={() => handleCopy(revealed[key], key)}
                        >
                          {copied[key] ? "Nusxalandi!" : "Nusxalash"}
                        </button>
                        <button
                          type="button"
                          className="small-btn secondary"
                          onClick={() => handleReveal(item)}
                        >
                          Yashirish
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="small-btn secondary"
                        disabled={revealing[key]}
                        onClick={() => handleReveal(item)}
                      >
                        {revealing[key] ? "Ochilmoqda…" : "Parolni koʻrish"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="small-btn danger"
                      disabled={deleting[key]}
                      onClick={() => handleDelete(item)}
                    >
                      {deleting[key]
                        ? "Oʻchirilmoqda…"
                        : deleteConfirm[key]
                          ? "Rostdan oʻchirilsinmi?"
                          : "Oʻchirish"}
                    </button>
                  </div>
                  {revealError[key] && (
                    <small
                      role="alert"
                      className="error"
                      style={{ color: "#b91c1c" }}
                    >
                      {revealError[key]}
                    </small>
                  )}
                </article>
              );
            }}
          />
        ))}
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
      <LocalPasswords browser={browser} />
    </section>
  );
}
