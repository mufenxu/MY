// 上游抖动的短冷却。
//
// 背景：同一用户可能同时有多个轮询在跑（座位、研讨间、能耗各一条），每个轮询都会
// 各自重跑一遍完整的登录 / 换票链路。上游一旦连不上，这些并发请求不会互相知道，
// 结果是「一次故障被放大成 N 次上游请求」，用户侧还要排队等 N 倍时间，也更容易
// 触发学校网关的频率限制。
//
// 只对「连不上上游」这类瞬时故障生效：
//   - 登录态问题（票据缺失、401）不进冷却，必须每次重新判断，否则用户重新登录后
//     还要等冷却结束。
//   - 冷却窗口很短（15 秒），到期自动重新探测，不需要人工干预。
export const UPSTREAM_FAILURE_COOLDOWN_MS = 15_000;

export function recordUpstreamFailure(meta, { at, status, code, message, cooldownMs = UPSTREAM_FAILURE_COOLDOWN_MS }) {
  if (!meta || typeof meta !== "object") return meta;
  meta.lastFailure = {
    at: at || new Date().toISOString(),
    status: Number(status) || 502,
    code: code || null,
    message: String(message || ""),
    cooldownMs
  };
  return meta;
}

export function readUpstreamFailure(meta, now = Date.now()) {
  const failure = meta?.lastFailure;
  if (!failure?.at) return null;
  const capturedAt = Date.parse(failure.at);
  if (!Number.isFinite(capturedAt)) return null;
  const cooldownMs = Number(failure.cooldownMs) || UPSTREAM_FAILURE_COOLDOWN_MS;
  if (now - capturedAt >= cooldownMs) return null;
  return {
    status: Number(failure.status) || 502,
    code: failure.code || "UPSTREAM_UNAVAILABLE",
    message: failure.message || "学校系统当前无法访问，请稍后重试。",
    retryAfterMs: Math.max(0, cooldownMs - (now - capturedAt))
  };
}

export function clearUpstreamFailure(meta) {
  if (meta && typeof meta === "object") delete meta.lastFailure;
  return meta;
}
