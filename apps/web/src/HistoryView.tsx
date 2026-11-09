import { useEffect, useState } from "react";
import { displayTime } from "./agentPage";
import { safeURL } from "./model.mjs";
import { type History } from "./api";
import VirtualList from "./VirtualList";
import { useAgentPage } from "./useAgentPage";
import {
  PageControls,
  usePageControls,
  type DataViewProps,
} from "./PagedQuery";

function compactURL(value: string) {
  const safe = safeURL(value);
  if (!safe) return "Ochib boʻlmaydigan manzil";
  const url = new URL(safe);
  const label = url.hostname + (url.pathname === "/" ? "" : url.pathname);
  return label.length > 110 ? label.slice(0, 107) + "…" : label;
}

function HistoryFavicon({ domain }: { domain: string }) {
  const d = domain.toLowerCase();
  if (d.includes("docs.example.com") || d.includes("docs.google")) {
    return (
      <span className="hist-icon-box docs" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
        </svg>
      </span>
    );
  }
  if (d.includes("design.example.com") || d.includes("figma")) {
    return (
      <span className="hist-icon-box design" aria-hidden="true">
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
      <span className="hist-icon-box tasks" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <circle cx="12" cy="7" r="3.5" fill="#F06A6A" />
          <circle cx="7" cy="16" r="3.5" fill="#F06A6A" />
          <circle cx="17" cy="16" r="3.5" fill="#F06A6A" />
        </svg>
      </span>
    );
  }
  if (
    d.includes("mail.example.com") ||
    d.includes("gmail") ||
    d.includes("mail")
  ) {
    return (
      <span className="hist-icon-box mail" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M3 6l9 6 9-6v12H3z" opacity="0.3" />
          <path fill="#EA4335" d="M21 6l-9 6-9-6v1l9 6 9-6z" />
          <path fill="#FBBC05" d="M3 6v12h3V9l6 4 6-4v9h3V6z" />
          <path fill="#34A853" d="M3 18h18v2H3z" />
        </svg>
      </span>
    );
  }
  if (d.includes("code.example.com") || d.includes("github")) {
    return (
      <span className="hist-icon-box code" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      </span>
    );
  }
  if (d.includes("help.example.com")) {
    return (
      <span className="hist-icon-box help" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
        </svg>
      </span>
    );
  }
  return (
    <span className="hist-icon-box default-hist" aria-hidden="true">
      {domain.slice(0, 1).toUpperCase()}
    </span>
  );
}

const SAMPLE_HISTORY: History["items"][number][] = [
  {
    url: "https://docs.example.com/projects/webbrothers",
    title: "Loyiha hujjatlari",
    domain: "docs.example.com",
    visited_at: "2026-11-09T14:32:00.000Z",
    visit_count: 27,
  },
  {
    url: "https://design.example.com/library/components",
    title: "Dizayn kutubxonasi",
    domain: "design.example.com",
    visited_at: "2026-11-09T14:21:00.000Z",
    visit_count: 13,
  },
  {
    url: "https://tasks.example.com/team/board",
    title: "Jamoa vazifalari",
    domain: "tasks.example.com",
    visited_at: "2026-11-09T14:07:00.000Z",
    visit_count: 18,
  },
  {
    url: "https://mail.example.com/inbox",
    title: "Ishchi pochta",
    domain: "mail.example.com",
    visited_at: "2026-11-09T13:56:00.000Z",
    visit_count: 42,
  },
  {
    url: "https://code.example.com/webbrothers/repo",
    title: "Dastur kodi",
    domain: "code.example.com",
    visited_at: "2026-11-09T13:41:00.000Z",
    visit_count: 11,
  },
  {
    url: "https://help.example.com/uz/agent/installation",
    title: "Texnik qoʻllanma",
    domain: "help.example.com",
    visited_at: "2026-11-09T13:28:00.000Z",
    visit_count: 7,
  },
  {
    url: "https://example.com/",
    title: "Bosh sahifa",
    domain: "example.com",
    visited_at: "2026-11-09T13:12:00.000Z",
    visit_count: 5,
  },
];

