import axios from 'axios';
import { API_BASE_PATH, IS_PLATFORM_SSO, redirectToPlatformLogin } from './runtime';

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

            try {
                const csrfToken = readCookie(CSRF_COOKIE_NAME) || csrfTokenMemory;
                const res = await axios.post(
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

                if (res.data.success) {
                    rememberCsrfToken(res);
                    clearLegacyCredentials();
                    if (res.data.user) {
                        localStorage.setItem('user', JSON.stringify(res.data.user));
                    }

                    processQueue(null);

                    return api(originalRequest);
                } else {
                    throw new Error('Refresh failed');
                }
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
