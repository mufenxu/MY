export const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

function createRequestError(message, { code, status, cause } = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.status = status;
  return error;
}

export async function requestJson(url, options = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    fetchImpl = fetch,
    signal: callerSignal,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
    : null;

  let response;
  try {
    response = await fetchImpl(url, {
    credentials: 'same-origin',
    ...fetchOptions,
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(fetchOptions.method && fetchOptions.method !== 'GET' ? { 'X-Platform-Request': 'console' } : {}),
      ...fetchOptions.headers,
    },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      const timedOut = !callerSignal?.aborted;
      throw createRequestError(timedOut ? '请求超时，请重试。' : '请求已取消。', {
        code: timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED',
        cause: error,
      });
    }
    throw createRequestError('无法连接服务，请检查网络后重试。', {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  } finally {
    if (timer) clearTimeout(timer);
    callerSignal?.removeEventListener?.('abort', abortFromCaller);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = createRequestError(data.message || data.error || `请求失败（HTTP ${response.status}）`, {
      status: response.status,
      code: data.code || 'HTTP_ERROR',
    });
    error.details = data.details;
    throw error;
  }
  return data;
}
