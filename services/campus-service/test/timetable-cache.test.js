import test from "node:test";
import assert from "node:assert/strict";
import { isTimetableCacheFresh } from "../src/lib/timetable-cache.js";

const TTL = 120_000;
const NOW = Date.parse("2026-10-30T20:00:00.000Z");
const iso = (ms) => new Date(NOW + ms).toISOString();

test("窗口内的缓存视为新鲜，不再回源", () => {
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(-1_000) }, TTL, NOW), true);
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(-119_999) }, TTL, NOW), true);
});

test("超过 TTL 的缓存必须回源", () => {
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(-TTL) }, TTL, NOW), false);
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(-TTL - 1) }, TTL, NOW), false);
});

test("缺少或无法解析时间戳时不复用缓存", () => {
  assert.equal(isTimetableCacheFresh(null, TTL, NOW), false);
  assert.equal(isTimetableCacheFresh({}, TTL, NOW), false);
  assert.equal(isTimetableCacheFresh({ cachedAt: "not-a-date" }, TTL, NOW), false);
  assert.equal(isTimetableCacheFresh({ version: 2 }, TTL, NOW), false);
});

test("TTL 为 0 或非法值时相当于关闭缓存", () => {
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(0) }, 0, NOW), false);
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(0) }, -5, NOW), false);
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(0) }, Number.NaN, NOW), false);
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(0) }, undefined, NOW), false);
});

test("未来时间戳（时钟回拨）不当作新鲜缓存", () => {
  assert.equal(isTimetableCacheFresh({ cachedAt: iso(5_000) }, TTL, NOW), false);
});
