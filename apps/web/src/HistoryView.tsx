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
  const [mobile, setMobile] = useState(() => window.innerWidth < 600);
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth < 600);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const change = (key: string, value: string) =>
    controls.setDraft({ ...controls.draft, [key]: value });
  return (
    <section>
      <h2>Koʻrish tarixi</h2>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          controls.apply();
        }}
      >
        <label>
          URL, sarlavha yoki domen
          <input
            value={controls.draft.search}
            onChange={(e) => change("search", e.target.value)}
          />
        </label>
        <label>
          Boshlanish (UTC)
          <input
            type="date"
            value={controls.draft.start}
            onChange={(e) => change("start", e.target.value)}
          />
        </label>
        <label>
          Tugash (UTC)
          <input
            type="date"
            value={controls.draft.end}
            onChange={(e) => change("end", e.target.value)}
          />
        </label>
        <label>
          Tartib
          <select
            value={controls.draft.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="desc">Eng yangi</option>
            <option value="asc">Eng eski</option>
          </select>
        </label>
        <button>Qidirish</button>
        <button type="button" className="secondary" onClick={controls.reload}>
          Yangilash
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
      {page.data && (
        <>
          <p className="muted">
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
              rowHeight={mobile ? 180 : 112}
              label="Koʻrish tarixi yozuvlari"
              renderItem={(row) => (
                <article className="history-record">
                  <div className="history-record-main">
                    {safeURL(row.url) ? (
                      <a
                        className="history-title"
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
                    <small className="history-url">{compactURL(row.url)}</small>
                    <details className="history-address">
                      <summary>Toʻliq manzil</summary>
                      <code>{row.url}</code>
                    </details>
                  </div>
                  <dl className="history-record-meta">
                    <div>
                      <dt>Domen</dt>
                      <dd>{row.domain || "—"}</dd>
                    </div>
                    <div>
                      <dt>Vaqt</dt>
                      <dd>{displayTime(row.visited_at)}</dd>
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
