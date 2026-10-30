// Lightweight in-memory rate limiter for login and API abuse protection.
const { createErrorPayload } = require('./requestContext');

const rateLimitStore = new Map();
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);
rateLimitCleanupTimer.unref?.();

function createLimiter({ windowMs, max, message, name }) {
  const bucketName = name || `${windowMs}:${max}:${message || ''}`;

  return function limiter(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, record);
    }

    record.count++;

    // 与 express-rate-limit 的 standardHeaders 保持同一套名字（规范 §6）。
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json(
        createErrorPayload(req, 429, message || '请求过于频繁，请稍后再试。', 'RATE_LIMITED'),
      );
    }

    next();
  };
}

module.exports = {
  createLimiter
};
