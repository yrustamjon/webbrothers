// Decode only fields supported by the metadata protocol before rendering.
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Agent javobi kutilgan formatda emas.");
  return value as Record<string, unknown>;
};
const text = (value: unknown) => {
  if (typeof value !== "string") throw new Error("Agent yozuvi notoʻgʻri.");
  return value;
};
export function decodeAgentPage(value: unknown, type: string, limit: number) {
  const page = record(value);
  if (!Array.isArray(page.items) || page.items.length > limit)
    throw new Error("Sahifa chegarasi yoki formati buzildi.");
  if (page.next_cursor != null && typeof page.next_cursor !== "string")
    throw new Error("Agent sahifa kursori notoʻgʻri.");
  if (page.has_more !== undefined && typeof page.has_more !== "boolean")
    throw new Error("Agent sahifalash javobi notoʻgʻri.");
  const items = page.items.map((value) => {
    const item = record(value);
    if (type === "LOGIN_INVENTORY_QUERY") {
      if (typeof item.credential_exists !== "boolean")
        throw new Error("Login metamaʼlumoti notoʻgʻri.");
      return {
        domain: text(item.domain),
        username: text(item.username),
        credential_exists: item.credential_exists,
      };
    }
    if (type === "HISTORY_QUERY") {
      if (
        item.visit_count != null &&
        (typeof item.visit_count !== "number" ||
          !Number.isSafeInteger(item.visit_count) ||
          item.visit_count < 0)
      )
        throw new Error("Tashriflar soni notoʻgʻri.");
      return {
        url: text(item.url),
        title: text(item.title),
        domain: text(item.domain),
        visited_at: text(item.visited_at),
        visit_count: item.visit_count ?? undefined,
      };
    }
    return item;
  });
  return { ...page, items };
}
export function displayTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("uz-UZ");
}
