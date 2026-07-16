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

export async function logoutPlatformSession() {
    await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Platform-Request': 'console' },
    }).catch(() => {});
    window.location.replace('/');
}
