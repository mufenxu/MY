const STORAGE_KEY = 'haoai_admin_ui_preview';

const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'off']);

function isBrowser() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getQueryValue(value) {
    if (Array.isArray(value)) return String(value[0] || '');
    return String(value || '');
}

export function isUiPreviewAllowed() {
    return Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_UI_PREVIEW === 'true');
}

export function isUiPreviewMode() {
    if (!isUiPreviewAllowed() || !isBrowser()) return false;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function applyUiPreviewQuery(query = {}) {
    if (!isUiPreviewAllowed() || !isBrowser()) return false;

    const rawValue = getQueryValue(query.uiPreview ?? query.mock);
    const normalized = rawValue.trim().toLowerCase();

    try {
        if (truthyValues.has(normalized)) {
            window.localStorage.setItem(STORAGE_KEY, '1');
        } else if (falsyValues.has(normalized)) {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        return false;
    }

    return isUiPreviewMode();
}

export function ensureUiPreviewSession(session) {
    if (!isUiPreviewMode()) return;

    const payload = {
        id: 'ui-preview-admin',
        username: 'ui-preview',
        role: 'admin',
        tokenVersion: 0,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    };
    const tokenPayload = btoa(JSON.stringify(payload))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    session.setAuth(`preview.${tokenPayload}.signature`, {
        id: payload.id,
        username: 'ui-preview',
        displayName: 'UI 预览管理员',
        role: 'admin',
        isWechatBound: true,
    }, 'admin');
}
