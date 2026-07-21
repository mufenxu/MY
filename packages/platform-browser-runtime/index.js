function getBrowserWindow() {
  if (typeof window === 'undefined') {
    throw new Error('Platform browser runtime requires a browser window.');
  }
  return window;
}

export function createPlatformBrowserRuntime({ appName, clearLocalSession } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(String(appName || ''))) {
    throw new Error('A valid managed application name is required.');
  }

  const browserWindow = typeof window === 'undefined' ? null : window;
  const appPrefix = `/apps/${appName}`;
  const appBasePath = browserWindow && new RegExp(`^${appPrefix}(?:/|$)`).test(browserWindow.location.pathname)
    ? appPrefix
    : '';

  function resolveAppUrl(path = '/') {
    const normalized = String(path || '/');
    if (!appBasePath || !normalized.startsWith('/')) return normalized;
    if (normalized === appBasePath || normalized.startsWith(`${appBasePath}/`)) return normalized;
    return `${appBasePath}${normalized}`;
  }

  function stripAppBase(path = '/') {
    const normalized = String(path || '/');
    if (!appBasePath || !normalized.startsWith(appBasePath)) return normalized;
    return normalized.slice(appBasePath.length) || '/';
  }

  function redirectToPlatformLogin() {
    const activeWindow = getBrowserWindow();
    const returnTo = `${activeWindow.location.pathname}${activeWindow.location.search}${activeWindow.location.hash}`;
    activeWindow.location.replace(`/?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function fetchWithTimeout(input, init = {}, timeout = 12000) {
    const activeWindow = getBrowserWindow();
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal) {
      if (upstreamSignal.aborted) abortFromUpstream();
      else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
    }
    const timer = activeWindow.setTimeout(
      () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
      timeout,
    );

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      activeWindow.clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
  }

  async function logoutPlatformSession() {
    const response = await fetchWithTimeout('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Platform-Request': 'console' },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Unified platform logout failed.');
    }
    clearLocalSession?.();
    getBrowserWindow().location.replace('/');
  }

  return Object.freeze({
    APP_BASE_PATH: appBasePath,
    API_BASE_PATH: appBasePath ? `${appBasePath}/api` : '/api',
    IS_PLATFORM_SSO: Boolean(appBasePath),
    fetchWithTimeout,
    logoutPlatformSession,
    redirectToPlatformLogin,
    resolveAppUrl,
    stripAppBase,
  });
}
