export const scopes = [
  ["browser.discovery", "Brauzerlarni aniqlash"],
  ["profile.discovery", "Profillarni aniqlash"],
  ["history.read", "Koʻrish tarixini oʻqish"],
  ["login.inventory", "Loginlar roʻyxati (parollarsiz)"],
  ["traffic.aggregate", "Qurilma trafik statistikasi"],
  ["traffic.connections", "Tarmoq ulanishlari metamaʼlumotlari"],
  ["traffic.http", "Kengaytmadan HTTP metamaʼlumotlari"],
];
export function toggleBrowser(current, next) {
  return current === next ? null : next;
}
export function queryParams(browser, profile, filters) {
  return {
    browser_id: browser,
    profile_id: profile,
    search: filters.search.trim(),
    page: Math.max(1, filters.page),
    page_size: 25,
    start: filters.start ? `${filters.start}T00:00:00.000Z` : undefined,
    end: filters.end ? `${filters.end}T23:59:59.999Z` : undefined,
    sort: filters.sort,
  };
}
export function unwrap(response) {
  if (response?.error)
    throw new Error(response.error.message || "Agent soʻrovni bajara olmadi.");
  return response?.payload ?? response;
}
export function safeURL(value) {
  try {
    const u = new URL(value);
    return !u.username &&
      !u.password &&
      ["https:", "http:"].includes(u.protocol)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function bytes(value) {
  if (!Number.isFinite(value) || value < 0) return "Mavjud emas";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (value >= 1024 && i < 4) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}
export function appendSample(samples, sample) {
  if (samples.at(-1)?.collected_at === sample.collected_at) return samples;
  return [...samples, sample].slice(-60);
}
