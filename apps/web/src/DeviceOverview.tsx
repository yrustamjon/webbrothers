import { useState } from "react";
import type { Device } from "./api";
import { displayTime } from "./agentPage";
const platform = (v: string) =>
  ({ darwin: "macOS", windows: "Windows", linux: "Linux" })[v] ?? v;
export default function DeviceOverview({
  devices,
  loading,
  refreshing,
  busy,
  onOpen,
  onAdd,
  onDownload,
  onRefresh,
  onRevoke,
  onRemove,
}: {
  devices: Device[];
  loading: boolean;
  refreshing: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onDownload: () => void;
  onRefresh: () => void;
  onRevoke: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const active = devices.filter((d) => d.status !== "revoked");
  const archived = devices.filter((d) => d.status === "revoked");
  const filtered = active
    .filter(
      (d) =>
        (status === "all" || d.status === status) &&
        `${d.display_name} ${platform(d.operating_system)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) => Number(b.status === "online") - Number(a.status === "online"),
    );
  return (
    <section className="device-overview">
      <div className="devices-actionbar">
        <div className="devices-summary">
          <strong>{active.length}</strong> qurilma{" "}
          <span className="summary-divider" />
          <span className="live-dot" />
          {active.filter((d) => d.status === "online").length} onlayn
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={onRefresh}
            disabled={refreshing}
          >
            Yangilash
          </button>
          <button onClick={onAdd}>＋ Qurilma qoʻshish</button>
        </div>
      </div>
      <div className="device-filterbar">
        <label>
          <span className="sr-only">Qurilma qidirish</span>
          <input
            type="search"
            placeholder="Qurilma nomi yoki tizim boʻyicha qidirish"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Ulanish holati</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Barcha holatlar</option>
            <option value="online">Onlayn</option>
            <option value="offline">Oflayn</option>
          </select>
        </label>
      </div>
      {loading ? (
        <p className="empty" role="status">
          Qurilmalar yuklanmoqda…
        </p>
      ) : !active.length ? (
        <div className="devices-empty">
          <span aria-hidden="true">▣</span>
          <h2>Hali faol qurilma yoʻq</h2>
          <p>Agentni oʻrnating va qurilmada chiqqan ulash kodini tasdiqlang.</p>
          <div className="actions">
            <button onClick={onDownload}>Agentni yuklab olish</button>
            <button className="secondary" onClick={onAdd}>
              Menda ulash kodi bor
            </button>
          </div>
        </div>
      ) : !filtered.length ? (
        <p className="empty">Qidiruvga mos qurilma topilmadi.</p>
      ) : (
        <div className="device-table">
          <div className="device-table-head" aria-hidden="true">
            <span>Qurilma</span>
            <span>Tizim</span>
            <span>Holat</span>
            <span>Oxirgi ulanish</span>
            <span>Amallar</span>
          </div>
          <ul aria-label="Faol qurilmalar">
            {filtered.map((d) => (
              <li key={d.id} className="device-table-row">
                <div className="device-name-cell">
                  <span
                    className={`device-os-icon ${d.operating_system}`}
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="3" width="18" height="13" rx="2" />
                      <path d="M8 21h8m-4-5v5" />
                    </svg>
                  </span>
                  <div>
                    <button
                      className="device-name-link"
                      onClick={() => onOpen(d.id)}
                    >
                      {d.display_name}
                    </button>
                    <small>{d.architecture}</small>
                  </div>
                </div>
                <span className="device-system">
                  {platform(d.operating_system)}
                </span>
                <span className={`device-connection ${d.status}`}>
                  <i />
                  {d.status === "online" ? "Onlayn" : "Oflayn"}
                </span>
                <span className="device-last-seen">
                  {d.last_seen_at
                    ? displayTime(d.last_seen_at)
                    : d.status === "online"
                      ? "Hozir tarmoqda"
                      : "Hali ulanmagan"}
                </span>
                <div className="device-row-actions">
                  <button className="device-open" onClick={() => onOpen(d.id)}>
                    Ochish <span aria-hidden="true">↗</span>
                  </button>
                  <details>
                    <summary aria-label={`${d.display_name} amallari`}>
                      ⋯
                    </summary>
                    <div>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `"${d.display_name}" ruxsatini bekor qilasizmi?`,
                            )
                          )
                            onRevoke(d.id);
                        }}
                      >
                        Ruxsatni bekor qilish
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `"${d.display_name}" qurilmasini oʻchirasizmi?`,
                            )
                          )
                            onRemove(d.id);
                        }}
                      >
                        Oʻchirish
                      </button>
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!archived.length && (
        <details className="device-archive-list">
          <summary>
            Eski qurilmalar <span>{archived.length}</span>
          </summary>
          <p>
            Bu ulanishlarning ruxsati bekor qilingan. Profilni ochish uchun
            agentni qayta ulang.
          </p>
          {archived.map((d) => (
            <div className="device-archive-row" key={d.id}>
              <div>
                <strong>{d.display_name}</strong>
                <small>
                  {platform(d.operating_system)} · {displayTime(d.last_seen_at)}
                </small>
              </div>
              <span>Bekor qilingan</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `"${d.display_name}" eski qurilmasini oʻchirasizmi?`,
                    )
                  )
                    onRemove(d.id);
                }}
              >
                Oʻchirish
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
