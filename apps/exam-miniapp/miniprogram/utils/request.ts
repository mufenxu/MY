import { runtimeConfig } from '../config/runtime';

const BASE_URL = runtimeConfig.baseUrl.replace(/\/$/, '');

interface RequestOptions {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: any;
    header?: Record<string, any>;
    showError?: boolean;
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

    return new Promise((resolve, reject) => {
        const token = wx.getStorageSync('token');
        const header: Record<string, any> = {
            'Content-Type': 'application/json',
            ...options.header,
        };

        if (token) {
            header.Authorization = `Bearer ${token}`;
        }

        wx.request({
            url: `${BASE_URL}${options.url}`,
            method: options.method || 'GET',
            data: options.data,
            header,
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
                    clearLocalSession();
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
    });
};
