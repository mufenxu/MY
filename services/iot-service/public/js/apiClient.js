(function attachApiClient(global) {
  const REQUEST_TIMEOUT_MS = 15000;
  const HISTORY_REQUEST_TIMEOUT_MS = 30000;
  const MAINTENANCE_REQUEST_TIMEOUT_MS = 60000;
  const APP_BASE_PATH = /^\/apps\/iot(?:\/|$)/.test(global.location.pathname)
    ? '/apps/iot'
    : '';

  function resolveAppUrl(url) {
    const normalized = String(url || '/');
    if (!APP_BASE_PATH || !normalized.startsWith('/')) return normalized;
    if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) return normalized;
    return `${APP_BASE_PATH}${normalized}`;
  }

  function redirectToPlatformLogin() {
    const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
    global.location.replace(`/?returnTo=${encodeURIComponent(returnTo)}`);
  }

  function createClientRequestId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }

    return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createRequestHeaders(headers, requestId) {
    const result = new Headers(headers || {});
    if (!result.has('Accept')) {
      result.set('Accept', 'application/json');
    }
    if (!result.has('X-Request-Id')) {
      result.set('X-Request-Id', requestId);
    }

    return result;
  }

  function formatRequestError(data, status, requestId) {
    const base = data.error || `请求失败 (${status})`;
    const code = data.code ? ` / ${data.code}` : '';
    const suffix = requestId ? ` [${String(requestId).slice(0, 8)}]` : '';
    return `${base}${code}${suffix}`;
  }

  function formatRequestTimeoutError(requestId) {
    const suffix = requestId ? ` [${String(requestId).slice(0, 8)}]` : '';
    return `请求超时，请检查网络或稍后重试 / REQUEST_TIMEOUT${suffix}`;
  }

  function formatRequestAbortError(requestId) {
    const suffix = requestId ? ` [${String(requestId).slice(0, 8)}]` : '';
    return `请求已取消 / REQUEST_ABORTED${suffix}`;
  }

  function formatRequestNetworkError(error, requestId) {
    const suffix = requestId ? ` [${String(requestId).slice(0, 8)}]` : '';
    const detail = error && error.message ? `：${error.message}` : '';
    return `网络请求失败${detail} / NETWORK_ERROR${suffix}`;
  }

  function createApiClient(options = {}) {
    const onUnauthorized = typeof options.onUnauthorized === 'function'
      ? options.onUnauthorized
      : () => {};
    const defaultTimeoutMs = options.defaultTimeoutMs || REQUEST_TIMEOUT_MS;

    async function requestJson(url, requestOptions = {}) {
      const {
        requestId = createClientRequestId(),
        timeoutMs = defaultTimeoutMs,
        signal,
        headers,
        ...fetchOptions
      } = requestOptions;
      const timeoutEnabled = Number.isFinite(timeoutMs) && timeoutMs > 0;
      const controller = timeoutEnabled ? new AbortController() : null;
      let timeoutId = null;
      let timedOut = false;
      let abortHandler = null;

      if (controller && signal) {
        if (signal.aborted) {
          controller.abort(signal.reason);
        } else {
          abortHandler = () => controller.abort(signal.reason);
          signal.addEventListener('abort', abortHandler, { once: true });
        }
      }

      if (controller) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
      }

      try {
        const response = await fetch(resolveAppUrl(url), {
          ...fetchOptions,
          signal: controller ? controller.signal : signal,
          headers: createRequestHeaders(headers, requestId)
        });
        const data = await response.json().catch(() => ({}));
        const responseRequestId = response.headers.get('x-request-id') || data.requestId || requestId;

        if (!response.ok) {
          const error = new Error(formatRequestError(data, response.status, responseRequestId));
          error.status = response.status;
          error.code = data.code;
          error.requestId = responseRequestId;
          if (response.status === 401) {
            onUnauthorized(error);
          }
          throw error;
        }

        return data;
      } catch (error) {
        if (timedOut) {
          const timeoutError = new Error(formatRequestTimeoutError(requestId));
          timeoutError.code = 'REQUEST_TIMEOUT';
          timeoutError.requestId = requestId;
          timeoutError.timeoutMs = timeoutMs;
          throw timeoutError;
        }

        if (error && error.name === 'AbortError') {
          const abortError = new Error(formatRequestAbortError(requestId));
          abortError.code = 'REQUEST_ABORTED';
          abortError.requestId = requestId;
          throw abortError;
        }

        if (error instanceof TypeError) {
          const networkError = new Error(formatRequestNetworkError(error, requestId));
          networkError.code = 'NETWORK_ERROR';
          networkError.requestId = requestId;
          networkError.originalError = error;
          throw networkError;
        }

        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      }
    }

    return {
      requestJson
    };
  }

  global.MqttApiClient = {
    APP_BASE_PATH,
    HISTORY_REQUEST_TIMEOUT_MS,
    MAINTENANCE_REQUEST_TIMEOUT_MS,
    REQUEST_TIMEOUT_MS,
    createApiClient,
    redirectToPlatformLogin,
    resolveAppUrl
  };
})(window);
