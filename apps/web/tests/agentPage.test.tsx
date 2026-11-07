import { describe, it, expect } from "vitest";
import { decodeAgentPage, displayTime } from "../src/agentPage";
describe("agent metadata contracts", () => {
  it("accepts real inventory shape and keeps only inventory metadata", () => {
    const page = decodeAgentPage(
      {
        items: [
          {
            domain: "example.test",
            username: "synthetic",
            credential_exists: true,
            unrelated: "discard",
          },
        ],
        page_size: 50,
        next_cursor: null,
        has_more: false,
      },
      "LOGIN_INVENTORY_QUERY",
      100,
    );
    expect(page.items).toEqual([
      {
        domain: "example.test",
        username: "synthetic",
        credential_exists: true,
      },
    ]);
  });
  it("accepts empty history timestamp and zero visits without inventing values", () => {
    const page = decodeAgentPage(
      {
        items: [
          {
            url: "https://example.test",
            title: "",
            domain: "example.test",
            visited_at: "",
            visit_count: 0,
          },
        ],
      },
      "HISTORY_QUERY",
      100,
    );
    expect(page.items[0]).toMatchObject({ visited_at: "", visit_count: 0 });
    expect(displayTime("")).toBe("—");
    expect(displayTime("invalid-date")).toBe("—");
  });
  it.each([
    null,
    { items: null },
    { items: [null] },
    { items: [], has_more: "yes" },
    { items: [], next_cursor: { bad: true } },
  ])("rejects malformed pages", (value) => {
    expect(() => decodeAgentPage(value, "HISTORY_QUERY", 100)).toThrow();
  });
  it("rejects malformed login values instead of crashing React", () => {
    expect(() =>
      decodeAgentPage(
        {
          items: [
            { domain: {}, username: "synthetic", credential_exists: true },
          ],
        },
        "LOGIN_INVENTORY_QUERY",
        100,
      ),
    ).toThrow();
    expect(() =>
      decodeAgentPage(
        {
          items: [
            { url: "", title: "", domain: "", visited_at: "", visit_count: -1 },
          ],
        },
        "HISTORY_QUERY",
        100,
      ),
    ).toThrow();
  });
});
