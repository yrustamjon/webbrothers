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
  return (
    <section>
      <h2>Saqlangan saytlar va loginlar</h2>
      <p>
        Faqat sayt domeni va foydalanuvchi nomi olinadi. Parol qiymatlari,
        cookie va tokenlar oʻqilmaydi.
      </p>
      {!modern && (
        <p className="muted">
          Eski agent eng koʻpi 200 ta login metamaʼlumotini qaytaradi. Qidiruv
          va cursor sahifalash uchun agentni yangilang.
        </p>
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
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
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
      {page.data &&
        (!page.data.items.length ? (
          <p>Bu profilda saqlangan login topilmadi.</p>
        ) : (
          <VirtualList
            key={`${profile}-${controls.position}-${controls.size}`}
            items={page.data.items}
            rowHeight={128}
            label="Login metamaʼlumotlari"
            renderItem={(item) => (
              <article className="inventory-record">
                <strong>{item.domain}</strong>
                <span>{item.username || "Koʻrsatilmagan"}</span>
                <small>
                  {browserName} · {profileName}
                </small>
                <small>
                  {item.credential_exists
                    ? "Saqlangan login yozuvi"
                    : "Login mavjud emas"}
                </small>
              </article>
            )}
          />
        ))}
      {modern && (
        <PageControls
          size={controls.size}
          onSize={controls.setSize}
          position={controls.position}
          loading={page.loading || !controls.ready}
          hasMore={page.data?.has_more ?? false}
          previous={controls.previous}
          next={() => controls.next(page.data?.next_cursor)}
        />
      )}
      <LocalPasswords browser={browser} />
    </section>
  );
}
