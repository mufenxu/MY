export const APP_BASE_PATH = typeof window !== 'undefined'
    && /^\/apps\/exam(?:\/|$)/.test(window.location.pathname)
    ? '/apps/exam'
    : '';

export const IS_PLATFORM_SSO = Boolean(APP_BASE_PATH);

export function resolveAppUrl(path = '/') {
    const normalized = String(path || '/');
    if (!APP_BASE_PATH || !normalized.startsWith('/')) return normalized;
    if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) return normalized;
    return `${APP_BASE_PATH}${normalized}`;
}
export function stripAppBase(path = '/') {
    const normalized = String(path || '/');
    if (!APP_BASE_PATH || !normalized.startsWith(APP_BASE_PATH)) return normalized;
    return normalized.slice(APP_BASE_PATH.length) || '/';
}

export function redirectToPlatformLogin() {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function fetchWithTimeout(input, init = {}, timeout = 12000) {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal) {
        if (upstreamSignal.aborted) abortFromUpstream();
        else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
    }
    const timer = window.setTimeout(
        () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
        timeout,
    );

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        window.clearTimeout(timer);
        upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
}

export async function logoutPlatformSession() {
    const response = await fetchWithTimeout('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Platform-Request': 'console' },
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '统一平台退出失败');
    }
    window.location.replace('/');
}
