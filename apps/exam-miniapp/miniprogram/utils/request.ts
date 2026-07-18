import { runtimeConfig } from '../config/runtime';

const BASE_URL = runtimeConfig.baseUrl.replace(/\/$/, '');

interface RequestOptions {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: any;
    header?: Record<string, any>;
    showError?: boolean;
    timeout?: number;
    dedupe?: boolean;
}

interface Response<T = any> {
    code: number;
    data: T;
    message: string;
}

export interface RequestError {
    message: string;
    statusCode?: number;
    raw?: any;
}

const DEFAULT_TIMEOUT = 12000;
const pendingRequests = new Map<string, Promise<any>>();

function stableStringify(value: any): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function isSessionStorageKey(key: string, openid: string) {
    if (key.startsWith('exam_result_')) {
        return true;
    }

    if (!openid) {
        return false;
    }

    return key === `local_avatar_${openid}`
        || key === `pending_exam_progress_keys_${openid}`
        || key.startsWith(`exam_progress_${openid}_`);
}

export function clearLocalSession() {
    try {
        const openid = wx.getStorageSync('wechat_openid') || '';

        wx.removeStorageSync('wechat_openid');
        wx.removeStorageSync('token');
        wx.removeStorageSync('user_profile');

        const storageInfo = wx.getStorageInfoSync();
        storageInfo.keys
            .filter((key) => isSessionStorageKey(key, openid))
            .forEach((key) => wx.removeStorageSync(key));
    } catch (error) {
        console.error('clearLocalSession failed', error);
    }
}

export function clearLocalAuth() {
    try {
        wx.removeStorageSync('wechat_openid');
        wx.removeStorageSync('token');
        wx.removeStorageSync('user_profile');
    } catch (error) {
        console.error('clearLocalAuth failed', error);
    }
}

function getPayloadMessage(payload: any) {
    if (!payload) {
        return '';
    }

    if (typeof payload === 'string') {
        return payload;
    }

    return payload.message || payload.errMsg || '';
}

function shouldClearSession(statusCode: number, message: string) {
    if (statusCode === 401) {
        return true;
    }

    if (statusCode !== 403) {
        return false;
    }

    return /token|登录|未登录|认证/i.test(message || '');
}

function getStatusFallbackMessage(statusCode: number) {
    if (statusCode === 401) {
        return '登录状态已失效，请重新登录';
    }

    if (statusCode === 403) {
        return '暂无权限执行该操作';
    }

    return `服务异常 (${statusCode})`;
}

export const request = <T = any>(options: RequestOptions): Promise<T> => {
    const showError = options.showError !== false;
    const method = options.method || 'GET';
    const token = wx.getStorageSync('token') || '';
    let requestFingerprint = '';
    try {
        requestFingerprint = stableStringify(options.data);
    } catch {
        requestFingerprint = String(options.data === null || options.data === undefined ? '' : options.data);
    }
    const requestKey = method === 'GET' && options.dedupe !== false
        ? `${method}:${options.url}:${String(token).slice(-16)}:${requestFingerprint}`
        : '';
    if (requestKey && pendingRequests.has(requestKey)) {
        return pendingRequests.get(requestKey) as Promise<T>;
    }

    const requestPromise = new Promise<T>((resolve, reject) => {
        const header: Record<string, any> = {
            'Content-Type': 'application/json',
            ...options.header,
        };

        if (token) {
            header.Authorization = `Bearer ${token}`;
        }

        wx.request({
            url: `${BASE_URL}${options.url}`,
            method,
            data: options.data,
            header,
            timeout: options.timeout || DEFAULT_TIMEOUT,
            success: (res: any) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const data = res.data as Response<T>;
                    if (data.code === 0) {
                        resolve(data.data);
                        return;
                    }

                    const err: RequestError = {
                        message: data.message || '请求失败',
                        statusCode: res.statusCode,
                        raw: data,
                    };
                    if (showError) {
                        wx.showToast({ title: err.message, icon: 'none' });
                    }
                    reject(err);
                    return;
                }

                const payloadMessage = getPayloadMessage(res.data);
                if (shouldClearSession(res.statusCode, payloadMessage)) {
                    clearLocalAuth();
                }

                const err: RequestError = {
                    message: payloadMessage
                        || getStatusFallbackMessage(res.statusCode),
                    statusCode: res.statusCode,
                    raw: res.data || res,
                };
                if (showError) {
                    wx.showToast({ title: err.message, icon: 'none' });
                }
                reject(err);
            },
            fail: (err) => {
                const requestErr: RequestError = {
                    message: '网络错误，请检查网络连接',
                    raw: err,
                };
                if (showError) {
                    wx.showToast({ title: requestErr.message, icon: 'none' });
                }
                reject(requestErr);
            },
        });
    }).finally(() => {
        if (requestKey) pendingRequests.delete(requestKey);
    });

    if (requestKey) pendingRequests.set(requestKey, requestPromise);
    return requestPromise;
};
