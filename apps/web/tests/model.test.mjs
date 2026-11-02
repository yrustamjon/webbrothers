import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toggleBrowser,
  queryParams,
  unwrap,
  safeURL,
  bytes,
  appendSample,
} from "../src/model.mjs";
test("faqat bitta brauzer ochiladi va qayta bosish yopadi", () => {
  let opened = null;
  opened = toggleBrowser(opened, "chrome");
  assert.equal(opened, "chrome");
  opened = toggleBrowser(opened, "firefox");
  assert.equal(opened, "firefox");
  assert.equal(toggleBrowser(opened, "firefox"), null);
});
test("tarix filtrlari tanlangan profilga tegishli", () => {
  assert.deepEqual(
    queryParams("chrome", "personal", {
      search: " test ",
      page: 0,
      start: "",
      end: "2026-01-01",
      sort: "desc",
    }),
    {
      browser_id: "chrome",
      profile_id: "personal",
      search: "test",
      page: 1,
      page_size: 25,
      start: undefined,
      end: "2026-01-01T23:59:59.999Z",
      sort: "desc",
    },
  );
});
test("agent xatolari soxta maʼlumotga almashtirilmaydi", () => {
  assert.throws(() => unwrap({ error: { message: "Ruxsat yoʻq" } }), /Ruxsat/);
  assert.deepEqual(unwrap({ payload: { items: [] } }), { items: [] });
});
test("xavfli tashqi havolalar rad etiladi", () => {
  assert.equal(safeURL("https://user:password@example.com"), null);
  assert.equal(safeURL("javascript:alert(1)"), null);
  assert.equal(safeURL("data:text/html,test"), null);
  assert.equal(safeURL("https://example.com"), "https://example.com/");
});
test("trafik grafigi 60 nuqta bilan chegaralangan", () => {
  let data = [];
  for (let i = 0; i < 90; i++)
    data = appendSample(data, { collected_at: String(i) });
  assert.equal(data.length, 60);
  assert.equal(data[0].collected_at, "30");
  assert.equal(appendSample(data, { collected_at: "89" }), data);
  assert.equal(bytes(1024), "1.0 KB");
  assert.equal(bytes(-1), "Mavjud emas");
});
