// 校园内网系统与 WebVPN 网关大量使用自签名证书。Node 的 fetch 默认严格校验，
// 一旦链路上出现自签证书，报错会被压成 "fetch failed"，看起来像"网络不通"，
// 实际是 TLS 校验失败（DEPTH_ZERO_SELF_SIGNED_CERT）。
//
// 这里的策略是「先严格、后降级」：默认仍走标准证书校验；只有确认是证书类错误，
// 才对已经通过 *.hgu.edu.cn 白名单校验的目标降级重试一次。证书正常的请求
// 完全不受影响，也不会波及其他任何第三方域名。
import { connect as tlsConnect } from "node:tls";
import { isIP } from "node:net";

const CERTIFICATE_ERROR_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID"
]);

export function certificateFailureCode(error, depth = 0) {
  if (!error || typeof error !== "object" || depth > 4) return "";
  const code = String(error.code || "");
  if (CERTIFICATE_ERROR_CODES.has(code)) return code;
  if (Array.isArray(error.errors)) {
    for (const item of error.errors) {
      const hit = certificateFailureCode(item, depth + 1);
      if (hit) return hit;
    }
  }
  return certificateFailureCode(error.cause, depth + 1);
}

let dispatcherPromise = null;

// undici 由 cheerio 带入（生产依赖），这里动态加载：拿不到就维持原有严格行为，
// 绝不因为缺少可选模块让服务启动失败。
export function loadRelaxedDispatcher() {
  if (!dispatcherPromise) {
    dispatcherPromise = import("undici")
      .then(({ Agent }) => new Agent({ connect: { rejectUnauthorized: false }, connections: 16 }))
      .catch(() => null);
  }
  return dispatcherPromise;
}

export function resetRelaxedDispatcherForTest() {
  dispatcherPromise = null;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// 降级放行时顺便把对端证书的真实身份记下来，便于判断这是学校自建 CA
// 还是链路上的第三方网关。只在首次降级时执行，不阻塞请求。
export function describePeerCertificate(host, { port = 443, timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {
        // 忽略销毁异常
      }
      resolve(value);
    };
    try {
      socket = tlsConnect({
        host,
        port,
        // RFC 6066 不允许把 IP 字面量作为 SNI。
        ...(isIP(host) ? {} : { servername: host }),
        rejectUnauthorized: false
      }, () => {
        const cert = socket.getPeerCertificate() || {};
        const subjectCN = cert.subject?.CN || "";
        const issuerCN = cert.issuer?.CN || "";
        finish({
          subject: subjectCN,
          issuer: issuerCN,
          issuerOrg: cert.issuer?.O || "",
          validTo: cert.valid_to || "",
          fingerprint256: cert.fingerprint256 || "",
          selfSigned: Boolean(subjectCN) && subjectCN === issuerCN
        });
      });
      socket.setTimeout(timeoutMs, () => finish(null));
      socket.on("error", () => finish(null));
    } catch {
      finish(null);
    }
  });
}

// 降级日志按主机节流，避免每个请求刷一条。
export function createRelaxedTlsReporter({ windowMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const seen = new Map();
  return function shouldReport(host) {
    const current = now();
    const last = seen.get(host);
    if (last !== undefined && current - last < windowMs) return false;
    seen.set(host, current);
    return true;
  };
}
