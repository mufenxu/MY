/**
 * 接口契约测试（campus-service）。
 *
 * campus-service 是 3000 行手写路由，没有 Express 的错误中间件，
 * 所有响应的 JSON 外形都靠 `createHttpToolkit().json()` 保证。
 * 所以这里断言的是"出口本身"的契约：
 * - 任何 `json()` 输出都是 application/json + no-store + X-Request-Id
 * - HttpError 携带 status / code / details，交给调用点决定怎么写出
 *
 * 端到端的 404 / 413 断言在 `server.integration.test.js`（需要拉起真实进程）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { HttpError, createHttpToolkit } from "../src/lib/http.js";

function createResponse() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body || "";
    }
  };
}

test("json() 统一输出 JSON、no-store 与请求 ID", () => {
  const toolkit = createHttpToolkit({ getRequestId: () => "req-campus-1" });
  const res = createResponse();

  toolkit.json(res, 404, { ok: false, error: "接口不存在。" });

  assert.equal(res.status, 404);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-request-id"], "req-campus-1");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(
    Number(res.headers["content-length"]),
    Buffer.byteLength(res.body),
    "content-length 必须与实际字节数一致",
  );
  assert.equal(JSON.parse(res.body).ok, false);
});

test("HttpError 携带状态码、业务码与明细", () => {
  const error = new HttpError(415, "请求体必须使用 application/json。", null, "UNSUPPORTED_MEDIA_TYPE");

  assert.equal(error.status, 415);
  assert.equal(error.code, "UNSUPPORTED_MEDIA_TYPE");
  assert.equal(error.message, "请求体必须使用 application/json。");
  assert.equal(error.details, null);
});

test("启用 HSTS 时才输出 strict-transport-security", () => {
  const off = createHttpToolkit().securityHeaders();
  const on = createHttpToolkit({ enableHsts: true }).securityHeaders();

  assert.equal(off["strict-transport-security"], undefined);
  assert.match(on["strict-transport-security"], /max-age=31536000/);
});
