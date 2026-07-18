import axios from 'axios';
import { API_BASE_PATH, IS_PLATFORM_SSO, redirectToPlatformLogin } from './runtime';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || API_BASE_PATH,
    timeout: 12000,
    withCredentials: true,
    headers: { 'X-Core-Admin-Client': 'web' },
});

// 标记是否正在刷新 token，防止多个请求同时触发刷新
let isRefreshing = false;
// 刷新期间排队的请求
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.request.use((config) => {
    if (IS_PLATFORM_SSO) return config;
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (IS_PLATFORM_SSO && error.response?.status === 401) {
            redirectToPlatformLogin();
            return Promise.reject(error);
        }

        // 如果是 401 且标记为 token 过期，且不是刷新请求本身，尝试自动刷新
        if (
            error.response &&
            error.response.status === 401 &&
            error.response.data?.tokenExpired &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/auth/refresh')
        ) {
            if (isRefreshing) {
                // 刷新进行中，将此请求排队等待
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = `Bearer ${token}`;
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.post(
                    (import.meta.env.VITE_API_URL || API_BASE_PATH) + '/auth/refresh',
                    {},
                    {
                        timeout: 12000,
                        withCredentials: true,
                        headers: { 'X-Core-Admin-Client': 'web' },
                    }
                );

                if (res.data.success && res.data.token) {
                    const newToken = res.data.token;
                    localStorage.setItem('token', newToken);
                    localStorage.removeItem('refreshToken');
                    if (res.data.user) {
                        localStorage.setItem('user', JSON.stringify(res.data.user));
                    }

                    // 通知排队的请求使用新 token
                    processQueue(null, newToken);

                    // 重放原始请求
                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                    return api(originalRequest);
                } else {
                    throw new Error('Refresh failed');
                }
            } catch (refreshError) {
                processQueue(refreshError, null);
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        // 其他 401 错误（token 无效、非过期），直接跳转登录
        if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
