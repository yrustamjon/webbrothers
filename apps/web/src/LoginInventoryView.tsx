import { useEffect, useState } from "react";
import { useAgentPage } from "./useAgentPage";
import VirtualList from "./VirtualList";
import {
  PageControls,
  usePageControls,
  type DataViewProps,
} from "./PagedQuery";
type Login = { domain: string; username: string; credential_exists: boolean };
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
  const [mobile, setMobile] = useState(() => window.innerWidth < 760);
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 760);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const page = useAgentPage<Login>(
    device,
    "LOGIN_INVENTORY_QUERY",
    {
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
    },
    capabilities.includes("query.streaming"),
    modern ? controls.ready : true,
    controls.refresh,
  );
  return (
    <section className="login-workspace">
      <div className="data-heading">
        <div>
          <h2>Saqlangan loginlar</h2>
          <p>{profileName}</p>
        </div>
        <span className="metadata-badge">Login metamaʼlumotlari</span>
      </div>
      <form
        className="filters login-filters"
        onSubmit={(e) => {
          e.preventDefault();
          controls.apply();
        }}
      >
        <label>
          <span className="sr-only">Sayt yoki login boʻyicha qidirish</span>
          <input
            placeholder="Domen yoki username qidirish"
            value={controls.draft.search}
            disabled={!modern}
            onChange={(e) =>
              controls.setDraft({ ...controls.draft, search: e.target.value })
            }
          />
        </label>
        <label>
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
        <button type="submit" disabled={!modern}>
          Qidirish
        </button>
        <button
          type="button"
          className="secondary"
          onClick={controls.reload}
          disabled={page.loading}
        >
          Yangilash
        </button>
      </form>
      {!modern && (
        <p className="muted">
          Eski agent: koʻpi bilan 200 ta login. Qidiruv va sahifalash uchun
          agentni yangilang.
        </p>
      )}
      {page.error && (
        <p role="alert" className="error">
          {page.error.message}
        </p>
      )}
      {page.loading && <p role="status">Loginlar olinmoqda…</p>}
      <div className="login-columns" aria-hidden="true">
        <span>Sayt</span>
        <span>Username / email</span>
        <span>Parol</span>
        <span>Brauzer</span>
        <span>Holat</span>
      </div>
      {page.data &&
        (!page.data.items.length ? (
          <p className="empty">Bu profilda saqlangan login topilmadi.</p>
        ) : (
          <VirtualList
            key={`${profile}-${controls.position}-${controls.size}`}
            items={page.data.items}
            rowHeight={mobile ? 156 : 72}
            height={504}
            label="Login metamaʼlumotlari"
            renderItem={(item) => (
              <article className="login-table-row">
                <div className="login-site">
                  <span className="site-monogram" aria-hidden="true">
                    {item.domain.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{item.domain}</strong>
                </div>
                <span className="login-username" title={item.username}>
                  {item.username || "Koʻrsatilmagan"}
                </span>
                <span className="password-placeholder">
                  <span>Ulanmagan</span>
                  <button
                    type="button"
                    className="eye-placeholder"
                    disabled
                    aria-label="Parol koʻrsatish ulanmagan"
                    title="Parol funksiyasi APIʼga ulanmagan"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </span>
                <span className="login-browser">
                  <span
                    className={`browser-dot ${browser}`}
                    aria-hidden="true"
                  />
                  {browserName}
                </span>
                <span
                  className={
                    item.credential_exists ? "saved-status" : "missing-status"
                  }
                >
                  {item.credential_exists ? "Saqlangan" : "Mavjud emas"}
                </span>
              </article>
            )}
          />
        ))}
      <p className="muted password-integration-note">
        Parol ustuni va koʻzcha APIʼga ulanmagan. Bu sahifa faqat login
        metamaʼlumotlarini oladi.
      </p>
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
      <p className="data-source-note">
        {page.data?.items.length ?? 0} ta yozuv · {browserName} · {profileName}
      </p>
    </section>
  );
}
