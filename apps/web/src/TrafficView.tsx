import { useState, useEffect } from "react";
import { queryAgent, type Traffic } from "./api";
import { unwrap, bytes, appendSample } from "./model.mjs";
import { streamAgent } from "./stream";
import { useAgentPage } from "./useAgentPage";
import { PageControls, usePageControls } from "./PagedQuery";
import VirtualList from "./VirtualList";
const time = (value?: string) =>
  value ? new Date(value).toLocaleString("uz-UZ") : "—";
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
    <section>
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
          <VirtualList
            items={data.data.items}
            rowHeight={128}
            label="Tarmoq hodisalari"
            renderItem={(item) => (
              <article className="network-record">
                <strong>
                  {kind === "http"
                    ? `${item.method} ${item.safe_url}`
                    : `${item.protocol?.toUpperCase()} · ${item.destination_ip}:${item.port}`}
                </strong>
                <small>
                  {time(item.observed_at)} ·{" "}
                  {item.browser || "Brauzer aniqlanmadi"} ·{" "}
                  {item.attribution === "profile"
                    ? "Profilga bogʻlangan"
                    : item.attribution === "browser"
                      ? kind === "http"
                        ? "Kengaytmada tanlangan brauzer"
                        : "Faqat brauzerga bogʻlangan"
                      : "Aniq atributsiya mavjud emas"}
                </small>
                <span>
                  {kind === "http"
                    ? `Status: ${item.status} · Davomiylik: ${item.duration_ms === null ? "mavjud emas" : item.duration_ms + " ms"}`
                    : "Uzatish hajmi: " +
                      (item.transfer_bytes === null
                        ? "mavjud emas"
                        : bytes(item.transfer_bytes))}
                </span>
              </article>
            )}
          />
        )
      )}
      <PageControls
        size={controls.size}
        onSize={controls.setSize}
        position={controls.position}
        loading={data.loading}
        hasMore={data.data?.has_more ?? false}
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
  const allowed = (scope: string) =>
    scopes.includes(scope) && capabilities.includes(scope);
  return (
    <section>
      <div className="section-head">
        <h2>Jonli trafik</h2>
        <button className="secondary" onClick={() => setLive(!live)}>
          {live ? "Koʻrsatishni toʻxtatish" : "Davom ettirish"}
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Trafik darajalari">
        {[
          ["aggregate", "Umumiy"],
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
              <div className="stats">
                <article>
                  <span>Qabul qilingan</span>
                  <strong>{bytes(stats.received_bytes)}</strong>
                </article>
                <article>
                  <span>Yuborilgan</span>
                  <strong>{bytes(stats.sent_bytes)}</strong>
                </article>
                <article>
                  <span>Jami</span>
                  <strong>
                    {bytes(
                      stats.total_bytes ??
                        stats.received_bytes + stats.sent_bytes,
                    )}
                  </strong>
                </article>
              </div>
              <div className="stats">
                <article>
                  <span>Yuklash tezligi</span>
                  <strong>
                    {stats.download_bps == null
                      ? "Oʻlchanmoqda…"
                      : bytes(stats.download_bps) + "/s"}
                  </strong>
                </article>
                <article>
                  <span>Yuborish tezligi</span>
                  <strong>
                    {stats.upload_bps == null
                      ? "Oʻlchanmoqda…"
                      : bytes(stats.upload_bps) + "/s"}
                  </strong>
                </article>
              </div>
              <p>Oxirgi yangilanish: {time(stats.collected_at)}</p>
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
              <div
                className="traffic-sparkline"
                role="img"
                aria-label="Oxirgi 60 ta trafik namunasi"
              >
                <svg viewBox="0 0 600 100" aria-hidden="true">
                  {["received_bytes", "sent_bytes"].map((field, index) => {
                    const values = samples.map(
                      (s) => s[field as keyof Traffic] as number,
                    );
                    const min = Math.min(...values),
                      range = Math.max(1, Math.max(...values) - min);
                    return (
                      <polyline
                        key={field}
                        fill="none"
                        stroke={index ? "#2563eb" : "#078272"}
                        strokeWidth="2"
                        points={values
                          .map(
                            (v, i) =>
                              `${samples.length < 2 ? 0 : (i / (samples.length - 1)) * 600},${95 - ((v - min) / range) * 85}`,
                          )
                          .join(" ")}
                      />
                    );
                  })}
                </svg>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
