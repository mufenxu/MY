// Lightweight in-memory rate limiter for login and API abuse protection.
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

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({
        error: message || '请求过于频繁，请稍后再试。'
      });
    }

    next();
  };
}

module.exports = {
  createLimiter
};
