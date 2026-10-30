import test from "node:test";
import assert from "node:assert/strict";
import {
  loadProxyDispatcher,
  normalizeProxyUrl,
  redactProxyUrl,
  resetProxyDispatchersForTest
} from "../src/lib/upstream-proxy.js";

test("normalizeProxyUrl 只接受 http/https 且忽略空值与非法协议", () => {
  assert.equal(normalizeProxyUrl("http://127.0.0.1:3128"), "http://127.0.0.1:3128/");
  assert.equal(normalizeProxyUrl("  https://proxy.campus.example:8443  "), "https://proxy.campus.example:8443/");
  assert.equal(normalizeProxyUrl("socks5://127.0.0.1:1080"), "");
  assert.equal(normalizeProxyUrl("http://"), "");
  assert.equal(normalizeProxyUrl("not-a-url"), "");
  assert.equal(normalizeProxyUrl(""), "");
  assert.equal(normalizeProxyUrl(undefined), "");
});

test("redactProxyUrl 不泄漏代理账号密码", () => {
  assert.equal(redactProxyUrl("http://user:secret@10.0.0.2:3128/"), "http://10.0.0.2:3128");
  assert.equal(redactProxyUrl("http://10.0.0.2:3128"), "http://10.0.0.2:3128");
  assert.equal(redactProxyUrl("bogus"), "");
});

test("未配置代理时不产生 dispatcher", async () => {
  resetProxyDispatchersForTest();
  assert.equal(await loadProxyDispatcher(""), null);
});

test("同一代理地址复用同一个 dispatcher 实例", async () => {
  resetProxyDispatchersForTest();
  const first = await loadProxyDispatcher("http://127.0.0.1:3128", { rejectUnauthorized: true });
  const second = await loadProxyDispatcher("http://127.0.0.1:3128", { rejectUnauthorized: true });
  assert.ok(first);
  assert.equal(first, second);
});

test("严格与降级是两条独立链路", async () => {
  resetProxyDispatchersForTest();
  const strict = await loadProxyDispatcher("http://127.0.0.1:3128", { rejectUnauthorized: true });
  const relaxed = await loadProxyDispatcher("http://127.0.0.1:3128", { rejectUnauthorized: false });
  assert.ok(strict);
  assert.ok(relaxed);
  assert.notEqual(strict, relaxed);
});
