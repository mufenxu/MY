/**
 * 会话管理模块
 * 管理 token、用户信息、认证类型的存储与读取。
 * 从 shared.js IIFE 迁移为 ES Module。
 */

const TOKEN_KEY = 'manageToken';
const USER_KEY = 'manageUser';
const AUTH_TYPE_KEY = 'manageAuthType';
const SESSION_MARKER_KEY = 'manageSessionActive';
const SESSION_EXPIRES_AT_KEY = 'manageSessionExpiresAt';
const CSRF_COOKIE = 'manage_csrf_token';
const LEGACY_KEYS = ['adminToken', 'adminUser', 'consoleToken', 'consoleUser'];
const STORAGE_TEST_KEY = '__manage_session_test__';
const EXPIRY_GRACE_MS = 30 * 1000;
const memoryStore = {};
let runtimeConfigPromise = null;

function getAvailableStorage(name) {
    try {
        const storage = window[name];
        if (!storage) return null;
        storage.setItem(STORAGE_TEST_KEY, '1');
        storage.removeItem(STORAGE_TEST_KEY);
        return storage;
    } catch {
        return null;
    }
}

const durableStorage = getAvailableStorage('localStorage');
const tabStorage = getAvailableStorage('sessionStorage');

function readStorage(storage, key) {
    try {
        return storage ? (storage.getItem(key) || '') : '';
    } catch {
        return '';
    }
}

