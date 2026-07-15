/**
 * HTTP 拦截器配置
 * 注入 Authorization header，处理 401/403/429 错误。
 */
import http from '@/utils/http';
import { session } from '@/utils/session';
import { ElMessage } from 'element-plus';
import router from '@/router';
import { notifyAuthExpiredOnce, resetAuthExpiredNotice } from '@/utils/authFailure';

let initialized = false;
let authRedirecting = false;
const CSRF_COOKIE = 'manage_csrf_token';
const AUTH_REQUEST_PATHS = new Set([
    '/api/admin/login',
    '/api/admin/auth/wechat/login',
    '/api/public/scan-login/auth/login',
]);

function readCookie(name) {
    const prefix = `${name}=`;
    return document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix))
        ?.slice(prefix.length) || '';
}

function getRequestPath(config = {}) {
    try {
        return new URL(config.url || '', window.location.origin).pathname;
    } catch {
        return String(config.url || '').split('?')[0];
    }
}

function isAuthRequest(config = {}) {
    return AUTH_REQUEST_PATHS.has(getRequestPath(config));
}

function shouldHandleAsAuthFailure(status, message, config) {
    if (isAuthRequest(config)) return false;
    if (status === 401) return true;

    return status === 403 && /(token|登录|认证|禁用)/i.test(String(message || ''));
}

function redirectToLogin() {
    if (authRedirecting) return;

    authRedirecting = true;
    const currentRoute = router.currentRoute.value;
    if (currentRoute.path !== '/login') {
        router.replace('/login').catch(() => {});
    }
}

export function setupHttpInterceptors() {
    if (initialized) return;
    initialized = true;

    http.interceptors.request.use(
        (config) => {
            const token = session.getToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            const method = String(config.method || 'get').toUpperCase();
            const csrfToken = readCookie(CSRF_COOKIE);
            if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
            }

            return config;
        },
        (error) => Promise.reject(error),
    );

    http.interceptors.response.use(
        (response) => {
            if (isAuthRequest(response.config)) {
                authRedirecting = false;
                resetAuthExpiredNotice();
            }
            return response;
        },
        (error) => {
            if (error.response) {
                const { status } = error.response;
                const message = error.response.data?.message || '服务器内部错误';
                const requestConfig = error.config || error.response.config || {};

                if (shouldHandleAsAuthFailure(status, message, requestConfig)) {
                    notifyAuthExpiredOnce();
                    session.clear();
                    redirectToLogin();
                } else if (status === 429 && !isAuthRequest(requestConfig)) {
                    ElMessage.warning('操作太频繁了，请稍后再试');
                } else if (!isAuthRequest(requestConfig)) {
                    ElMessage.error(message);
                }
            } else {
                ElMessage.error('网络连接失败，请检查网络');
            }
            return Promise.reject(error);
        },
    );
}
