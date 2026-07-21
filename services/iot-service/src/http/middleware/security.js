const { isSafeHttpMethod } = require('@my-platform/platform-auth');

function parseTrustProxy(value) {
  if (value == null || String(value).trim() === '') {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return 1;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : String(value).trim();
}

function getConfiguredPublicOrigins() {
  return String(process.env.PUBLIC_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try { return new URL(value).origin; } catch { return ''; }
    })
    .filter(Boolean);
}

function getRequestHostOrigin(req) {
  const trustProxy = Boolean(req.app && req.app.get('trust proxy'));
  const forwardedProtocol = trustProxy ? getFirstHeader(req.headers['x-forwarded-proto']) : '';
  const forwardedHost = trustProxy ? getFirstHeader(req.headers['x-forwarded-host']) : '';
  const protocol = forwardedProtocol || req.protocol || (req.socket.encrypted ? 'https' : 'http');
  const host = forwardedHost || req.headers.host;

  return host ? `${protocol}://${host}` : null;
}

function getFirstHeader(value) {
  if (Array.isArray(value)) {
    return getFirstHeader(value[0]);
  }

  if (value == null) {
    return '';
  }

  return String(value).split(',')[0].trim();
}

function getRequestOrigin(req) {
  if (req.headers.origin) {
    try {
      return new URL(req.headers.origin).origin;
    } catch (error) {
      return 'invalid-origin';
    }
  }

  if (req.headers.referer) {
    try {
      return new URL(req.headers.referer).origin;
    } catch (error) {
      return 'invalid-origin';
    }
  }

  return null;
}

function hasBearerAuth(req) {
  return String(req.headers.authorization || '').startsWith('Bearer ');
}

function requireSameOriginSessionWrite(req, res, next) {
  if (isSafeHttpMethod(req.method) || hasBearerAuth(req)) {
    return next();
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    return next();
  }

  const expectedOrigins = new Set([
    ...getConfiguredPublicOrigins(),
    getRequestHostOrigin(req)
  ].filter(Boolean));
  if (expectedOrigins.has(origin)) {
    return next();
  }

  return res.status(403).json({
    error: '跨站请求已被拒绝。'
  });
}

function isAllowedRealtimeOrigin(req) {
  const origin = getRequestOrigin(req);
  if (!origin) return false;
  const expectedOrigins = new Set([
    ...getConfiguredPublicOrigins(),
    getRequestHostOrigin(req)
  ].filter(Boolean));
  return expectedOrigins.has(origin);
}

function setSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self'; " +
    "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  );
  next();
}

module.exports = {
  isAllowedRealtimeOrigin,
  parseTrustProxy,
  requireSameOriginSessionWrite,
  setSecurityHeaders
};
