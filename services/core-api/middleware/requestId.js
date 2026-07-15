const crypto = require('crypto');

/**
 * 全局请求 ID 中间件
 * 为每个请求生成唯一 ID，用于全链路日志追踪。
 * 如果上游（Nginx / CDN）已附带 X-Request-Id，则直接复用。
 */
const requestId = (req, _res, next) => {
    req.id = req.headers['x-request-id'] || `req-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    next();
};

module.exports = requestId;
