import assert from "node:assert/strict";
import test from "node:test";

await import("../public/formatters.js");

const formatters = globalThis.HguFormatters;

test("campus formatters expose stable billing and section presentation", () => {
  assert.equal(formatters.money("12.5"), "¥12.50");
  assert.equal(formatters.freeSectionRangeText([3, 4, 5]), "第3,4,5节 · 09:50-12:15");
  assert.deepEqual(formatters.freeSectionPreset("evening"), [11, 12]);
});

test("campus formatter HTML output escapes untrusted text", () => {
  assert.equal(formatters.escapeHtml("<img src=x>"), "&lt;img src=x&gt;");
  assert.equal(formatters.empty("<script>"), '<div class="empty">&lt;script&gt;</div>');
});
