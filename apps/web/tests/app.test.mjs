import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Web app source files exist", () => {
  const src = path.resolve(__dirname, "../src");
  assert.ok(fs.existsSync(path.join(src, "App.tsx")));
  assert.ok(fs.existsSync(path.join(src, "api.ts")));
  assert.ok(fs.existsSync(path.join(src, "main.tsx")));
  assert.ok(fs.existsSync(path.join(src, "style.css")));
  assert.ok(fs.existsSync(path.join(src, "Sidebar.tsx")));
  assert.ok(fs.existsSync(path.join(src, "BrowserViews.tsx")));
  assert.ok(fs.existsSync(path.join(src, "TrafficView.tsx")));
  assert.ok(fs.existsSync(path.join(src, "ManagementPage.tsx")));
  assert.ok(fs.existsSync(path.join(src, "AuthPage.tsx")));
  assert.ok(fs.existsSync(path.join(src, "Dashboard.tsx")));
});

test("Index html mounts root element and main.tsx", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf-8");
  assert.ok(html.includes('id="root"'));
  assert.ok(html.includes('/src/main.tsx'));
});
