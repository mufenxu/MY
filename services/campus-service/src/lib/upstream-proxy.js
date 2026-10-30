// 学校把统一身份认证等系统撤出公网后，云服务器无法直连 *.hgu.edu.cn。
// 这里提供一个可选中转出口：把学校域名的请求经一个 HTTP CONNECT 代理转发，
// 代理通常跑在校园网内的常开机器上（例如 ssh -R 反代出来的本地端口）。
//
// 默认关闭。未配置 HGU_UPSTREAM_PROXY 时，行为与之前完全一致。
// 代理链路上仍是端到端 TLS，证书校验规则沿用 upstream-tls.js 的「先严格、后降级」。
let dispatchers = null;

// 只接受 http/https 代理；socks 不被 undici 支持，直接忽略而不是让请求静默走直连。
export function normalizeProxyUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";
  return parsed.href;
}

// 日志里不能出现代理的账号密码。
export function redactProxyUrl(proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "";
  }
}

export function loadProxyDispatcher(proxyUrl, { rejectUnauthorized = true } = {}) {
  if (!proxyUrl) return Promise.resolve(null);
  if (!dispatchers) dispatchers = new Map();
  const key = `${proxyUrl}|${rejectUnauthorized ? "strict" : "relaxed"}`;
  if (!dispatchers.has(key)) {
    dispatchers.set(
      key,
      import("undici")
        .then(({ ProxyAgent }) => new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized } }))
        .catch(() => null)
    );
  }
  return dispatchers.get(key);
}

export function resetProxyDispatchersForTest() {
  dispatchers = null;
}
