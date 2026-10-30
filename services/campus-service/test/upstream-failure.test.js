import test from "node:test";
import assert from "node:assert/strict";
import { HttpError, isUpstreamNetworkFailure } from "../src/lib/http.js";
import { createLogger } from "../src/lib/logger.js";

function fetchFailed(cause) {
  return new TypeError("fetch failed", { cause });
}

function syscallError(message, code, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

test("连接层失败被识别为上游不可达", () => {
  for (const code of [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ENETUNREACH",
    "CERT_HAS_EXPIRED",
    "UND_ERR_CONNECT_TIMEOUT"
  ]) {
    assert.equal(
      isUpstreamNetworkFailure(fetchFailed(syscallError(`connect ${code}`, code))),
      true,
      `${code} 应识别为上游不可达`
    );
  }
});

test("双栈建连都失败时 AggregateError 里的码也能识别", () => {
  const aggregate = new AggregateError([
    syscallError("connect ENETUNREACH 2001:250:83d:16::1080:443", "ENETUNREACH"),
    syscallError("connect ECONNREFUSED 27.185.78.45:443", "ECONNREFUSED")
  ], "");
  assert.equal(isUpstreamNetworkFailure(fetchFailed(aggregate)), true);
});

test("已带 status 的 HttpError 不重新解释为连接失败", () => {
  assert.equal(isUpstreamNetworkFailure(new HttpError(502, "学校系统返回 502")), false);
  assert.equal(isUpstreamNetworkFailure(new HttpError(401, "会话已过期")), false);
  assert.equal(isUpstreamNetworkFailure(new HttpError(504, "超时", null, "UPSTREAM_RESPONSE_TIMEOUT")), false);
});

test("业务错误与空值不会误判", () => {
  assert.equal(isUpstreamNetworkFailure(null), false);
  assert.equal(isUpstreamNetworkFailure(undefined), false);
  assert.equal(isUpstreamNetworkFailure(new Error("预约时间不正确")), false);
  assert.equal(isUpstreamNetworkFailure(fetchFailed(syscallError("other", "SOMETHING_ELSE"))), true);
});

test("日志保留 fetch failed 的 cause 链", () => {
  const logger = createLogger({ service: "test-svc", environment: "test" });
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(line);
  try {
    logger.error("http_request_failed", {
      path: "/api/campus/libroom/reservations",
      error: fetchFailed(syscallError("connect ECONNREFUSED 27.185.78.45:443", "ECONNREFUSED", {
        syscall: "connect",
        hostname: "cas.hgu.edu.cn"
      }))
    });
  } finally {
    console.error = original;
  }

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.path, "/api/campus/libroom/reservations");
  assert.equal(entry.error.name, "TypeError");
  assert.equal(entry.error.message, "fetch failed");
  assert.equal(entry.error.cause.code, "ECONNREFUSED");
  assert.equal(entry.error.cause.hostname, "cas.hgu.edu.cn");
});

test("日志仍然屏蔽敏感字段", () => {
  const logger = createLogger({ service: "test-svc", environment: "test" });
  const lines = [];
  const original = console.warn;
  console.warn = (line) => lines.push(line);
  try {
    logger.warn("libroom_member_token_failed", { userId: "u1", token: "secret-token", error: new Error("x") });
  } finally {
    console.warn = original;
  }
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.token, "[Redacted]");
});
