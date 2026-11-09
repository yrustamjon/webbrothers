import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginInventoryView from "../src/LoginInventoryView";

afterEach(() => vi.unstubAllGlobals());
const profile = {
  device: "device-fixture",
  browser: "chrome",
  profile: "profile-fixture",
  browserName: "Google Chrome",
  profileName: "Synthetic · person@example.test",
  capabilities: ["query.cursor"],
};
type Call = { type: string; params: Record<string, unknown> };
function fixture(
  items = [
    {
      domain: "example.test",
      username: "person@example.test",
      credential_exists: true,
    },
  ],
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      if (url.endsWith("/csrf"))
        return new Response(JSON.stringify({ csrf_token: "synthetic" }));
      const body = JSON.parse(String(options.body));
      calls.push(body);
      return new Response(
        JSON.stringify({
          payload: {
            items,
            page_size: body.params.page_size ?? 50,
            next_cursor: "synthetic-cursor",
            has_more: true,
          },
        }),
      );
    }),
  );
  return calls;
}
describe("metadata-only design v3", () => {
  it("shows login metadata while password eye stays disabled and sends no protected operation", async () => {
    const calls = fixture();
    render(<LoginInventoryView {...profile} />);
    expect(await screen.findByText("example.test")).toBeVisible();
    expect(screen.getByTitle("person@example.test")).toBeVisible();
    expect(screen.getByText("Saqlangan")).toBeVisible();
    const eye = screen.getByRole("button", {
      name: "Parol koʻrsatish ulanmagan",
    });
    expect(eye).toBeDisabled();
    fireEvent.click(eye);
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("LOGIN_INVENTORY_QUERY");
    expect(calls[0].params).toMatchObject({
      browser_id: "chrome",
      profile_id: "profile-fixture",
      page_size: 50,
    });
    expect(
      screen.queryByRole("button", {
        name: /nusxalash|oʻchirish|login qoʻshish/i,
      }),
    ).not.toBeInTheDocument();
  });
  it("keeps cursor pagination, debounced search and fresh reload in the new design", async () => {
    const calls = fixture();
    render(<LoginInventoryView {...profile} />);
    await screen.findByText("example.test");
    fireEvent.click(screen.getByRole("button", { name: "Keyingi" }));
    await waitFor(() =>
      expect(calls.at(-1)?.params.cursor).toBe("synthetic-cursor"),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Sayt yoki login boʻyicha qidirish",
      }),
      { target: { value: "person" } },
    );
    await waitFor(() => expect(calls.at(-1)?.params.search).toBe("person"));
    expect(calls.at(-1)?.params).not.toHaveProperty("cursor");
    fireEvent.click(screen.getByRole("button", { name: "Keyingi" }));
    await waitFor(() =>
      expect(calls.at(-1)?.params.cursor).toBe("synthetic-cursor"),
    );
    const previousCount = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Yangilash" }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(previousCount));
    expect(calls.at(-1)?.params).not.toHaveProperty("cursor");
    expect(calls.every((call) => call.type === "LOGIN_INVENTORY_QUERY")).toBe(
      true,
    );
  });
  it("keeps legacy metadata requests free of unsupported pagination and search fields", async () => {
    const calls = fixture();
    render(<LoginInventoryView {...profile} capabilities={[]} />);
    await screen.findByText("example.test");
    expect(calls[0].params).toEqual({
      browser_id: "chrome",
      profile_id: "profile-fixture",
    });
    expect(
      screen.getByRole("textbox", {
        name: "Sayt yoki login boʻyicha qidirish",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Keyingi" }),
    ).not.toBeInTheDocument();
  });
  it("shows empty metadata as an empty state without an enabled reveal control", async () => {
    const calls = fixture([]);
    render(<LoginInventoryView {...profile} />);
    expect(
      await screen.findByText("Bu profilda saqlangan login topilmadi."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Parol koʻrsatish ulanmagan" }),
    ).not.toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});