function writeStorage(storage, key, value) {
    try {
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function removeStorage(storage, key) {
    try {
        if (storage) storage.removeItem(key);
    } catch { /* ignore */ }
}

function getStoredValue(key) {
    return readStorage(durableStorage, key)
        || readStorage(tabStorage, key)
        || memoryStore[key]
        || '';
}

function setStoredValue(key, value) {
    const v = String(value || '');
    memoryStore[key] = v;
    writeStorage(durableStorage, key, v);
    writeStorage(tabStorage, key, v);
}

function removeStoredValue(key) {
    delete memoryStore[key];
    removeStorage(durableStorage, key);
    removeStorage(tabStorage, key);
}

function clearSessionValues() {
    removeStoredValue(TOKEN_KEY);
    removeStoredValue(USER_KEY);
    removeStoredValue(AUTH_TYPE_KEY);
    removeStoredValue(SESSION_MARKER_KEY);
    removeStoredValue(SESSION_EXPIRES_AT_KEY);
    clearLegacyKeys();
}

function getTokenExpiresAt(token) {
    const exp = Number(decodeJwtPayload(token).exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
}

function setSessionExpiresAt(token) {
    const expiresAt = getTokenExpiresAt(token);
    if (expiresAt) {
        setStoredValue(SESSION_EXPIRES_AT_KEY, String(expiresAt));
        return;
    }

    removeStoredValue(SESSION_EXPIRES_AT_KEY);
}

function normalizeExpiresAt(value) {
    if (!value) return 0;

    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue < 100000000000 ? numericValue * 1000 : numericValue;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function setSessionExpiresAtValue(value) {
    const expiresAt = normalizeExpiresAt(value);
    if (expiresAt) {
        setStoredValue(SESSION_EXPIRES_AT_KEY, String(expiresAt));
        return;
    }

    removeStoredValue(SESSION_EXPIRES_AT_KEY);
}

function setTokenValue(token, { persistent = true } = {}) {
    const value = String(token || '');
    if (persistent) {
        setStoredValue(TOKEN_KEY, value);
        setSessionExpiresAt(value);
        return;
    }

    delete memoryStore[TOKEN_KEY];
    removeStorage(durableStorage, TOKEN_KEY);
    removeStorage(tabStorage, TOKEN_KEY);
}

function decodeJwtPayload(token) {
    try {
        const part = String(token || '').split('.')[1];
        if (!part) return {};
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const padded = `${b64}${'='.repeat((4 - (b64.length % 4)) % 4)}`;
        const json = decodeURIComponent(
            atob(padded).split('').map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
        );
        return JSON.parse(json);
    } catch {
        return {};
    }
}

function inferAuthTypeFromToken(token) {
    return decodeJwtPayload(token).role === 'console' ? 'console' : 'admin';
}

function normalizeAuthType(value, token = '') {
    if (value === 'console' || value === 'admin') return value;
    return inferAuthTypeFromToken(token);
}

function readJson(value) {
    if (!value) return {};
    try { return JSON.parse(value); } catch { return {}; }
}

function clearLegacyKeys() {
    LEGACY_KEYS.forEach((key) => removeStoredValue(key));
}

function hasStoredUser() {
    return Object.keys(readJson(getStoredValue(USER_KEY))).length > 0;
}

function readCookie(name) {
    if (typeof document === 'undefined') return '';

    const prefix = `${name}=`;
    return document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix))
        ?.slice(prefix.length) || '';
}

function isExpiredAt(expiresAt) {
    const value = Number(expiresAt || 0);
    return Number.isFinite(value) && value > 0 && Date.now() + EXPIRY_GRACE_MS >= value;
}

function getSessionStatus() {
    const token = getStoredValue(TOKEN_KEY);
    if (token) {
        const expiresAt = getTokenExpiresAt(token);
        if (expiresAt) setStoredValue(SESSION_EXPIRES_AT_KEY, String(expiresAt));
        if (isExpiredAt(expiresAt)) return { active: false, expired: true };
        return { active: true, expired: false };
    }

    const hasSessionMarker = Boolean(getStoredValue(SESSION_MARKER_KEY) || hasStoredUser());
    if (!hasSessionMarker) return { active: false, expired: false };

    if (isExpiredAt(getStoredValue(SESSION_EXPIRES_AT_KEY))) {
        return { active: false, expired: true };
    }

    if (!readCookie(CSRF_COOKIE)) {
        return { active: false, expired: true };
    }

    return { active: true, expired: false };
}

// 初始化时迁移旧版存储
function migrateLegacySession() {
    const currentToken = getStoredValue(TOKEN_KEY);
    if (currentToken) {
        setStoredValue(TOKEN_KEY, currentToken);
        setStoredValue(USER_KEY, getStoredValue(USER_KEY) || '{}');
        setStoredValue(AUTH_TYPE_KEY, normalizeAuthType(getStoredValue(AUTH_TYPE_KEY), currentToken));
        setSessionExpiresAt(currentToken);
        clearLegacyKeys();
        return;
    }

    const consoleToken = getStoredValue('consoleToken');
    const adminToken = getStoredValue('adminToken');
    const token = consoleToken || adminToken;
    if (!token) {
        clearLegacyKeys();
        return;
    }

    const userValue = consoleToken ? getStoredValue('consoleUser') : getStoredValue('adminUser');
    setStoredValue(TOKEN_KEY, token);
    setStoredValue(USER_KEY, userValue || '{}');
    setStoredValue(AUTH_TYPE_KEY, consoleToken ? 'console' : normalizeAuthType('', token));
    setSessionExpiresAt(token);
    clearLegacyKeys();
}

migrateLegacySession();

export const session = {
    getToken: () => getStoredValue(TOKEN_KEY),
    getStatus() {
        const status = getSessionStatus();
        if (status.expired) clearSessionValues();
        return status;
    },
    hasSession() {
        return this.getStatus().active;
    },
    getUser: () => readJson(getStoredValue(USER_KEY)),
    getAuthType() {
        return normalizeAuthType(getStoredValue(AUTH_TYPE_KEY), this.getToken());
    },
    isConsole() { return this.getAuthType() === 'console'; },
    isAdmin() { return this.getAuthType() === 'admin'; },
    setToken: (token) => setTokenValue(token || ''),
    setUser: (user) => setStoredValue(USER_KEY, JSON.stringify(user || {})),
    setAuthType(authType) {
        setStoredValue(AUTH_TYPE_KEY, normalizeAuthType(authType, this.getToken()));
    },
    setAuth(token, user, authType = '', options = {}) {
        setTokenValue(token || '', { persistent: !options.cookieAuth });
        if (Object.prototype.hasOwnProperty.call(options, 'expiresAt')) {
            setSessionExpiresAtValue(options.expiresAt);
        } else {
            setSessionExpiresAt(token || '');
        }
        setStoredValue(USER_KEY, JSON.stringify(user || {}));
        setStoredValue(AUTH_TYPE_KEY, normalizeAuthType(authType, token));
        setStoredValue(SESSION_MARKER_KEY, '1');
        clearLegacyKeys();
    },
    clear() {
        clearSessionValues();
    },
};

export async function loadRuntimeConfig() {
    if (!runtimeConfigPromise) {
        runtimeConfigPromise = fetch('/api/public/runtime-config', {
            cache: 'no-store',
            credentials: 'same-origin',
        })
            .then((r) => r.json())
            .then((payload) => payload.data || {
                scanLogin: { enabled: false, apiBase: '' },
                aiCaptcha: { enabled: false, region: 'cn', prefix: '', sceneId: '' },
                console: { loginPath: '/login' },
            })
            .catch(() => ({
                scanLogin: { enabled: false, apiBase: '' },
                aiCaptcha: { enabled: false, region: 'cn', prefix: '', sceneId: '' },
                console: { loginPath: '/login' },
            }));
    }
    return runtimeConfigPromise;
}
