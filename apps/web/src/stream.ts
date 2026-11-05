import { APIError } from "./api";

export type StreamFrame<T> = {
  request_id: string;
  sequence: number;
  final: boolean;
  payload?: T;
  error?: { code?: string; message?: string };
};
const MAX_FRAME = 64 * 1024;
const MAX_PAGE = 1024 * 1024;

export async function streamAgent<T>(
  device: string,
  type: string,
  params: Record<string, unknown>,
  signal: AbortSignal,
  onFrame: (frame: StreamFrame<T>) => void,
): Promise<void> {
  const csrf = await fetch("/api/v1/auth/csrf", {
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
  const response = await fetch(
    `/api/v1/devices/${encodeURIComponent(device)}/stream`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token.csrf_token,
      },
      body: JSON.stringify({ type, params }),
    },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new APIError(
      response.status,
      typeof detail?.detail === "string"
        ? detail.detail
        : "Jonli soʻrov bajarilmadi.",
    );
  }
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("application/x-ndjson")
  )
    throw new Error("Streaming javob formati notoʻgʻri.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "",
    expected = 0,
    request = "",
    total = 0,
    finished = false;
  const encoder = new TextEncoder();
  const accept = (line: string) => {
    if (!line.trim()) return;
    if (finished || encoder.encode(line).byteLength > MAX_FRAME)
      throw new Error("Streaming chegarasi buzildi.");
    const frame = JSON.parse(line) as StreamFrame<T>;
    if (
      !frame ||
      typeof frame !== "object" ||
      typeof frame.request_id !== "string" ||
      !frame.request_id ||
      !Number.isInteger(frame.sequence) ||
      frame.sequence !== expected ||
      typeof frame.final !== "boolean" ||
      (request && request !== frame.request_id)
    )
      throw new Error("Streaming ketma-ketligi notoʻgʻri.");
    request = frame.request_id;
    expected += 1;
    if (frame.error)
      throw new Error(
        typeof frame.error.message === "string"
          ? frame.error.message
          : "Agent soʻrovni bajara olmadi.",
      );
    if (frame.payload === undefined)
      throw new Error("Streaming mazmuni topilmadi.");
    onFrame(frame);
    finished = frame.final;
  };
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_PAGE) throw new Error("Streaming javobi juda katta.");
      pending += decoder.decode(result.value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        accept(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (encoder.encode(pending).byteLength > MAX_FRAME)
        throw new Error("Streaming bo‘lagi juda katta.");
    }
    pending += decoder.decode();
    if (pending.trim()) accept(pending);
    if (!finished) throw new Error("Streaming javobi tugallanmagan.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
