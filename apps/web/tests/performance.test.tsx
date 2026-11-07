import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  renderHook,
  act,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { usePageControls } from "../src/PagedQuery";
import VirtualList from "../src/VirtualList";
import HistoryView from "../src/HistoryView";
import TrafficView from "../src/TrafficView";
import { streamAgent } from "../src/stream";

afterEach(() => vi.unstubAllGlobals());
function streamResponse(lines: unknown[], split = 7) {
  const bytes = new TextEncoder().encode(
    lines.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += split)
          controller.enqueue(bytes.slice(i, i + split));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}
function mockStream(lines: unknown[]) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrf_token: "synthetic" })),
    )
    .mockResolvedValueOnce(streamResponse(lines));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("bounded frontend queries", () => {
  it("refresh restarts from page one rather than reusing an expired cursor", () => {
    const { result } = renderHook(() => usePageControls({ search: "" }));
    act(() => result.current.next("old-source-cursor"));
    expect(result.current.position).toBe(1);
    expect(result.current.cursor).toBe("old-source-cursor");
    act(() => result.current.reload());
    expect(result.current.position).toBe(0);
    expect(result.current.cursor).toBeUndefined();
    expect(result.current.refresh).toBe(1);
  });

  it("renders a bounded window for 100,000 synthetic history rows", () => {
    const items = Array.from({ length: 100000 }, (_, i) => i);
    render(
      <VirtualList
        items={items}
        label="Synthetic history"
        renderItem={(i) => <span>record {i}</span>}
      />,
    );
    expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(10);
    fireEvent.scroll(screen.getByRole("region"), {
      target: { scrollTop: 112000 },
    });
    expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(10);
    expect(screen.getByText("record 1000")).toBeVisible();
  });
  it("accepts UTF-8 split chunks and progressive correlated frames", async () => {
    mockStream([
      {
        request_id: "r",
        sequence: 0,
        final: false,
        payload: { items: ["Oʻzbek"] },
      },
      { request_id: "r", sequence: 1, final: true, payload: { items: [] } },
    ]);
    const accept = vi.fn();
    await streamAgent(
      "d",
      "HISTORY_QUERY",
      {},
      new AbortController().signal,
      accept,
    );
    expect(accept).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ request_id: "r", sequence: 1, final: true, payload: { items: [] } }],
    [
      { request_id: "r", sequence: 0, final: false, payload: { items: [] } },
      { request_id: "other", sequence: 1, final: true, payload: { items: [] } },
    ],
    [{ request_id: "r", sequence: 0, final: false, payload: { items: [] } }],
    [
      {
        request_id: "r",
        sequence: 0,
        final: true,
        payload: { items: ["x".repeat(66000)] },
      },
    ],
  ])(
    "rejects invalid sequence, correlation, incomplete or oversized frames",
    async (...lines) => {
      mockStream(lines);
      await expect(
        streamAgent(
          "d",
          "HISTORY_QUERY",
          {},
          new AbortController().signal,
          () => {},
        ),
      ).rejects.toThrow();
    },
  );
  it("does not request ungranted connection or HTTP scopes", async () => {
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("/csrf")
              ? { csrf_token: "synthetic" }
              : {
                  payload: {
                    received_bytes: 0,
                    sent_bytes: 0,
                    recorded_at: "2026-01-01T00:00:00Z",
                  },
                },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <TrafficView
        device="d"
        capabilities={["traffic.connections", "traffic.http"]}
        scopes={["traffic.aggregate"]}
      />,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("tab", { name: "Ulanishlar" }));
    expect(
      screen.getByText("Bu daraja uchun alohida ruxsat talab qilinadi"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "HTTP" }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("cancels an active stream when its profile is unmounted", async () => {
    let streamSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit = {}) => {
        if (url.endsWith("/csrf"))
          return new Response(JSON.stringify({ csrf_token: "synthetic" }));
        streamSignal = options.signal as AbortSignal;
        return new Promise<Response>((_, reject) =>
          streamSignal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        );
      }),
    );
    const view = render(
      <HistoryView
        device="d"
        browser="c"
        profile="p"
        capabilities={["query.cursor", "query.streaming"]}
      />,
    );
    await waitFor(() => expect(streamSignal).toBeDefined());
    view.unmount();
    expect(streamSignal?.aborted).toBe(true);
  });
  it("uses 50-row cursor pages, debounces filters and cancels old requests", async () => {
    const calls: { params: Record<string, unknown>; signal: AbortSignal }[] =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit = {}) => {
        if (url.endsWith("/csrf"))
          return new Response(JSON.stringify({ csrf_token: "synthetic" }));
        const body = JSON.parse(String(options.body));
        calls.push({
          params: body.params,
          signal: options.signal as AbortSignal,
        });
        return new Response(
          JSON.stringify({
            payload: {
              items: [],
              page_size: body.params.page_size,
              next_cursor: "opaque-next",
              has_more: true,
            },
          }),
        );
      }),
    );
    const view = render(
      <HistoryView
        device="d"
        browser="chrome"
        profile="p"
        capabilities={["query.cursor"]}
      />,
    );
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].params.page_size).toBe(50);
    fireEvent.click(screen.getByRole("button", { name: "Keyingi" }));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1].params.cursor).toBe("opaque-next");
    expect(calls[1].params).not.toHaveProperty("page");
    fireEvent.change(
      screen.getByRole("textbox", { name: "URL, sarlavha yoki domen" }),
      {
        target: { value: "example" },
      },
    );
    await waitFor(() => expect(calls[1].signal.aborted).toBe(true));
    expect(calls.length).toBe(2);
    await waitFor(() => expect(calls.length).toBe(3));
    expect(calls[2].params.search).toBe("example");
    expect(calls[2].params).not.toHaveProperty("cursor");
    fireEvent.change(screen.getByLabelText("Sahifadagi yozuvlar"), {
      target: { value: "100" },
    });
    await waitFor(() => expect(calls.at(-1)?.params.page_size).toBe(100));
    view.unmount();
    expect(calls.at(-1)?.signal.aborted).toBe(true);
  });
});
