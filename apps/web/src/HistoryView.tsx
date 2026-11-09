import { useEffect, useState } from "react";
import "./history-design.css";
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
function compactTime(value: string) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function compactURL(value: string) {
  const safe = safeURL(value);
  if (!safe) return "Ochib boʻlmaydigan manzil";
  const url = new URL(safe);
  const label = url.hostname + (url.pathname === "/" ? "" : url.pathname);
  return label.length > 110 ? label.slice(0, 107) + "…" : label;
}
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
  const [advanced, setAdvanced] = useState(false);
  const [period, setPeriod] = useState("all");
  const [mobile, setMobile] = useState(() => window.innerWidth < 760);
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 760);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const change = (key: string, value: string) =>
    controls.setDraft({ ...controls.draft, [key]: value });
  const selectPeriod = (value: string) => {
    setPeriod(value);
    if (value === "custom") {
      setAdvanced(true);
      return;
    }
    if (value === "all") {
      controls.setDraft({ ...controls.draft, start: "", end: "" });
      return;
    }
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (Number(value) - 1));
    controls.setDraft({
      ...controls.draft,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
  };
  return (
    <section className="history-workspace">
      <h2 className="sr-only">Koʻrish tarixi</h2>
      <form
        className="history-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          controls.apply();
        }}
      >
        <div className="history-toolbar-main">
          <label className="history-search">
            <span className="sr-only">URL, sarlavha yoki domen</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
            <input
              placeholder="Sayt yoki sarlavha qidirish"
              value={controls.draft.search}
              onChange={(event) => change("search", event.target.value)}
            />
          </label>
          <label className="history-period">
            <span className="sr-only">Vaqt oraligʻi</span>
            <select
              value={period}
              onChange={(event) => selectPeriod(event.target.value)}
            >
              <option value="all">Barcha vaqt</option>
              <option value="1">Bugun (UTC)</option>
              <option value="7">Oxirgi 7 kun</option>
              <option value="30">Oxirgi 30 kun</option>
              <option value="custom">Sana tanlash</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary history-filter-toggle"
            aria-label="Qoʻshimcha filtrlar"
            aria-expanded={advanced}
            aria-controls="history-advanced-filters"
            onClick={() => setAdvanced(!advanced)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
              <circle cx="8" cy="6" r="2" />
              <circle cx="16" cy="12" r="2" />
              <circle cx="10" cy="18" r="2" />
            </svg>
          </button>
          <button
            className="history-search-submit"
            aria-label="Qidirish"
            title="Qidirish"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
          </button>
          <button
            type="button"
            className="history-refresh"
            onClick={controls.reload}
            disabled={page.loading}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M20 7v5h-5M4 17v-5h5M5.3 7a7.5 7.5 0 0 1 12-2L20 8M4 16l2.7 3a7.5 7.5 0 0 0 12-2" />
            </svg>
            Yangilash
          </button>
        </div>
        {advanced && (
          <div className="history-advanced" id="history-advanced-filters">
            <label>
              Boshlanish (UTC)
              <input
                type="date"
                value={controls.draft.start}
                max={controls.draft.end || undefined}
                onChange={(event) => {
                  setPeriod("custom");
                  change("start", event.target.value);
                }}
              />
            </label>
            <label>
              Tugash (UTC)
              <input
                type="date"
                value={controls.draft.end}
                min={controls.draft.start || undefined}
                onChange={(event) => {
                  setPeriod("custom");
                  change("end", event.target.value);
                }}
              />
            </label>
            <label>
              Tartib
              <select
                value={controls.draft.sort}
                onChange={(event) => change("sort", event.target.value)}
              >
                <option value="desc">Eng yangi</option>
                <option value="asc">Eng eski</option>
              </select>
            </label>
          </div>
        )}
      </form>
      {page.error && (
        <p role="alert" className="error">
          {page.error.message}
        </p>
      )}
      {(!controls.ready || page.loading) && (
        <p role="status">Agentdan olinmoqda…</p>
      )}
      <div className="history-columns" aria-hidden="true">
        <span>Sahifa</span>
        <span>Domen</span>
        <span>Oxirgi tashrif</span>
        <span>Tashriflar</span>
      </div>
      {page.data && (
        <>
          <p className="history-result-count muted">
            {page.data.items.length} ta yozuv koʻrsatilmoqda · Sahifa{" "}
            {controls.position + 1}
            {page.loading ? " · Oqim davom etmoqda" : ""}
          </p>
          {!page.data.items.length ? (
            <p>Tanlangan filtrlarda tarix topilmadi.</p>
          ) : (
            <VirtualList
              key={`${profile}-${controls.position}-${controls.size}`}
              items={page.data.items}
              rowHeight={mobile ? 156 : 72}
              height={504}
              label="Koʻrish tarixi yozuvlari"
              renderItem={(row) => (
                <article className="history-record">
                  <div className="history-record-main">
                    <span className="history-site-mark" aria-hidden="true">
                      {(row.domain || "W").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="history-page-copy">
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
                  <dl className="history-record-meta">
                    <div>
                      <dt>Domen</dt>
                      <dd>{row.domain || "—"}</dd>
                    </div>
                    <div>
                      <dt>Vaqt</dt>
                      <dd title={displayTime(row.visited_at)}>
                        {compactTime(row.visited_at)}
                      </dd>
                    </div>
                    <div>
                      <dt>Tashrif</dt>
                      <dd>{row.visit_count ?? "—"}</dd>
                    </div>
                  </dl>
                </article>
              )}
            />
          )}
        </>
      )}
      <PageControls
        size={controls.size}
        onSize={controls.setSize}
        position={controls.position}
        loading={page.loading || !controls.ready}
        hasMore={
          cursorMode
            ? !!page.data?.has_more && !!page.data.next_cursor
            : (page.data?.has_more ?? page.data?.items.length === controls.size)
        }
        previous={controls.previous}
        next={() => controls.next(page.data?.next_cursor)}
      />
    </section>
  );
}
