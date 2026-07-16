/**
 * CORS 白名单管理服务
 * 从数据库动态读取已注册应用的域名作为 CORS 白名单
 * 使用内存缓存避免频繁查库
 */

const AppClient = require('../models/AppClient');
const logger = require('../utils/logger');

// 缓存配置
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存过期

// 缓存数据
let cachedOrigins = null;
let cacheTimestamp = 0;

// 固定白名单（本地开发等，始终允许）
const STATIC_ORIGINS = [
    'https://xcx.pxyb.cn',  // 管理后台自身，始终允许
    'http://xcx.pxyb.cn',   // 兼容非 https 访问
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    ...String(process.env.PLATFORM_PUBLIC_ORIGIN || '')
        .split(',')
        .map(origin => origin.trim().replace(/\/$/, ''))
        .filter(Boolean)
];

/**
 * 从数据库加载允许的域名
 */
async function loadOriginsFromDB() {
    try {
        const apps = await AppClient.find({ status: 'active' }).select('domain appName');
        const origins = [];

        let hasGlobalApp = false;
        for (const app of apps) {
            if (app.domain) {
                // 支持逗号分隔的多个域名
                const domains = app.domain.split(',').map(d => d.trim()).filter(d => d);
                for (const d of domains) {
                    // 规范化域名：转小写并去掉末尾斜杠
                    let cleanDomain = d.toLowerCase().trim().replace(/\/$/, "");

                    if (cleanDomain.startsWith('http')) {
                        origins.push(cleanDomain);
                    } else {
                        // 如果没有协议头，同时加入 http 和 https
                        origins.push(`http://${cleanDomain}`);
                        origins.push(`https://${cleanDomain}`);
                    }
                }
            } else {
                // 存在一个没有域名限制的活跃应用
                hasGlobalApp = true;
            }
        }

        const uniqueOrigins = [...new Set(origins)];
        logger.info(`CORS 白名单加载完成: ${uniqueOrigins.length} 个域名, 全局允许: ${hasGlobalApp}`);

        return {
            origins: uniqueOrigins,
            allowAny: hasGlobalApp
        };
    } catch (error) {
        logger.error('加载 CORS 白名单失败:', error);
        return {
            origins: [],
            allowAny: false
        };
    }
}

/**
 * 获取所有允许的域名（带缓存）
 */
async function getAllowedOrigins() {
    const now = Date.now();

    // 检查缓存是否过期
    if (cachedOrigins && (now - cacheTimestamp) < CACHE_TTL) {
        return cachedOrigins;
    }

    // 刷新缓存
    const result = await loadOriginsFromDB();
    cachedOrigins = result;
    cacheTimestamp = now;

    return cachedOrigins;
}

/**
 * 检查域名是否在白名单中
 * @param {string} origin - 请求的来源域名
 * @returns {Promise<boolean>}
 */
async function isOriginAllowed(origin) {
    // 微信小程序/移动端某些场景下 origin 为 undefined（非浏览器请求），允许通过
    // 但不允许 origin 为字符串 "null"（可以被攻击者伪造）
    if (!origin) {
        logger.debug('CORS: Permitting request with no origin (non-browser)');
        return true;
    }

    if (origin === 'null') {
        logger.warn('CORS: Blocked request with string "null" origin');
        return false;
    }

    // 规范化请求的 origin: 去掉末尾斜杠
    let cleanOrigin = origin.toLowerCase().replace(/\/$/, "");

    // 处理端口
    if (cleanOrigin.startsWith('https://') && cleanOrigin.endsWith(':443')) {
        cleanOrigin = cleanOrigin.replace(':443', '');
    } else if (cleanOrigin.startsWith('http://') && cleanOrigin.endsWith(':80')) {
        cleanOrigin = cleanOrigin.replace(':80', '');
    }

    const allowedConfig = await getAllowedOrigins();
    const origins = Array.isArray(allowedConfig?.origins) ? allowedConfig.origins : [];
    const allowAny = Boolean(allowedConfig?.allowAny);

    // 如果存在不限域名的应用，或者命中了固定白名单
    if (allowAny || STATIC_ORIGINS.some(s => s.toLowerCase() === cleanOrigin)) {
        return true;
    }

    // 1. 精确匹配 (origins 里的数据已经在 load 时转过小写了)
    if (origins.includes(cleanOrigin)) {
        return true;
    }

    logger.warn(`CORS request blocked for origin: ${origin} (Normalized: ${cleanOrigin})`);
    return false;
}

/**
 * 手动刷新缓存（在应用增删改时调用）
 */
async function refreshCache() {
    const result = await loadOriginsFromDB();
    cachedOrigins = result;
    cacheTimestamp = Date.now();
    logger.info('CORS 白名单缓存已刷新');
    return cachedOrigins;
}

/**
 * 获取缓存状态（用于调试）
 */
function getCacheStatus() {
    return {
        cached: cachedOrigins !== null,
        origins: cachedOrigins?.origins,
        allowAny: cachedOrigins?.allowAny,
        age: cachedOrigins ? Date.now() - cacheTimestamp : null,
        ttl: CACHE_TTL
    };
}

module.exports = {
    getAllowedOrigins,
    isOriginAllowed,
    refreshCache,
    getCacheStatus,
    STATIC_ORIGINS
};
