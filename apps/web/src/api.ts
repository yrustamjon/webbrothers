export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const base = "/api/v1";
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  let headers: Record<string, string> = {};
  const publicAuth = [
    "/auth/register",
    "/auth/login",
    "/auth/password/forgot",
    "/auth/password/reset",
    "/auth/verification/confirm",
  ].includes(path);
  const isMutating =
    (method && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) ||
    body !== undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (!publicAuth && isMutating) {
    const csrf = await fetch(`${base}/auth/csrf`, {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!csrf.ok)
      throw new APIError(
        csrf.status,
        "Xavfsizlik tokenini olish imkoni boʻlmadi.",
      );
    const token = await csrf.json();
    headers["X-CSRF-Token"] = token.csrf_token;
  }
  const response = await fetch(`${base}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new APIError(
      response.status,
      typeof detail === "string"
        ? detail
        : detail?.message || "Soʻrov bajarilmadi. Qayta urinib koʻring.",
    );
  }
  return data as T;
}
export type Device = {
  id: string;
  display_name: string;
  operating_system: string;
  architecture: string;
  status: string;
  last_seen_at?: string;
  scopes: string[];
  enrolled_scopes?: string[];
  monitoring_paused?: boolean;
};
export type Browser = {
  id: string;
  name: string;
  capabilities?: string[];
  profiles: { id: string; name: string }[];
};
export type History = {
  items: {
    url: string;
    title: string;
    visited_at: string;
    domain: string;
    visit_count?: number;
  }[];
  total?: number;
  page: number;
  page_size: number;
  next_cursor?: string | null;
  has_more?: boolean;
};
export type Traffic = {
  received_bytes: number;
  sent_bytes: number;
  attribution: string;
  collected_at: string;
  total_bytes?: number;
  download_bps?: number | null;
  upload_bps?: number | null;
  daily_received_bytes?: number;
  daily_sent_bytes?: number;
  daily_observed_since?: string;
  measurement_interval_ms?: number;
  sample_state?: "warming_up" | "measured" | "counter_reset";
};
export const queryAgent = (
  device: string,
  type: string,
  params: unknown = {},
  signal?: AbortSignal,
) =>
  api<unknown>(
    `/devices/${encodeURIComponent(device)}/query`,
    { type, params },
    undefined,
    signal,
  );
