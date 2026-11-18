import axios from 'axios';
import { API_BASE_PATH, IS_PLATFORM_SSO, redirectToPlatformLogin } from './runtime';
import { storeUserSummary } from './userSummary';

const CSRF_COOKIE_NAME = 'core_admin_csrf';
const AUTH_REQUEST_PATHS = new Set([
    '/auth/login',
    '/auth/refresh',
    '/auth/token/exchange-admin',
]);

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || API_BASE_PATH,
    timeout: 12000,
    withCredentials: true,
    headers: { 'X-Core-Admin-Client': 'web' },
});

// 标记是否正在刷新 token，防止多个请求同时触发刷新
let isRefreshing = false;
let csrfTokenMemory = '';
// 刷新期间排队的请求
let failedQueue = [];

// refresh token 用过即作废，服务端发现同一个 token 被用第二次会吊销该账号的全部会话。
// isRefreshing 只能在单个标签页内去重，多个标签页同时 401 时要靠跨标签页的锁串行化：
// 后拿到锁的标签页先看 refresh 是否已由别的标签页完成，完成了就直接重放请求。
const REFRESH_LOCK_NAME = 'core-admin-auth-refresh';
const REFRESH_MARK_KEY = 'core_admin_refreshed_at';

const withRefreshLock = (task) => (
    typeof navigator !== 'undefined' && navigator.locks?.request
        ? navigator.locks.request(REFRESH_LOCK_NAME, task)
        : task()
);

const readRefreshMark = () => {
    try {
        return Number(localStorage.getItem(REFRESH_MARK_KEY)) || 0;
    } catch {
        return 0;
    }
};

const writeRefreshMark = () => {
    try {
        localStorage.setItem(REFRESH_MARK_KEY, String(Date.now()));
    } catch {
        // 存储不可用时退化为每个标签页各自刷新
    }
};

const processQueue = (error) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    failedQueue = [];
};

const readCookie = (name) => {
    if (typeof document === 'undefined') return '';
    const prefix = `${name}=`;
    const value = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix))
        ?.slice(prefix.length);
    if (!value) return '';
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const getRequestPath = (url = '') => {
    try {
        return new URL(url, window.location.origin).pathname.replace(API_BASE_PATH, '');
    } catch {
        return String(url).split('?')[0];
    }
};

const isAuthenticationRequest = (url) => AUTH_REQUEST_PATHS.has(getRequestPath(url));

const clearLegacyCredentials = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
};

const rememberCsrfToken = (response) => {
    const token = response?.headers?.get?.('x-csrf-token')
        || response?.headers?.['x-csrf-token']
        || '';
    if (token) csrfTokenMemory = String(token);
    return response;
};

clearLegacyCredentials();

api.interceptors.request.use((config) => {
    const method = String(config.method || 'get').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const csrfToken = readCookie(CSRF_COOKIE_NAME) || csrfTokenMemory;
        if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
    }
    return config;
});

api.interceptors.response.use(
    (response) => rememberCsrfToken(response),
    async (error) => {
        const originalRequest = error.config;

        if (IS_PLATFORM_SSO && error.response?.status === 401 && !originalRequest?.skipAuthRedirect) {
            redirectToPlatformLogin();
            return Promise.reject(error);
        }

        // Cookie access token expires before the refresh cookie. Refresh once and
        // replay queued requests without ever exposing either token to JavaScript.
        if (
            !IS_PLATFORM_SSO &&
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.skipAuthRefresh &&
            Boolean(readCookie(CSRF_COOKIE_NAME) || csrfTokenMemory) &&
            !isAuthenticationRequest(originalRequest.url)
        ) {
            if (isRefreshing) {
                // 刷新进行中，将此请求排队等待
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => {
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;
            const failedAt = Date.now();

            try {
                const res = await withRefreshLock(async () => {
                    // 等锁期间别的标签页已经换过 token：新 Cookie 对本标签页同样有效，不再重复刷新。
                    if (readRefreshMark() >= failedAt) return null;

                    const csrfToken = readCookie(CSRF_COOKIE_NAME) || csrfTokenMemory;
                    const response = await axios.post(
                        (import.meta.env.VITE_API_URL || API_BASE_PATH) + '/auth/refresh',
                        {},
                        {
                            timeout: 12000,
                            withCredentials: true,
                            headers: {
                                'X-Core-Admin-Client': 'web',
                                ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
                            },
                        }
                    );
                    if (!response.data.success) throw new Error('Refresh failed');
                    writeRefreshMark();
                    return response;
                });

                if (res) {
                    rememberCsrfToken(res);
                    clearLegacyCredentials();
                    if (res.data.user) {
                        storeUserSummary(res.data.user);
                    }
                }

                processQueue(null);

                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                clearLegacyCredentials();
                csrfTokenMemory = '';
                localStorage.removeItem('user');
                window.dispatchEvent(new Event('core-auth-expired'));
                if (!originalRequest.skipAuthRedirect && window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            } finally {
                isRefreshing = false;
            }
        }

        // 其他 401 错误（token 无效、非过期），直接跳转登录
        if (!IS_PLATFORM_SSO && error.response?.status === 401 && !isAuthenticationRequest(originalRequest?.url)) {
            clearLegacyCredentials();
            csrfTokenMemory = '';
            localStorage.removeItem('user');
            window.dispatchEvent(new Event('core-auth-expired'));
            if (!originalRequest?.skipAuthRedirect && window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
