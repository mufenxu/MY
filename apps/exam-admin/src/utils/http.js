/**
 * HTTP 客户端模块
 * 从 http-client.js IIFE 迁移为 ES Module。
 * 保留自写 fetch 封装，兼容拦截器模式。
 */
import { resolveAppUrl } from '@/utils/runtime';

function createInterceptorManager() {
    const handlers = [];
    return {
        use(onFulfilled, onRejected) {
            handlers.push({ onFulfilled, onRejected });
            return handlers.length - 1;
        },
        handlers,
    };
}

function appendParams(url, params) {
    if (!params) return url;
    const nextUrl = new URL(url, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
            value.forEach((item) => nextUrl.searchParams.append(key, item));
            return;
        }
        nextUrl.searchParams.set(key, value);
    });
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

function isBodyPayload(value) {
    return (typeof FormData !== 'undefined' && value instanceof FormData)
        || (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams)
        || (typeof Blob !== 'undefined' && value instanceof Blob);
}

async function parseResponse(response) {
    const text = await response.text();
    if (!text) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || /^[[\{]/.test(text.trim())) {
        return JSON.parse(text);
    }
    return text;
}

function createHttpError(message, response, data, config) {
    const error = new Error(message);
    if (response) {
        error.response = {
            status: response.status,
            statusText: response.statusText,
            data,
            headers: response.headers,
            config,
        };
    }
    error.config = config;
    return error;
}

const http = {
    defaults: { timeout: 12000 },
    interceptors: {
        request: createInterceptorManager(),
        response: createInterceptorManager(),
    },
};

async function applyRequestInterceptors(config) {
    let next = config;
    for (const h of http.interceptors.request.handlers) {
        if (h.onFulfilled) next = await h.onFulfilled(next);
    }
    return next;
}

async function applyResponseSuccess(response) {
    let next = response;
    for (const h of http.interceptors.response.handlers) {
        if (h.onFulfilled) next = await h.onFulfilled(next);
    }
    return next;
}

async function applyResponseError(error) {
    let next = error;
    for (const h of http.interceptors.response.handlers) {
        if (h.onRejected) {
            try { return await h.onRejected(next); }
            catch (e) { next = e; }
        }
    }
    throw next;
}

http.request = async function request(rawConfig) {
    const config = await applyRequestInterceptors({
        method: 'get',
        headers: {},
        ...rawConfig,
        url: resolveAppUrl(rawConfig.url || ''),
    });

    const method = String(config.method || 'get').toUpperCase();
    const timeout = config.timeout || http.defaults.timeout || 0;
    const controller = new AbortController();
    const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
    const headers = new Headers(config.headers || {});
    const fetchOptions = {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
    };

    const requestUrl = appendParams(config.url, config.params);

    if (!['GET', 'HEAD'].includes(method) && config.data !== undefined) {
        if (isBodyPayload(config.data)) {
            fetchOptions.body = config.data;
        } else {
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
            fetchOptions.body = JSON.stringify(config.data);
        }
    }

    try {
        const response = await fetch(requestUrl, fetchOptions);
        const data = await parseResponse(response);
        const httpResponse = {
            data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            config,
            request: null,
        };

        if (!response.ok) {
            throw createHttpError(
                data?.message || response.statusText || '请求失败',
                response, data, config,
            );
        }

        return await applyResponseSuccess(httpResponse);
    } catch (error) {
        if (error.name === 'AbortError') error.message = '请求超时，请稍后再试';
        return applyResponseError(error);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

['get', 'delete'].forEach((method) => {
    http[method] = (url, config = {}) => http.request({ ...config, method, url });
});

['post', 'put', 'patch'].forEach((method) => {
    http[method] = (url, data, config = {}) => http.request({ ...config, method, url, data });
});

export default http;
