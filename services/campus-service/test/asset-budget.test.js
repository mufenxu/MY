import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";

const budgets = {
  "public/app.js": 161 * 1024,
  "public/admin.js": 4 * 1024,
  "public/browser-check.js": 4 * 1024,
  "public/styles.css": 240 * 1024,
  "public/index.html": 40 * 1024,
  "public/assets/hgu-emblem.png": 50 * 1024
};

test("browser assets stay inside the agreed transfer-source budgets", async () => {
  for (const [path, maxBytes] of Object.entries(budgets)) {
    const { size } = await stat(path);
    assert.ok(size <= maxBytes, `${path} is ${size} bytes; budget is ${maxBytes} bytes`);
  }
});
