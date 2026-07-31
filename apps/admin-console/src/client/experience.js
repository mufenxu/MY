function fingerprintError(error) {
  const source = `${error?.name || 'Error'}:${String(error?.stack || '').split('\n').slice(0, 3).join('\n')}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function reportConsoleExperience({ event, outcome = 'error', error, durationMs, route } = {}) {
  const payload = {
    application: 'console',
    event,
    outcome,
    route: route || new URLSearchParams(window.location.search).get('view') || 'overview',
    durationMs: Number.isFinite(durationMs) ? Math.min(Math.round(durationMs), 300_000) : undefined,
    fingerprint: error ? fingerprintError(error) : undefined,
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

export function installConsoleExperienceMonitoring() {
  const report = (payload) => { void reportConsoleExperience(payload); };
  const reportLoad = () => report({ event: 'page_load', outcome: 'ok', durationMs: performance.now() });
  const handleError = (event) => report({ event: 'unhandled_error', error: event.error || { name: 'Error' } });
  const handleRejection = (event) => report({
    event: 'unhandled_rejection',
    error: event.reason instanceof Error ? event.reason : { name: 'PromiseRejection' },
  });
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  if (document.readyState === 'complete') window.setTimeout(reportLoad, 0);
  else window.addEventListener('load', reportLoad, { once: true });
}
