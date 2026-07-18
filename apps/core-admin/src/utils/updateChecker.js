import { fetchWithTimeout, resolveAppUrl } from './runtime';

const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
const RELOAD_MARKER_KEY = 'admin-web-reloaded-version';
const VERSION_FILE = '/version.json';

const getVersionUrl = () => {
    const url = new URL(resolveAppUrl(VERSION_FILE), window.location.origin);
    url.searchParams.set('t', Date.now().toString());
    return url.toString();
};

const normalizeVersion = (version) => (typeof version === 'string' ? version.trim() : '');

const fetchLatestVersion = async () => {
    const response = await fetchWithTimeout(getVersionUrl(), {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        },
    }, 6000);

    if (!response.ok) return '';

    const data = await response.json();
    return normalizeVersion(data?.version);
};

const reloadToVersion = (latestVersion) => {
    if (sessionStorage.getItem(RELOAD_MARKER_KEY) === latestVersion) return;

    sessionStorage.setItem(RELOAD_MARKER_KEY, latestVersion);
    const url = new URL(window.location.href);
    url.searchParams.set('__v', latestVersion);
    window.location.replace(url.toString());
};

const removeVersionMarker = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('__v')) return;

    url.searchParams.delete('__v');
    window.history.replaceState(window.history.state, document.title, url.toString());
};

export const checkForAppUpdate = async () => {
    if (import.meta.env.DEV) return false;

    try {
        const latestVersion = await fetchLatestVersion();
        if (!latestVersion) return false;

        if (latestVersion !== CURRENT_VERSION) {
            reloadToVersion(latestVersion);
            return true;
        }

        removeVersionMarker();
        sessionStorage.removeItem(RELOAD_MARKER_KEY);
        return false;
    } catch {
        return false;
    }
};

export const startUpdateChecker = () => {
    if (import.meta.env.DEV || typeof window === 'undefined') return;

    let timerId = 0;
    let checkInFlight = null;
    const runCheck = () => {
        if (!checkInFlight) {
            checkInFlight = checkForAppUpdate().finally(() => {
                checkInFlight = null;
            });
        }
        return checkInFlight;
    };
    const scheduleCheck = () => {
        if (document.visibilityState === 'hidden') return;

        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => {
            void runCheck();
        }, 300);
    };

    window.setTimeout(scheduleCheck, 1000);
    window.addEventListener('focus', scheduleCheck);
    window.addEventListener('online', scheduleCheck);
    window.addEventListener('pageshow', scheduleCheck);
    document.addEventListener('visibilitychange', scheduleCheck);
};
