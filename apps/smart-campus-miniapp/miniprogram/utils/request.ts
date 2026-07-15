import { ensureAuthorized, getToken, clearToken } from './auth'
import { API_PREFIX } from './config'
import * as logger from './logger'

const REQUEST_TIMEOUT = 10000
const SLOW_REQUEST_THRESHOLD = 3000
const RATE_LIMIT_MODAL_COOLDOWN = 3000
const NETWORK_TOAST_COOLDOWN = 3000
let lastRateLimitModalAt = 0
let lastNetworkToastAt = 0

interface RequestOptions {
    timeout?: number
    showNetworkToast?: boolean
    showRateLimitModal?: boolean
    slowThreshold?: number
}

// 存储进行中的请求 Promise，用于去重
const pendingRequests = new Map<string, Promise<any>>()

function stableStringify(value: any): string {
    if (value === null || value === undefined) return String(value)
    if (typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`
    }
    const keys = Object.keys(value).sort()
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    return `{${pairs.join(',')}}`
}

function buildRequestUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url
    return `${API_PREFIX}${url.startsWith('/') ? url : `/${url}`}`
}

function createRequestId(): string {
    return `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function showNetworkToast(message: string): void {
    const now = Date.now()
    if (now - lastNetworkToastAt <= NETWORK_TOAST_COOLDOWN) return
    lastNetworkToastAt = now
    wx.showToast({
        title: message,
        icon: 'none',
        duration: 2000,
    })
}

function getResponseMessage(data: any, fallback: string): string {
    if (!data) return fallback
    if (typeof data === 'string') return data
    return data.message || data.error || fallback
}

function logIfSlow(url: string, method: string, startedAt: number, requestId: string, threshold: number): void {
    const elapsed = Date.now() - startedAt
    if (elapsed < threshold) return

    logger.warn('Slow request detected', {
        requestId,
        method,
        url,
        elapsed,
    }, 'Request')
}

const request = <T = any>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data: any = {}, isRetry: boolean = false, options: RequestOptions = {}): Promise<T> => {
    // 生成请求唯一标识 (仅对 GET 请求去重，因为 POST/PUT 可能包含副作用)
    let requestFingerprint = ''
    try {
        requestFingerprint = stableStringify(data)
    } catch (err) {
        requestFingerprint = JSON.stringify(data || {})
    }
    const shouldDedup = method === 'GET' && !isRetry
    const requestKey = shouldDedup ? `${method}:${url}:${requestFingerprint}` : null

    if (requestKey && pendingRequests.has(requestKey)) {
        // console.log('[Request] Deduplication hit:', requestKey)
        return pendingRequests.get(requestKey) as Promise<T>
    }

    const requestPromise = new Promise<T>((resolve, reject) => {
        const requestId = createRequestId()
        const startedAt = Date.now()
        const requestUrl = buildRequestUrl(url)
        const slowThreshold = options.slowThreshold || SLOW_REQUEST_THRESHOLD

        wx.request({
            url: requestUrl,
            method: method,
            data: data,
            timeout: options.timeout || REQUEST_TIMEOUT,
            header: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
                'X-Request-Id': requestId,
                'X-Client-Type': 'wechat-miniprogram',
            },
            success: async (res) => {
                logIfSlow(url, method, startedAt, requestId, slowThreshold)

                // 拦截 401 Token 过期
                if (res.statusCode === 401 && !isRetry && !url.includes('/auth/wechat-login')) {
                    try {
                        // 清除失效的旧 Token，确保调用登录重新获取
                        clearToken();
                        // 尝试重新登录刷新 Token
                        await ensureAuthorized()
                        // 登录成功后重试原请求
                        const result = await request<T>(url, method, data, true, options)
                        resolve(result)
                    } catch (err) {
                        // 登录失败或重试失败，抛出原 401 错误或新错误
                        logger.warn('Request unauthorized after retry failed', {
                            requestId,
                            method,
                            url,
                            statusCode: res.statusCode,
                        }, 'Request')
                        reject(res.data || res)
                    }
                    return
                }

                // 拦截 429 频率限制
                if (res.statusCode === 429) {
                    const msg = getResponseMessage(res.data, '请求过于频繁，请稍后再试');
                    const now = Date.now()
                    if (options.showRateLimitModal !== false && now - lastRateLimitModalAt > RATE_LIMIT_MODAL_COOLDOWN) {
                        lastRateLimitModalAt = now
                        wx.showModal({
                        title: '系统提示',
                        content: msg,
                        showCancel: false
                        });
                    }
                    reject(res.data || res);
                    return;
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res.data as T);
                } else {
                    logger.warn('Request failed with non-2xx status', {
                        requestId,
                        method,
                        url,
                        statusCode: res.statusCode,
                        message: getResponseMessage(res.data, '请求失败'),
                    }, 'Request')
                    reject(res.data || res);
                }
            },
            fail: (err) => {
                logIfSlow(url, method, startedAt, requestId, slowThreshold)
                logger.error('Request network failure', {
                    requestId,
                    method,
                    url,
                    errMsg: err.errMsg,
                }, 'Request')

                if (options.showNetworkToast !== false) {
                    const message = err.errMsg && err.errMsg.includes('timeout')
                        ? '请求超时，请稍后再试'
                        : '网络连接异常，请检查后重试'
                    showNetworkToast(message)
                }
                reject(err);
            }
        });
    }).finally(() => {
        // 请求完成后（无论是成功还是失败），清理 pending 状态
        if (requestKey) {
            pendingRequests.delete(requestKey)
        }
    })

    if (requestKey) {
        pendingRequests.set(requestKey, requestPromise)
    }

    return requestPromise
};

export default request;
