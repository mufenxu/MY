const crypto = require('crypto');

const HEADER_NAME = 'x-my-platform-sso';
const TOKEN_ISSUER = 'my-platform-gateway';

function verifyPlatformSso(req, audience = 'iot', now = Date.now()) {
  const publicKey = process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY || '';
  const token = req && req.headers ? req.headers[HEADER_NAME] : '';
  if (!publicKey || !token) return null;

  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return null;

  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64url'),
      format: 'der',
      type: 'spki'
    });
    if (!crypto.verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url'))) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(now / 1000);
    const requestUrl = new URL(req.originalUrl || req.url || '/', 'http://platform.internal');
    const pathname = `${requestUrl.pathname}${requestUrl.search}`;
    if (
      claims.v !== 1
      || claims.iss !== TOKEN_ISSUER
      || claims.aud !== audience
      || claims.role !== 'platform_admin'
      || !claims.sub
      || !claims.csrf
      || claims.m !== String(req.method || 'GET').toUpperCase()
      || claims.p !== pathname
      || !Number.isFinite(claims.iat)
      || !Number.isFinite(claims.exp)
      || claims.iat > nowSeconds + 5
      || claims.exp <= nowSeconds - 5
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

module.exports = { HEADER_NAME, verifyPlatformSso };
