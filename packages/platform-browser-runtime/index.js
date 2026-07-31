function getBrowserWindow() {
  if (typeof window === 'undefined') {
    throw new Error('Platform browser runtime requires a browser window.');
  }
  return window;
}

const EXPERIENCE_EVENTS = new Set([
  'page_load',
  'route_change',
  'ui_error',
  'unhandled_error',
  'unhandled_rejection',
  'request_failure',
]);

function normalizeExperienceRoute(value) {
  const route = String(value || '/').split(/[?#]/, 1)[0].trim();
  if (!route || !/^[A-Za-z0-9_/:.-]+$/.test(route)) return 'unknown';
  return route
    .split('/')
    .map((segment) => (/^(?:\d{4,}|[0-9a-f]{12,}|[A-Za-z0-9_-]{32,})$/i.test(segment) ? ':id' : segment))
    .join('/')
    .slice(0, 80) || 'unknown';
}

function errorFingerprint(error) {
  const source = `${error?.name || 'Error'}:${String(error?.stack || '').split('\n').slice(0, 3).join('\n')}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
  const experienceApplication = appName === 'core' ? 'core-admin'
    : appName === 'exam' ? 'exam-admin'
      : appName;
  const experienceEnabled = Boolean(
    browserWindow
    && (appBasePath || browserWindow.location.pathname === '/console' || browserWindow.location.pathname.startsWith('/console/')),
  );

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
    activeWindow.location.replace(`/console?returnTo=${encodeURIComponent(returnTo)}`);
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

  async function reportExperience(input = {}) {
    if (!experienceEnabled || !EXPERIENCE_EVENTS.has(String(input.event || ''))) return false;
    const duration = Number(input.durationMs);
    const payload = {
      application: experienceApplication,
      event: String(input.event),
      outcome: ['ok', 'error', 'timeout', 'aborted'].includes(input.outcome) ? input.outcome : 'error',
      route: normalizeExperienceRoute(input.route || stripAppBase(browserWindow.location.pathname)),
      durationMs: Number.isFinite(duration) && duration >= 0 ? Math.min(Math.round(duration), 300_000) : undefined,
      fingerprint: input.error ? errorFingerprint(input.error) : undefined,
    };
    try {
      const response = await fetch('/api/client-experience', {
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform-Request': 'console',
        },
        keepalive: true,
        method: 'POST',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function installExperienceMonitoring() {
    if (!experienceEnabled) return () => {};
    const report = (payload) => { void reportExperience(payload); };
    const reportLoad = () => report({
      event: 'page_load',
      outcome: 'ok',
      durationMs: browserWindow.performance?.now?.(),
    });
    const handleError = (event) => report({
      event: 'unhandled_error',
      outcome: 'error',
      error: event.error || { name: 'Error' },
    });
    const handleRejection = (event) => report({
      event: 'unhandled_rejection',
      outcome: 'error',
      error: event.reason instanceof Error ? event.reason : { name: 'PromiseRejection' },
    });

    browserWindow.addEventListener('error', handleError);
    browserWindow.addEventListener('unhandledrejection', handleRejection);
    if (browserWindow.document?.readyState === 'complete') browserWindow.setTimeout(reportLoad, 0);
    else browserWindow.addEventListener('load', reportLoad, { once: true });

    return () => {
      browserWindow.removeEventListener('error', handleError);
      browserWindow.removeEventListener('unhandledrejection', handleRejection);
      browserWindow.removeEventListener('load', reportLoad);
    };
  }

  return Object.freeze({
    APP_BASE_PATH: appBasePath,
    API_BASE_PATH: appBasePath ? `${appBasePath}/api` : '/api',
    IS_PLATFORM_SSO: Boolean(appBasePath),
    fetchWithTimeout,
    installExperienceMonitoring,
    logoutPlatformSession,
    reportExperience,
    redirectToPlatformLogin,
    resolveAppUrl,
    stripAppBase,
  });
}
