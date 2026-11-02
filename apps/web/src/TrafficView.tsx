import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { queryAgent, type Traffic } from "./api";
import { unwrap, bytes, appendSample } from "./model.mjs";
const time = (value?: string) =>
  value ? new Date(value).toLocaleString("uz-UZ") : "Hali ulanmagan";
function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      {error instanceof Error ? error.message : "Kutilmagan xato yuz berdi."}
    </p>
  ) : null;
}
export default function TrafficView({ device }: { device: string }) {
  const [live, setLive] = useState(true);
  const [samples, setSamples] = useState<Traffic[]>([]);
  const stats = useQuery<Traffic>({
    queryKey: ["traffic", device],
    queryFn: async () =>
      unwrap(await queryAgent(device, "TRAFFIC_STATS_REQUEST")) as Traffic,
    refetchInterval: live ? 5000 : false,
  });
  useEffect(() => {
    if (stats.data)
      setSamples((old) => appendSample(old, stats.data!) as Traffic[]);
  }, [stats.data]);
  useEffect(() => {
    setSamples([]);
  }, [device]);
  return (
    <section>
      <div className="section-head">
        <h2>Jonli trafik</h2>
        <button className="secondary" onClick={() => setLive(!live)}>
          {live ? "Koʻrsatishni toʻxtatish" : "Davom ettirish"}
        </button>
      </div>
      <p className="muted">
        Har 5 soniyada agentdan olinadi. Qurilma boʻyicha yigʻindi: profil
        aniqlanmadi. HTTP yoʻllari, sarlavhalar va soʻrov mazmuni olinmaydi.
      </p>
      <ErrorBox error={stats.error} />
      {stats.isFetching && <p role="status">Yangilanmoqda…</p>}
      {stats.data && (
        <>
          <div className="stats">
            <article>
              <span>Qabul qilingan</span>
              <strong>{bytes(stats.data.received_bytes)}</strong>
            </article>
            <article>
              <span>Yuborilgan</span>
              <strong>{bytes(stats.data.sent_bytes)}</strong>
            </article>
          </div>
          <p>Oxirgi yangilanish: {time(stats.data.collected_at)}</p>
          <div
            className="chart"
            role="img"
            aria-label="Qurilmaning yuborilgan va qabul qilingan baytlari grafigi"
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={samples}>
                <XAxis
                  dataKey="collected_at"
                  tickFormatter={(v) => new Date(v).toLocaleTimeString("uz-UZ")}
                />
                <YAxis tickFormatter={(v) => bytes(v)} />
                <Tooltip formatter={(v) => bytes(Number(v))} />
                <Legend />
                <Line
                  name="Qabul (B)"
                  type="monotone"
                  dataKey="received_bytes"
                  stroke="#2563eb"
                  dot={false}
                />
                <Line
                  name="Yuborish (B)"
                  type="monotone"
                  dataKey="sent_bytes"
                  stroke="#059669"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
