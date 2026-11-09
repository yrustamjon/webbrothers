import { useEffect, useState } from "react";
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

const SAMPLE_LOGINS: Login[] = [
  {
    domain: "example.com",
    username: "rustam@example.com",
    credential_exists: true,
  },
  {
    domain: "docs.example.com",
    username: "work@example.com",
    credential_exists: true,
  },
  {
    domain: "code.example.com",
    username: "developer@example.com",
    credential_exists: true,
  },
  {
    domain: "mail.example.com",
    username: "rustam@example.com",
    credential_exists: true,
  },
  {
    domain: "design.example.com",
    username: "designer@example.com",
    credential_exists: true,
  },
  {
    domain: "tasks.example.com",
    username: "team@example.com",
    credential_exists: true,
  },
  {
    domain: "cloud.example.com",
    username: "admin@example.com",
    credential_exists: true,
  },
];

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
  const [revealed, setRevealed] = useState<Record<string, string>>({
    "docs.example.com:work@example.com": "Demo#4821",
  });

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

  function toggleReveal(key: string, defaultPw = "Demo#4821") {
    setRevealed((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = defaultPw;
      }
      return next;
    });
  }

  const items = page.data?.items ?? [];
  const isEmpty = page.data && items.length === 0;

  return (
    <section className="login-workspace">
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
                controls.setDraft({ ...controls.draft, search: e.target.value })
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

      {page.error && (
        <p role="alert" className="error">
          {page.error.message}
        </p>
      )}

      {page.loading && <p role="status">Loginlar olinmoqda…</p>}

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
            </div>

            <VirtualList
              key={`${profile}-${controls.position}-${controls.size}`}
              items={items}
              rowHeight={mobile ? 140 : 54}
              height={mobile ? 420 : 380}
              label="Login metamaʼlumotlari"
              renderItem={(item) => {
                const key = `${item.domain}:${item.username}`;
                const isRevealed = !!revealed[key];
                const canReveal = capabilities.includes("password.reveal");

                return (
                  <article className="login-table-row">
                    <div className="login-site">
                      <SiteIcon domain={item.domain} />
                      <strong>{item.domain}</strong>
                    </div>

                    <span className="login-username" title={item.username}>
                      {item.username || "Koʻrsatilmagan"}
                    </span>

                    <div className="password-cell">
                      {isRevealed ? (
                        <span className="revealed-password-text">
                          {revealed[key]}
                        </span>
                      ) : (
                        <span
                          className="masked-password-dots"
                          aria-label="Parol APIʼga ulanmagan"
                        >
                          ••••••••
                        </span>
                      )}

                      <button
                        type="button"
                        className={`eye-btn ${isRevealed ? "active" : ""}`}
                        disabled={!canReveal}
                        aria-label={
                          canReveal
                            ? isRevealed
                              ? "Parolni yashirish"
                              : "Parolni koʻrsatish"
                            : "Parol koʻrsatish ulanmagan"
                        }
                        title={
                          canReveal
                            ? isRevealed
                              ? "Parolni yashirish"
                              : "Parolni koʻrsatish"
                            : "Parol funksiyasi APIʼga ulanmagan"
                        }
                        onClick={() => canReveal && toggleReveal(key)}
                      >
                        {isRevealed ? (
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
                    </div>

                    <div className="login-browser-cell">
                      <BrowserLogo browser={browserName} />
                      <span>{browserName.replace("Google ", "")}</span>
                    </div>

                    <div className="login-status-cell">
                      <span className="saved-status-badge">
                        <span className="status-dot-green" />
                        <span>Saqlangan</span>
                      </span>
                    </div>
                  </article>
                );
              }}
            />
          </div>
        )
      )}

      <div className="login-pagination-bar">
        <p className="data-source-note">
          Login metamaʼlumotlari · {browserName.replace("Google ", "")} ·{" "}
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
