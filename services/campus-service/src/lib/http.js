import { isIP } from "node:net";

export class HttpError extends Error {
  constructor(status, message, details, code = null) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

// 连接层失败的 errno/undici 码。这类错误说明请求根本没到学校系统，
// 与“学校系统回了 500”是两回事，对外应报 502 而不是本站 500。
const UPSTREAM_NETWORK_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
  "EPROTO",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT"
]);

function hasUpstreamNetworkCode(error, depth = 0) {
  if (!error || typeof error !== "object" || depth > 4) return false;
  if (error.code && UPSTREAM_NETWORK_CODES.has(String(error.code))) return true;
  if (Array.isArray(error.errors) && error.errors.some((item) => hasUpstreamNetworkCode(item, depth + 1))) {
    return true;
  }
  return hasUpstreamNetworkCode(error.cause, depth + 1);
}

// 只判定“没有 status 的裸错误”。已经由 HttpError 赋过 status 的走原有映射，
// 避免把上游业务拒绝（401/409/502…）重新解释成连接失败。
export function isUpstreamNetworkFailure(error) {
  if (!error || typeof error !== "object" || Number(error.status)) return false;
  if (hasUpstreamNetworkCode(error)) return true;
  return error instanceof TypeError && /fetch failed/i.test(String(error.message || ""));
}

function forwardedProto(req) {
  const value = String(req.headers["x-forwarded-proto"] || "").split(",", 1)[0].trim().toLowerCase();
  if (value) return value;
  const forwarded = String(req.headers.forwarded || "");
  const match = /(?:^|[;,]\s*)proto=([^;,]+)/i.exec(forwarded);
  return match ? match[1].trim().replace(/^"|"$/g, "").toLowerCase() : "";
}

function validPort(value) {
  if (value === undefined) return true;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

export function sanitizeHostHeader(value) {
  const host = String(value || "").split(",", 1)[0].trim();
  if (!host || host.length > 261 || /[\s\\/]/.test(host)) return "";

  const ipv6 = /^\[([^\]]+)](?::(\d{1,5}))?$/.exec(host);
  if (ipv6) return isIP(ipv6[1]) === 6 && validPort(ipv6[2]) ? host : "";

  const domain = /^([a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(host);
  if (!domain || !validPort(domain[2])) return "";
  if (domain[1].startsWith(".") || domain[1].endsWith(".") || domain[1].includes("..")) return "";
  return host;
}

export function sanitizePublicHttpsOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return "";
  }
  const host = sanitizeHostHeader(url.host);
  return host ? `https://${host}` : "";
}

export function createHttpToolkit({
  enableHsts = false,
  enableHttpsRedirect = false,
  publicOrigin = "",
  trustProxy = false,
  getRequestId = () => ""
} = {}) {
  const publicHttpsOrigin = sanitizePublicHttpsOrigin(publicOrigin);

  function securityHeaders(extra = {}) {
    const headers = {
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-dns-prefetch-control": "off",
      "x-download-options": "noopen",
      "x-permitted-cross-domain-policies": "none",
      "referrer-policy": "same-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
      "origin-agent-cluster": "?1",
      "content-security-policy": [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "manifest-src 'self'",
        "media-src 'none'",
        "worker-src 'none'"
      ].join("; "),
      ...extra
    };
    if (enableHsts) headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
    return headers;
  }

  function json(res, status, payload, headers = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      ...securityHeaders(),
      "x-request-id": getRequestId(),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body),
      ...headers
    });
    res.end(body);
  }

  function redirect(res, location, headers = {}) {
    res.writeHead(303, {
      ...securityHeaders(),
      "x-request-id": getRequestId(),
      "cache-control": "no-store",
      location,
      "content-length": "0",
      ...headers
    });
    res.end();
  }

  function maybeRedirectHttps(req, res, url) {
    if (!enableHttpsRedirect || !trustProxy || forwardedProto(req) !== "http") return false;
    const host = sanitizeHostHeader(req.headers.host);
    const origin = publicHttpsOrigin || (host ? `https://${host}` : "");
    if (!origin) return false;
    res.writeHead(308, {
      ...securityHeaders(),
      "x-request-id": getRequestId(),
      "cache-control": "no-store",
      location: `${origin}${url.pathname}${url.search}`,
      "content-length": "0"
    });
    res.end();
    return true;
  }

  return Object.freeze({ json, maybeRedirectHttps, redirect, securityHeaders });
}
