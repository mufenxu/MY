import contract from '../../../packages/api-contract/index.cjs';

const { httpStatusFor, messageFor } = contract;

/**
 * 网关自己的错误响应写出器。
 *
 * 网关是最常被看到的一层（502/504 几乎都出现在这里），但此前它回的是
 * `{ error, code }`：没有 `ok`/`success`，没有 `requestId`，`error` 还是英文
 * 技术文案（`Upstream service timed out.`）。规范 §2.1 要求所有 4xx/5xx 都是
 * 同一份信封，网关不能例外。
 *
 * 状态码优先取调用方传入的 `status`；没传时按错误码注册表推导，
 * 保证「一个 code 只对应一个 HTTP 状态」这条规则在网关侧也成立。
 */
export function writeError(res, { status, code, message, retryAfter, headers } = {}) {
  if (!res || res.destroyed) return;
  if (res.headersSent) {
    res.destroy?.();
    return;
  }

  const finalCode = typeof code === 'string' && code ? code : 'INTERNAL_ERROR';
  const finalStatus = Number.isInteger(status) ? status : httpStatusFor(finalCode, 500);
  const finalMessage = message || messageFor(finalCode);

  const body = {
    ok: false,
    success: false,
    code: finalCode,
    error: finalMessage,
    message: finalMessage,
  };

  // 网关在 handler 入口就把请求 ID 写进了响应头，这里直接复用，
  // 保证 body.requestId 与 X-Request-Id 永远一致。
  const requestId = typeof res.getHeader === 'function' ? res.getHeader('X-Request-Id') : null;
  if (requestId) body.requestId = String(requestId);

  const retryAfterSeconds = Number(retryAfter);
  const hasRetryAfter = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0;
  if (hasRetryAfter) body.retryAfter = Math.ceil(retryAfterSeconds);

  const outgoing = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(hasRetryAfter ? { 'Retry-After': String(Math.ceil(retryAfterSeconds)) } : {}),
    ...(headers || {}),
  };

  res.writeHead(finalStatus, outgoing);
  res.end(JSON.stringify(body));
}

/**
 * 限流响应专用：除 Retry-After 外再补 RateLimit-*，让客户端不必猜窗口。
 * 只在 429 上发，避免给每个成功响应都加头。
 */
export function writeRateLimited(res, { code, message, retryAfter, limit } = {}) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfter) || 1));
  const headers = {
    'RateLimit-Remaining': '0',
    'RateLimit-Reset': String(seconds),
  };
  const numericLimit = Number(limit);
  if (Number.isFinite(numericLimit) && numericLimit > 0) {
    headers['RateLimit-Limit'] = String(numericLimit);
  }
  writeError(res, { status: 429, code, message, retryAfter: seconds, headers });
}
