/** Real API client — barcha so'rovlar shu orqali ketadi */

let csrfToken = "";

export async function refreshCsrf(): Promise<string> {
  try {
    const data = await apiJSON<{ csrf_token: string }>("/api/v1/auth/csrf");
    csrfToken = data.csrf_token;
    return csrfToken;
  } catch {
    return "";
  }
}

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  if (!csrfToken && path !== "/api/v1/auth/csrf" && path !== "/api/v1/auth/login" && path !== "/api/v1/auth/register" && path !== "/api/v1/health") {
    await refreshCsrf();
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
  return res;
}

async function apiJSON<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Auth */
export interface Me { id: string; email: string; verified: boolean; }

export async function login(email: string, password: string): Promise<Me & { csrf_token: string }> {
  const data = await apiJSON<Me & { csrf_token: string }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  csrfToken = data.csrf_token;
  return data;
}

export async function register(email: string, password: string): Promise<Me> {
  return apiJSON<Me>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
  csrfToken = "";
}

export async function getMe(): Promise<Me> {
  return apiJSON<Me>("/api/v1/auth/me");
}

export async function changePassword(current_password: string, new_password: string): Promise<{ message: string }> {
  return apiJSON<{ message: string }>("/api/v1/auth/password/change", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}


/** Devices */
export interface Device {
  id: string;
  display_name: string;
  operating_system: string;
  architecture: string;
  scopes: string[];
  enrolled_scopes: string[];
  monitoring_paused: boolean;
  revoked: boolean;
  last_seen_at: string | null;
  version?: string;
}

let cachedDevices: { data: Device[]; expires: number } | null = null;

export function clearDeviceCache() {
  cachedDevices = null;
}

export async function getDevices(force = false): Promise<Device[]> {
  const now = Date.now();
  if (!force && cachedDevices && cachedDevices.expires > now) {
    return cachedDevices.data;
  }
  const data = await apiJSON<{ items: Device[] }>("/api/v1/devices");
  cachedDevices = { data: data.items, expires: now + 3000 };
  return data.items;
}

export async function revokeDevice(id: string): Promise<void> {
  clearDeviceCache();
  await apiFetch(`/api/v1/devices/${id}/revoke`, { method: "POST" });
}

export async function deleteDevice(id: string): Promise<void> {
  clearDeviceCache();
  await apiFetch(`/api/v1/devices/${id}`, { method: "DELETE" });
}

export async function updateScopes(id: string, scopes: string[]): Promise<void> {
  clearDeviceCache();
  await apiFetch(`/api/v1/devices/${id}/scopes`, {
    method: "POST",
    body: JSON.stringify({ scopes }),
  });
}

export async function setMonitoring(id: string, paused: boolean): Promise<void> {
  clearDeviceCache();
  await apiFetch(`/api/v1/devices/${id}/monitoring`, {
    method: "POST",
    body: JSON.stringify({ paused }),
  });
}

/** Query — agent orqali ma'lumot olish */
type QueryType =
  | "BROWSER_LIST_REQUEST"
  | "PROFILE_LIST_REQUEST"
  | "HISTORY_QUERY"
  | "LOGIN_INVENTORY_QUERY"
  | "TRAFFIC_STATS_REQUEST"
  | "CONNECTIONS_QUERY"
  | "HTTP_EVENTS_QUERY"
  | "PASSWORD_REVEAL_QUERY"
  | "LOGIN_CREATE_COMMAND"
  | "LOGIN_DELETE_COMMAND";

export interface QueryParams {
  browser_id?: string;
  profile_id?: string;
  domain?: string;
  username?: string;
  password?: string;
  search?: string;
  page?: number;
  page_size?: number;
  sort?: "asc" | "desc";
  start?: string;
  end?: string;
  sample_count?: number;
  interval_ms?: number;
  cursor?: string;
  stream?: boolean;
}

export async function query<T>(
  deviceId: string,
  type: QueryType,
  params: QueryParams = {}
): Promise<T> {
  return apiJSON<T>(`/api/v1/devices/${deviceId}/query`, {
    method: "POST",
    body: JSON.stringify({ type, params }),
  });
}

/** Stream — NDJSON oqimli so'rov */
export async function* streamQuery<T>(
  deviceId: string,
  type: QueryType,
  params: QueryParams = {},
  signal?: AbortSignal
): AsyncGenerator<T> {
  const res = await apiFetch(`/api/v1/devices/${deviceId}/stream`, {
    method: "POST",
    body: JSON.stringify({ type, params: { ...params, stream: true } }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as T;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as T;
}

/** Audit */
export interface AuditEvent {
  action: string;
  device_id: string | null;
  created_at: string;
}
export async function getAudit(): Promise<AuditEvent[]> {
  const data = await apiJSON<{ items: AuditEvent[] }>("/api/v1/audit");
  return data.items;
}

/** Pairing */
export interface PairingResult {
  pairing_id: string;
  code: string;
  poll_token: string;
  expires_at: string;
}
export async function startPairing(body: {
  display_name: string;
  operating_system: string;
  architecture: string;
  public_key: string;
}): Promise<PairingResult> {
  return apiJSON<PairingResult>("/api/v1/pairing/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
export async function approvePairing(code: string, scopes: string[]): Promise<void> {
  clearDeviceCache();
  await apiFetch("/api/v1/pairing/approve", {
    method: "POST",
    body: JSON.stringify({ code, scopes }),
  });
}

/** Sessions */
export interface UserSession {
  id: string;
  expires_at: string;
  current: boolean;
}
export async function getSessions(): Promise<UserSession[]> {
  const data = await apiJSON<{ items: UserSession[] }>("/api/v1/auth/sessions");
  return data.items;
}
export async function revokeSession(id: string): Promise<void> {
  await apiFetch(`/api/v1/auth/sessions/${id}`, { method: "DELETE" });
}

/** Installers & Releases */
export interface InstallerItem {
  platform: string;
  architecture: string;
  filename: string;
  version: string;
  download_url: string;
  release_url: string;
  sha256: string;
}

let cachedInstallers: { data: { items: InstallerItem[]; status: string }; expires: number } | null = null;
export async function getInstallers(force = false): Promise<{ items: InstallerItem[]; status: string }> {
  const now = Date.now();
  if (!force && cachedInstallers && cachedInstallers.expires > now) {
    return cachedInstallers.data;
  }
  const data = await apiJSON<{ items: InstallerItem[]; status: string }>("/api/v1/agent/installers");
  cachedInstallers = { data, expires: now + 60000 };
  return data;
}

export interface ReleaseItem {
  platform: string;
  architecture: string;
  filename: string;
  version: string;
  sha256: string;
  signature: string;
  download_url: string;
}

let cachedReleases: { data: ReleaseItem[]; expires: number } | null = null;
export async function getReleases(force = false): Promise<ReleaseItem[]> {
  const now = Date.now();
  if (!force && cachedReleases && cachedReleases.expires > now) {
    return cachedReleases.data;
  }
  const data = await apiJSON<{ items: ReleaseItem[] }>("/api/v1/agent/releases");
  cachedReleases = { data: data.items, expires: now + 60000 };
  return data.items;
}
