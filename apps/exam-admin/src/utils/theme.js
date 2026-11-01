/**
 * 深浅主题
 * 珍珠令牌通过 <html data-theme="light|dark"> 切换；本模块负责解析首选主题、
 * 跟随系统变化并在本地记住手动选择。
 */

const STORAGE_KEY = 'exam-admin-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function prefersDark() {
    if (!isBrowser() || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(DARK_QUERY).matches;
}

export function getStoredTheme() {
    if (!isBrowser()) return '';
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value === 'dark' || value === 'light' ? value : '';
    } catch {
        return '';
    }
}

export function resolveTheme() {
    return getStoredTheme() || (prefersDark() ? 'dark' : 'light');
}

export function getCurrentTheme() {
    if (!isBrowser()) return 'light';
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** 应用主题；不传参时按「手动选择 → 系统偏好」解析。 */
export function applyTheme(theme) {
    if (!isBrowser()) return 'light';
    const next = theme === 'dark' || theme === 'light' ? theme : resolveTheme();
    const root = document.documentElement;
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    return next;
}

/** 手动切换并记住选择。 */
export function setTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    if (isBrowser()) {
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            /* 存储不可用时仅本次生效 */
        }
    }
    return applyTheme(next);
}

export function toggleTheme() {
    return setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

/** 启动时调用一次：先落定主题，再跟随系统变化（手动选择优先）。 */
export function initTheme() {
    if (!isBrowser()) return 'light';
    const initial = applyTheme();
    if (typeof window.matchMedia !== 'function') return initial;

    const query = window.matchMedia(DARK_QUERY);
    const handleChange = () => {
        if (!getStoredTheme()) applyTheme();
    };
    if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handleChange);
    } else if (typeof query.addListener === 'function') {
        query.addListener(handleChange);
    }
    return initial;
}