export default function HistoryView({
  device,
  browser,
  profile,
  capabilities = [],
}: DataViewProps) {
  const controls = usePageControls({
    search: "",
    start: "",
    end: "",
    sort: "desc",
  });
  const cursorMode = capabilities.includes("query.cursor");
  const streaming = capabilities.includes("query.streaming");
  const params = {
    browser_id: browser,
    profile_id: profile,
    search: controls.applied.search.trim(),
    sort: controls.applied.sort,
    page_size: controls.size,
    ...(cursorMode
      ? { ...(controls.cursor ? { cursor: controls.cursor } : {}) }
      : { page: controls.position + 1 }),
    ...(controls.applied.start
      ? { start: controls.applied.start + "T00:00:00.000Z" }
      : {}),
    ...(controls.applied.end
      ? { end: controls.applied.end + "T23:59:59.999Z" }
      : {}),
  };

  const page = useAgentPage<History["items"][number]>(
    device,
    "HISTORY_QUERY",
    params,
    streaming,
    controls.ready,
    controls.refresh,
  );

  const [mobile, setMobile] = useState(() => window.innerWidth < 760);
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 760);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const change = (key: string, value: string) =>
    controls.setDraft({ ...controls.draft, [key]: value });

  const items = page.data?.items ?? [];
  const isEmpty = page.data && items.length === 0;

  return (
    <section className="history-workspace">
      <form
        className="filters history-filters"
        onSubmit={(event) => {
          event.preventDefault();
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
            <span className="sr-only">URL, sarlavha yoki domen</span>
            <input
              placeholder="Sayt yoki sarlavha qidirish"
              value={controls.draft.search}
              onChange={(e) => change("search", e.target.value)}
            />
          </label>
        </div>

        <label className="sort-dropdown-wrap">
          <span className="sr-only">Vaqt oraligʻi</span>
          <select
            value={controls.draft.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="desc">Barcha vaqt</option>
            <option value="asc">Eng eski</option>
          </select>
        </label>

        <button type="submit" className="sr-only">
          Qidirish
        </button>

        <button type="button" className="refresh-btn" onClick={controls.reload}>
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

      {(!controls.ready || page.loading) && (
        <p role="status">Agentdan olinmoqda…</p>
      )}

      {isEmpty ? (
        <p>Tanlangan filtrlarda tarix topilmadi.</p>
      ) : (
        items.length > 0 && (
          <div className="history-table-container">
            <div className="history-columns" aria-hidden="true">
              <span>Sahifa</span>
              <span>Domen</span>
              <span>Oxirgi tashrif ↓</span>
              <span>Tashriflar</span>
            </div>

            <VirtualList
              key={`${profile}-${controls.position}-${controls.size}`}
              items={items}
              rowHeight={mobile ? 140 : 54}
              height={mobile ? 420 : 380}
              label="Koʻrish tarixi yozuvlari"
              renderItem={(row) => (
                <article className="history-table-row">
                  <div className="history-site-cell">
                    <HistoryFavicon domain={row.domain || ""} />
                    <div className="history-site-meta">
                      {safeURL(row.url) ? (
                        <a
                          className="history-title"
                          title={row.url}
                          href={safeURL(row.url)!}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {row.title || compactURL(row.url)}
                        </a>
                      ) : (
                        <span className="history-title">
                          {row.title || compactURL(row.url)}
                        </span>
                      )}
                      <small className="history-url">
                        {compactURL(row.url)}
                      </small>
                      <details className="history-address">
                        <summary>Toʻliq manzil</summary>
                        <code>{row.url}</code>
                      </details>
                    </div>
                  </div>

                  <span className="history-domain-cell">
                    {row.domain || "—"}
                  </span>

                  <span className="history-time-cell">
                    {row.visited_at
                      ? new Date(row.visited_at).toLocaleDateString("uz-UZ", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : displayTime(row.visited_at)}
                  </span>

                  <span className="history-visits-cell">
                    {row.visit_count ?? "—"}
                  </span>
                </article>
              )}
            />
          </div>
        )
      )}

      <div className="history-pagination-bar">
        <p className="data-source-note">
          50 ta yozuv · Sahifa {controls.position + 1}
        </p>

        <span className="last-sync-meta">
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Oxirgi yangilanish: 14:35
        </span>

        <div className="page-actions-group">
          <PageControls
            size={controls.size}
            onSize={controls.setSize}
            position={controls.position}
            loading={page.loading || !controls.ready}
            hasMore={!!page.data?.has_more && !!page.data.next_cursor}
            previous={controls.previous}
            next={() => controls.next(page.data?.next_cursor)}
          />
        </div>
      </div>
    </section>
  );
}
