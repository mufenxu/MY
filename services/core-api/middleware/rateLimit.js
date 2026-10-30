const rateLimit = require('express-rate-limit');
const { fail } = require('../utils/respond');

/**
 * 所有限流器共用的超限响应。
 *
 * 不要改回 `message: '...'`：express-rate-limit v8 在只给字符串时会走 res.send(string)，
 * Content-Type 变成 text/html，前端 response.json() 直接抛 SyntaxError，
 * 用户看到的是“网络错误”而不是“请求过于频繁”。
 */
function createRateLimitedHandler(message) {
    return (req, res, _next, options) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return fail(res, {
            status: options.statusCode || 429,
            code: 'RATE_LIMITED',
            message,
            retryAfter,
            requestId: req.id,
        });
    };
}

// 全局兜底（按 IP）：15 分钟 1000 次
exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitedHandler('Too many requests from this IP, please try again later.'),
});

// 登录（按 IP）：每小时 15 次失败尝试
exports.authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitedHandler('登录尝试过于频繁，请一小时后再试'),
});

// 扫码登录（按 IP）：15 分钟 200 次
exports.scanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitedHandler('请求过于频繁，请稍后再试'),
});

// Token 交换（按 IP）：15 分钟 30 次，防止暴力枚举 tempAuthCode
exports.exchangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitedHandler('操作过于频繁，请稍后再试'),
});

// 公开查询（按 IP）：每分钟 30 次
exports.publicSearchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitedHandler('查询频率过快，请稍后再试'),
});

// 公开同步刷新（按 IP）：每 10 分钟 5 次，保护上游额度
exports.publicRefreshLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createRateLimitedHandler('您的同步操作过于频繁，请 10 分钟后再试（每个订单每10分钟限5次）'),
});
