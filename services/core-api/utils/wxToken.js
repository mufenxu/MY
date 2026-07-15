const axios = require('axios');
const logger = require('./logger');

const WX_APP_ID = process.env.WX_APP_ID;
const WX_APP_SECRET = process.env.WX_APP_SECRET;

// In-memory cache
let cachedToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

/**
 * 获取微信小程序全局 access_token
 * - 自动缓存，提前 5 分钟刷新
 * - 并发安全：多个请求同时到来时只发起一次 HTTP 请求
 * @returns {Promise<string>} access_token
 */
async function getAccessToken() {
    const now = Date.now();

    // 有效缓存直接返回
    if (cachedToken && now < tokenExpiry) {
        return cachedToken;
    }

    // 并发安全：复用进行中的请求
    if (tokenPromise) {
        return tokenPromise;
    }

    tokenPromise = (async () => {
        try {
            if (!WX_APP_ID || !WX_APP_SECRET) {
                throw new Error('缺少 WX_APP_ID 或 WX_APP_SECRET 环境变量');
            }

            const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APP_ID}&secret=${WX_APP_SECRET}`;
            const res = await axios.get(url, { timeout: 10000 });

            if (res.data.errcode) {
                throw new Error(`微信 API 错误: ${res.data.errcode} - ${res.data.errmsg}`);
            }

            cachedToken = res.data.access_token;
            // 提前 5 分钟刷新（微信 token 有效期 7200 秒）
            tokenExpiry = now + (res.data.expires_in - 300) * 1000;

            logger.info('微信 access_token 获取成功');
            return cachedToken;
        } catch (err) {
            logger.error('获取微信 access_token 失败:', err.message);
            throw err;
        } finally {
            tokenPromise = null;
        }
    })();

    return tokenPromise;
}

/**
 * 主动清除缓存（用于 token 失效时强制刷新）
 */
function invalidateCache() {
    cachedToken = null;
    tokenExpiry = 0;
}

module.exports = { getAccessToken, invalidateCache };
