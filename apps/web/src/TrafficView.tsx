import { useState, useEffect } from "react";
import { queryAgent, type Traffic } from "./api";
import { unwrap, bytes, appendSample } from "./model.mjs";
import { streamAgent } from "./stream";
import { useAgentPage } from "./useAgentPage";
import { PageControls, usePageControls } from "./PagedQuery";
import VirtualList from "./VirtualList";
import "./traffic-design.css";
const time = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("uz-UZ");
};
const rate = (value?: number | null) =>
  value != null && Number.isFinite(value) && value >= 0
    ? bytes(value) + "/s"
    : "Oʻlchanmoqda…";
const total = (value?: number | null) =>
  value != null && Number.isFinite(value) && value >= 0 ? bytes(value) : "—";
const clock = (stamp: number) =>
  new Date(stamp).toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export function speedSamples(samples: Traffic[]) {
  const result = samples
    .map((sample, index) => {
      const at = new Date(sample.collected_at).getTime();
      const previous = samples[index - 1];
      const elapsed = previous
        ? (at - new Date(previous.collected_at).getTime()) / 1000
        : 0;
      const measured = (
        provided: number | null | undefined,
        field: "received_bytes" | "sent_bytes",
      ) => {
        if (sample.sample_state === "counter_reset") return null;
        if (provided != null)
          return Number.isFinite(provided) && provided >= 0 ? provided : null;
        if (
          sample.sample_state === "warming_up" ||
          !previous ||
          !Number.isFinite(elapsed) ||
          elapsed <= 0
        )
          return null;
        const delta = sample[field] - previous[field];
        return Number.isFinite(delta) && delta >= 0 ? delta / elapsed : null;
      };
      return {
        at,
        download: measured(sample.download_bps, "received_bytes"),
        upload: measured(sample.upload_bps, "sent_bytes"),
      };
    })
    .filter((sample) => Number.isFinite(sample.at));
  const latest = result.at(-1)?.at ?? 0;
  return result
    .filter((sample) => sample.at >= latest - 60000 && sample.at <= latest)
    .slice(-60);
}
function SpeedChart({ samples }: { samples: Traffic[] }) {
  const points = speedSamples(samples);
  const available = points.some(
    (point) => point.download != null || point.upload != null,
  );
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.download ?? 0, point.upload ?? 0]),
  );
  const end = points.at(-1)?.at ?? 0;
  const start = points[0]?.at ?? end;
  const span = Math.max(1000, end - start);
  const y = (value: number) => 180 - (value / max) * 160;
  const x = (at: number) => 64 + ((at - start) / span) * 716;
  const segments = (key: "download" | "upload") => {
    const out: { at: number; value: number }[][] = [];
    let current: { at: number; value: number }[] = [];
    for (const point of points) {
      const value = point[key];
      if (value == null) {
        if (current.length) out.push(current);
        current = [];
      } else current.push({ at: point.at, value });
    }
    if (current.length) out.push(current);
    return out;
  };
  return (
    <div
      className="speed-chart"
      role="img"
      aria-label="Oxirgi 60 ta trafik namunasi"
    >
      {!available ? (
        <p className="traffic-chart-empty">
          Tezlik namunasi kutilmoqda. Kamida ikki oʻlchov yoki agentning tezlik
          qiymati kerak.
        </p>
      ) : (
        <svg viewBox="0 0 800 220" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <g key={index}>
              <line
                x1="64"
                x2="780"
                y1={20 + (index * 160) / 3}
                y2={20 + (index * 160) / 3}
                className="chart-grid"
              />
              <text x="55" y={24 + (index * 160) / 3} textAnchor="end">
                {rate((max * (3 - index)) / 3)}
              </text>
            </g>
          ))}
          {(["download", "upload"] as const).flatMap((key) =>
            segments(key).map((segment, index) =>
              segment.length === 1 ? (
                <circle
                  key={`${key}-${index}`}
                  className={`chart-${key}`}
                  cx={x(segment[0].at)}
                  cy={y(segment[0].value)}
                  r="3"
                />
              ) : (
                <polyline
                  key={`${key}-${index}`}
                  className={`chart-${key}`}
                  fill="none"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  points={segment
                    .map((point) => `${x(point.at)},${y(point.value)}`)
                    .join(" ")}
                />
              ),
            ),
          )}
          <text x="64" y="208">
            {clock(start)}
          </text>
          <text x="780" y="208" textAnchor="end">
            {clock(end)}
          </text>
        </svg>
      )}
      <div className="traffic-chart-legend">
        <span>
          <i className="download-line" />
          Download
        </span>
        <span>
          <i className="upload-line" />
          Upload
        </span>
      </div>
    </div>
  );
}
type TrafficProps = {
  device: string;
  capabilities?: string[];
  scopes?: string[];
  browser?: string;
  profile?: string;
};
type Event = {
  id: string;
  destination_ip?: string;
  port?: number;
  protocol?: string;
  observed_at: string;
  transfer_bytes: number | null;
  browser: string | null;
  profile_id?: string | null;
  attribution: string;
  method?: string;
  safe_url?: string;
  status?: number;
  duration_ms?: number | null;
};
function Events({
  device,
  kind,
  browser,
  streaming,
}: {
  device: string;
  kind: "connections" | "http";
  browser?: string;
  streaming: boolean;
}) {
  const controls = usePageControls({});
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(true);
  useEffect(() => {
    if (!live || controls.position !== 0) return;
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [live, controls.position]);
  const data = useAgentPage<Event>(
    device,
    kind === "http" ? "HTTP_EVENTS_QUERY" : "CONNECTIONS_QUERY",
    {
      page_size: controls.size,
      ...(controls.cursor ? { cursor: controls.cursor } : {}),
      ...(browser ? { browser_id: browser } : {}),
    },
    streaming,
    true,
    tick + controls.refresh,
  );
  return (
    <section className="traffic-events">
      <div className="section-head">
        <h3>
          {kind === "http"
            ? "HTTP metamaʼlumotlari"
            : "Ulanish metamaʼlumotlari"}
        </h3>
        <button className="secondary" onClick={() => setLive(!live)}>
          {live ? "Jonli yangilashni toʻxtatish" : "Jonli yangilash"}
        </button>
      </div>
      <p className="muted">
        Birinchi sahifa 5 soniyada yangilanadi. Faqat ruxsat etilgan
        metamaʼlumot. Bu koʻrinish brauzer yoki qurilma darajasida; tanlangan
        profilga aniq bogʻlash mavjud emas.
      </p>
      {data.error && (
        <p role="alert" className="error">
          {data.error.message}
        </p>
      )}
      {data.loading && <p role="status">Metamaʼlumot olinmoqda…</p>}
      {data.data?.availability && data.data.availability !== "available" ? (
        <p role="status">
          {data.data.reason ||
            "Bu qurilmada ruxsat yoki qoʻllanadigan OS integratsiyasi talab qilinadi."}
        </p>
      ) : data.data && !data.data.items.length ? (
        <p>Hozir ruxsat etilgan hodisa topilmadi.</p>
      ) : (
        data.data && (
          <>
            <div className={`network-columns ${kind}`} aria-hidden="true">
              <span>{kind === "http" ? "Metod / domen" : "Manzil / port"}</span>
              <span>{kind === "http" ? "Status / vaqt" : "Protokol"}</span>
              <span>Brauzer</span>
              <span>Kuzatilgan vaqt</span>
            </div>
            <VirtualList
              items={data.data.items}
              rowHeight={128}
              label="Tarmoq hodisalari"
              renderItem={(item) => (
                <article className="network-table-row">
                  <div>
                    <strong>
                      {kind === "http"
                        ? `${item.method} ${item.safe_url}`
                        : `${item.destination_ip}:${item.port}`}
                    </strong>
                    <small>Uzatish hajmi: {total(item.transfer_bytes)}</small>
                  </div>
                  <span>
                    {kind === "http"
                      ? `${item.status} · ${item.duration_ms == null ? "—" : item.duration_ms + " ms"}`
                      : item.protocol?.toUpperCase() || "—"}
                  </span>
                  <div>
                    <span>{item.browser || "Aniqlanmagan"}</span>
                    <small>
                      {item.attribution === "profile"
                        ? "Profilga bogʻlangan"
                        : item.attribution === "browser"
                          ? kind === "http"
                            ? "Kengaytmada tanlangan"
                            : "Brauzerga bogʻlangan"
                          : "Atributsiya mavjud emas"}
                    </small>
                  </div>
                  <time>{time(item.observed_at)}</time>
                </article>
              )}
            />
          </>
        )
      )}
      <PageControls
        size={controls.size}
        onSize={controls.setSize}
        position={controls.position}
        loading={data.loading}
        hasMore={!!data.data?.has_more && !!data.data.next_cursor}
        previous={controls.previous}
        next={() => controls.next(data.data?.next_cursor)}
      />
    </section>
  );
}
export default function TrafficView({
  device,
  capabilities = [],
  scopes = [],
  browser,
  profile,
}: TrafficProps) {
  const [level, setLevel] = useState("aggregate");
  const [live, setLive] = useState(true);
  const [stats, setStats] = useState<Traffic>();
  const [samples, setSamples] = useState<Traffic[]>([]);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const streaming = capabilities.includes("query.streaming");
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(undefined);
    setLoading(false);
    const accept = (value: Traffic) => {
      if (!active) return;
      setError(undefined);
      setStats(value);
      setSamples((old) => appendSample(old, value) as Traffic[]);
      setLoading(false);
    };
    const run = async () => {
      setLoading(true);
      try {
        if (streaming)
          await streamAgent<Traffic>(
            device,
            "TRAFFIC_STATS_REQUEST",
            { sample_count: 20, interval_ms: 1000 },
            abort.signal,
            (frame) => accept(frame.payload!),
          );
        else
          accept(
            unwrap(
              await queryAgent(
                device,
                "TRAFFIC_STATS_REQUEST",
                {},
                abort.signal,
              ),
            ) as Traffic,
          );
        if (active && live)
          timer = setTimeout(() => void run(), streaming ? 250 : 5000);
      } catch (reason) {
        if (active && !abort.signal.aborted) {
          setError(
            reason instanceof Error ? reason : new Error("Trafik olinmadi."),
          );
          setLoading(false);
          if (live) timer = setTimeout(() => void run(), 5000);
        }
      }
    };
    if (live && level === "aggregate") void run();
    return () => {
      active = false;
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [device, streaming, live, level]);
  useEffect(() => {
    setStats(undefined);
    setSamples([]);
  }, [device]);
  const allowed = (scope: string) =>
    scopes.includes(scope) && capabilities.includes(scope);
  return (
    <section className="traffic-dashboard">
      <div className="section-head traffic-heading">
        <div>
          <h2>Trafik monitoringi</h2>
          <p>Qurilma darajasida · Aniq profilga bogʻlanmagan</p>
        </div>
        <button className="secondary" onClick={() => setLive(!live)}>
          {live ? "Koʻrsatishni toʻxtatish" : "Davom ettirish"}
        </button>
      </div>
      <div
        className="tabs traffic-levels"
        role="tablist"
        aria-label="Trafik darajalari"
      >
        {[
          ["aggregate", "Umumiy trafik"],
          ["connections", "Ulanishlar"],
          ["http", "HTTP"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={level === key}
            onClick={() => setLevel(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {level !== "aggregate" ? (
        allowed(level === "http" ? "traffic.http" : "traffic.connections") ? (
          <Events
            key={level}
            device={device}
            kind={level as "connections" | "http"}
            browser={browser}
            streaming={streaming}
          />
        ) : (
          <section className="category-access">
            <h3>Bu daraja uchun alohida ruxsat talab qilinadi</h3>
            <p>
              Agentda tegishli ulanish yoki HTTP metamaʼlumoti ruxsatini tanlab
              qayta ulang. HTTP uchun qoʻllanadigan brauzer integratsiyasi ham
              talab qilinishi mumkin. HTTPS ochilmaydi; sarlavhalar, tokenlar,
              cookie va soʻrov tanasi olinmaydi.
            </p>
          </section>
        )
      ) : (
        <>
          <p className="muted">
            {streaming
              ? "Agentdan jonli oqim."
              : "Har 5 soniyada agentdan olinadi."}{" "}
            Qurilma boʻyicha yigʻindi; brauzer-profilga aniq atributsiya mavjud
            emas.
          </p>
          {error && (
            <p role="alert" className="error">
              {error.message}
            </p>
          )}
          {loading && <p role="status">Yangilanmoqda…</p>}
          {stats && (
            <>
              <div className="traffic-stat-grid">
                <article>
                  <span className="traffic-stat-icon" aria-hidden="true">
                    ↓
                  </span>
                  <div>
                    <span>Download</span>
                    <strong>{rate(stats.download_bps)}</strong>
                  </div>
                </article>
                <article>
                  <span className="traffic-stat-icon" aria-hidden="true">
                    ↑
                  </span>
                  <div>
                    <span>Upload</span>
                    <strong>{rate(stats.upload_bps)}</strong>
                  </div>
                </article>
                <article>
                  <span className="traffic-stat-icon" aria-hidden="true">
                    ⇩
                  </span>
                  <div>
                    <span>Qabul qilingan</span>
                    <strong>{total(stats.received_bytes)}</strong>
                  </div>
                </article>
                <article>
                  <span className="traffic-stat-icon" aria-hidden="true">
                    ⇧
                  </span>
                  <div>
                    <span>Yuborilgan</span>
                    <strong>{total(stats.sent_bytes)}</strong>
                  </div>
                </article>
              </div>
              <div className="traffic-chart-card">
                <div className="traffic-chart-heading">
                  <h3>
                    Jonli tezlik <span>(oxirgi 60 soniya)</span>
                  </h3>
                  <span
                    className={
                      live && !error
                        ? "traffic-live-badge"
                        : "traffic-paused-badge"
                    }
                  >
                    {live
                      ? error
                        ? "Ulanish kutilmoqda"
                        : "Jonli"
                      : "Toʻxtatilgan"}
                  </span>
                </div>
                <SpeedChart samples={samples} />
              </div>
              <p className="traffic-updated">
                Oxirgi yangilanish: {time(stats.collected_at)} · Jami{" "}
                {total(
                  stats.total_bytes ?? stats.received_bytes + stats.sent_bytes,
                )}
              </p>
              {stats.daily_observed_since && (
                <p className="muted">
                  Bugun agent kuzatgan davr ({time(stats.daily_observed_since)}{" "}
                  dan): qabul {bytes(stats.daily_received_bytes)}, yuborish{" "}
                  {bytes(stats.daily_sent_bytes)}. Kuzatuvdan oldingi kunlik
                  trafik hisoblanmagan.
                </p>
              )}
              {stats.sample_state === "counter_reset" && (
                <p role="status">
                  OS hisoblagichi yangilandi; tezlik qayta oʻlchanmoqda.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
