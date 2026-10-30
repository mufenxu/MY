import test from "node:test";
import assert from "node:assert/strict";
import {
  UPSTREAM_FAILURE_COOLDOWN_MS,
  clearUpstreamFailure,
  readUpstreamFailure,
  recordUpstreamFailure
} from "../src/lib/failure-cooldown.js";

test("冷却窗口内读取到同一次上游故障", () => {
  const meta = {};
  const at = "2026-10-30T10:39:49.000Z";
  recordUpstreamFailure(meta, { at, status: 502, code: "UPSTREAM_UNAVAILABLE", message: "学校系统当前无法访问，请稍后重试。" });

  const failure = readUpstreamFailure(meta, Date.parse(at) + 1_000);
  assert.equal(failure.status, 502);
  assert.equal(failure.code, "UPSTREAM_UNAVAILABLE");
  assert.equal(failure.message, "学校系统当前无法访问，请稍后重试。");
  assert.equal(failure.retryAfterMs, UPSTREAM_FAILURE_COOLDOWN_MS - 1_000);
});

test("冷却窗口结束后自动重新探测", () => {
  const meta = {};
  const at = "2026-10-30T10:39:49.000Z";
  recordUpstreamFailure(meta, { at, message: "不可达" });
  assert.equal(readUpstreamFailure(meta, Date.parse(at) + UPSTREAM_FAILURE_COOLDOWN_MS), null);
  assert.equal(readUpstreamFailure(meta, Date.parse(at) + 60_000), null);
});

test("没有记录或时间非法时不拦截", () => {
  assert.equal(readUpstreamFailure({}, Date.now()), null);
  assert.equal(readUpstreamFailure({ lastFailure: { at: "not-a-date" } }, Date.now()), null);
  assert.equal(readUpstreamFailure(undefined, Date.now()), null);
});

test("成功后清除冷却，避免用户重试被自己挡住", () => {
  const meta = {};
  recordUpstreamFailure(meta, { at: new Date().toISOString(), message: "不可达" });
  assert.notEqual(readUpstreamFailure(meta, Date.now()), null);
  clearUpstreamFailure(meta);
  assert.equal(readUpstreamFailure(meta, Date.now()), null);
});

test("记录与读取对空 meta 安全", () => {
  assert.doesNotThrow(() => recordUpstreamFailure(null, { message: "x" }));
  assert.doesNotThrow(() => clearUpstreamFailure(undefined));
});
