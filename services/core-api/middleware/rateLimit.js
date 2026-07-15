const rateLimit = require('express-rate-limit');

exports.globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
});

exports.authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15, // 生产环境：每 IP 每小时 15 次登录尝试
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            success: false,
            error: options.message,
            retryAfter: Math.ceil(options.windowMs / 1000),
        });
    },
    message: '登录尝试过于频繁，请一小时后再试'
});

// 扫码登录接口限流（创建二维码 + 轮询状态）
exports.scanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: '请求过于频繁，请稍后再试'
});

// Token 交换接口限流（防止暴力枚举 tempAuthCode）
exports.exchangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: '操作过于频繁，请稍后再试'
});

// 公开查询接口限流 (每分钟 30 次)
exports.publicSearchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({ code: options.statusCode, message: options.message });
    },
    message: '查询频率过快，请稍后再试'
});

// 公开同步刷新接口限流 (每 10 分钟 5 次，保护上游额度)
exports.publicRefreshLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({ code: options.statusCode, message: options.message });
    },
    message: '您的同步操作过于频繁，请 10 分钟后再试（每个订单每10分钟限5次）'
});
