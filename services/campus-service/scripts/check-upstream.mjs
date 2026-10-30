#!/usr/bin/env node
// 学校上游连通性自检。
//
// 用途：区分「本站代码故障」与「这台机器的出口到学校系统不通」。
// 在 campus-service 容器内执行：
//   node scripts/check-upstream.mjs
//   docker compose exec campus-service node scripts/check-upstream.mjs
//
// 退出码：0 全部可达；1 至少一跳不可达（此时接口 500/502 不是本站逻辑问题）。

import { lookup } from "node:dns/promises";

const TIMEOUT_MS = Number(process.env.HGU_UPSTREAM_CHECK_TIMEOUT_MS || 10_000);

const LIBROOM_ORIGIN = "https://libroom.hgu.edu.cn";
// 与 src/lib/libroom.js 的 LIBROOM_SERVICE_URL 保持一致：CAS 登记的是这个 http 地址。
const LIBROOM_SERVICE_URL = "http://libroom.hgu.edu.cn/v4/login/cas";
const CAS_ORIGIN = "https://cas.hgu.edu.cn";
const LIBRARY_SEAT_ENTRY = "https://libic.hgu.edu.cn/remote/static/sso/login"
  + `?redirectUrl=${encodeURIComponent("https://libic.hgu.edu.cn/jsq-v/#/login")}`;
const LIBRARY_SEAT_API = "https://libic.hgu.edu.cn/jsq/static/public/auth/cas/probe";
const WEBVPN_CAS_LOGIN = "https://webvpn.hgu.edu.cn/passport/v1/public/casLogin?sfDomain=cas96624";
const NRG_ORIGIN = "https://nrg.hgu.edu.cn";

const HOSTS = [
  "cas.hgu.edu.cn",
  "webvpn.hgu.edu.cn",
  "libroom.hgu.edu.cn",
  "libic.hgu.edu.cn",
  "nrg.hgu.edu.cn",
  "ykt.hgu.edu.cn"
];

// 顺序即真实换票顺序：libroom 下发配置 → 拿 CAS 票 → 回投 libroom 换成员令牌。
const PROBES = [
  {
    label: "libroom 配置",
    detail: "POST /v4/index/peizhi",
    url: `${LIBROOM_ORIGIN}/v4/index/peizhi`,
    init: {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        origin: LIBROOM_ORIGIN,
        referer: `${LIBROOM_ORIGIN}/h5/index.html`
      },
      body: "{}"
    },
    accept: (status) => status === 200
  },
  {
    label: "libroom 换票入口",
    detail: "GET /v4/login/cas",
    url: `${LIBROOM_ORIGIN}/v4/login/cas?service=${encodeURIComponent(LIBROOM_SERVICE_URL)}`,
    init: { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } },
    accept: (status) => status === 200 || (status >= 300 && status < 400)
  },
  {
    label: "CAS 登录页",
    detail: "GET /cas/login",
    url: `${CAS_ORIGIN}/cas/login?service=${encodeURIComponent(LIBROOM_SERVICE_URL)}`,
    init: { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } },
    accept: (status) => status === 200
  },
  {
    label: "座位预约 SSO",
    detail: "GET libic /remote/static/sso/login",
    url: LIBRARY_SEAT_ENTRY,
    init: { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } },
    accept: (status) => status === 200 || (status >= 300 && status < 400)
  },
  {
    label: "座位预约 API",
    detail: "POST libic /jsq",
    url: LIBRARY_SEAT_API,
    init: {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        origin: "https://libic.hgu.edu.cn",
        referer: "https://libic.hgu.edu.cn/jsq-v/"
      },
      body: "{}"
    },
    // 401/4xx 也算连通：只验证能不能建连并拿到 HTTP 响应。
    accept: (status) => status > 0
  },
  {
    label: "WebVPN 入口",
    detail: "GET /passport/v1/public/casLogin",
    url: WEBVPN_CAS_LOGIN,
    init: { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } },
    accept: (status) => status === 200 || (status >= 300 && status < 400)
  },
  {
    label: "能耗平台",
    detail: "GET /",
    url: `${NRG_ORIGIN}/`,
    init: { method: "GET", headers: { accept: "text/html" } },
    accept: (status) => status > 0
  }
];

function causeChain(error) {
  const parts = [];
  let node = error?.cause;
  for (let depth = 0; node && typeof node === "object" && depth < 4; depth += 1) {
    if (node.code) parts.push(String(node.code));
    if (Array.isArray(node.errors)) {
      for (const item of node.errors) {
        if (item?.code) parts.push(String(item.code));
      }
    }
    node = node.cause;
  }
  return [...new Set(parts)].join(" > ");
}

function describeFailure(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return `超过 ${TIMEOUT_MS}ms 未完成（建连被丢弃或极慢）`;
  }
  const chain = causeChain(error);
  const message = String(error?.message || error?.name || "未知错误");
  return chain ? `${message}（cause: ${chain}）` : message;
}

async function describeHost(host) {
  try {
    const rows = await lookup(host, { all: true });
    return rows.map((row) => `v${row.family}:${row.address}`).join("  ");
  } catch (error) {
    return `解析失败（${error?.code || error?.message || "unknown"}）`;
  }
}

async function runProbe(probe) {
  const started = Date.now();
  try {
    const response = await fetch(probe.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...probe.init,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; campus-service-upstream-check)",
        ...probe.init.headers
      }
    });
    const durationMs = Date.now() - started;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    return {
      ok: probe.accept(response.status),
      line: `status=${response.status} ${durationMs}ms${location ? `  跳转 ${location}` : ""}`
    };
  } catch (error) {
    return { ok: false, line: `${Date.now() - started}ms  ${describeFailure(error)}` };
  }
}

console.log(`上游连通性自检  ${new Date().toISOString()}  单跳超时 ${TIMEOUT_MS}ms\n`);

console.log("域名解析");
for (const host of HOSTS) {
  console.log(`  ${host.padEnd(22)} ${await describeHost(host)}`);
}

console.log("\n换票链路");
const failed = [];
for (const probe of PROBES) {
  const result = await runProbe(probe);
  console.log(`  ${result.ok ? "OK  " : "FAIL"} ${probe.label.padEnd(16)} ${probe.detail.padEnd(38)} ${result.line}`);
  if (!result.ok) failed.push(probe.label);
}

if (failed.length) {
  console.log(`\n不可达：${failed.join("、")}`);
  console.log("这类失败发生在 TCP/TLS 建连阶段，说明请求没到学校系统。");
  console.log("排查顺序：本机出口 IP 是否被学校限制 → DNS 是否返回校内地址(10.255.x.x) → 是否走 IPv6。");
  process.exit(1);
}

console.log("\n全部可达：学校侧正常，接口报错应回到本站逻辑排查。");
