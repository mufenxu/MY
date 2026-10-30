import assert from "node:assert/strict";
import test from "node:test";

import {
  certificateFailureCode,
  createRelaxedTlsReporter,
  describePeerCertificate,
  hostOf,
  loadRelaxedDispatcher
} from "../src/lib/upstream-tls.js";

test("certificateFailureCode 识别 fetch 的 cause 链证书错误", () => {
  const error = new TypeError("fetch failed");
  error.cause = Object.assign(new Error("self-signed certificate"), {
    code: "DEPTH_ZERO_SELF_SIGNED_CERT"
  });
  assert.equal(certificateFailureCode(error), "DEPTH_ZERO_SELF_SIGNED_CERT");
});

test("certificateFailureCode 忽略非证书类网络错误", () => {
  const error = new TypeError("fetch failed");
  error.cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  assert.equal(certificateFailureCode(error), "");
});

test("certificateFailureCode 支持 AggregateError 与深层嵌套", () => {
  const inner = Object.assign(new Error("unable to verify"), {
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  });
  const aggregate = new AggregateError([new Error("other"), inner], "aggregate");
  assert.equal(certificateFailureCode(aggregate), "UNABLE_TO_VERIFY_LEAF_SIGNATURE");
});

test("certificateFailureCode 对空值与非对象输入返回空字符串", () => {
  assert.equal(certificateFailureCode(null), "");
  assert.equal(certificateFailureCode(undefined), "");
  assert.equal(certificateFailureCode("fetch failed"), "");
});

test("hostOf 只返回主机名，非法地址返回空", () => {
  assert.equal(hostOf("https://libroom.hgu.edu.cn/v4/login/cas"), "libroom.hgu.edu.cn");
  assert.equal(hostOf("not-a-url"), "");
});

test("createRelaxedTlsReporter 同一主机在窗口内只上报一次", () => {
  let current = 1_000;
  const shouldReport = createRelaxedTlsReporter({ windowMs: 5_000, now: () => current });
  assert.equal(shouldReport("cas.hgu.edu.cn"), true);
  assert.equal(shouldReport("cas.hgu.edu.cn"), false);
  current += 4_999;
  assert.equal(shouldReport("cas.hgu.edu.cn"), false);
  current += 2;
  assert.equal(shouldReport("cas.hgu.edu.cn"), true);
  assert.equal(shouldReport("libroom.hgu.edu.cn"), true);
});

test("loadRelaxedDispatcher 返回可复用的 dispatcher", async () => {
  const first = await loadRelaxedDispatcher();
  const second = await loadRelaxedDispatcher();
  assert.ok(first);
  assert.equal(first, second);
});

test("describePeerCertificate 对不可达目标返回 null 而不是抛错", async () => {
  const result = await describePeerCertificate("127.0.0.1", { port: 1, timeoutMs: 500 });
  assert.equal(result, null);
});
