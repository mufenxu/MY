const crypto = require('node:crypto');

const PLATFORM_SSO_HEADER = 'x-my-platform-sso';
const TOKEN_ISSUER = 'my-platform-gateway';
const PLATFORM_ROLES = new Set(['viewer', 'operator', 'super_admin']);

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function privateKeyFromBase64Url(value) {
  return crypto.createPrivateKey({
    key: Buffer.from(String(value || ''), 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyFromBase64Url(value) {
  return crypto.createPublicKey({
    key: Buffer.from(String(value || ''), 'base64url'),
    format: 'der',
    type: 'spki',
  });
}

function validateInternalKeyPair(privateKey, publicKey) {
  try {
    const privateObject = privateKeyFromBase64Url(privateKey);
    const publicObject = publicKeyFromBase64Url(publicKey);
    const probe = Buffer.from('my-platform-key-validation');
    return privateObject.asymmetricKeyType === 'ed25519'
      && publicObject.asymmetricKeyType === 'ed25519'
      && crypto.verify(null, probe, publicObject, crypto.sign(null, probe, privateObject));
  } catch {
    return false;
  }
}

function issueInternalIdentity({
  audience,
  session,
  privateKey,
  method = 'GET',
  pathname = '/',
  now = Date.now(),
  ttlSeconds = 15,
}) {
  if (!audience || !session?.sub || !session?.nonce || !PLATFORM_ROLES.has(session?.role) || !privateKey) {
    throw new Error('无法签发内部身份：参数不完整。');
  }

  const issuedAt = Math.floor(now / 1000);
  const sessionExpiresAt = Number.isFinite(session.exp) ? session.exp : issuedAt + ttlSeconds;
  if (sessionExpiresAt <= issuedAt) throw new Error('Cannot issue an internal identity for an expired session.');
  const ticketExpiresAt = Math.min(issuedAt + ttlSeconds, sessionExpiresAt);
  const reauthenticatedUntil = Number.isFinite(session.reauthenticatedUntil)
    ? Math.min(session.reauthenticatedUntil, sessionExpiresAt)
    : 0;
  const csrf = crypto.createHash('sha256')
    .update(`csrf:${audience}:${session.nonce}`)
    .digest('base64url');
  const payload = encodeJson({
    v: 1,
    iss: TOKEN_ISSUER,
    aud: audience,
    sub: session.sub,
    role: session.role,
    csrf,
    m: String(method).toUpperCase(),
    p: String(pathname || '/'),
    session_exp: sessionExpiresAt,
    reauth_exp: reauthenticatedUntil > issuedAt ? reauthenticatedUntil : 0,
    iat: issuedAt,
    exp: ticketExpiresAt,
  });
  const signature = crypto.sign(null, Buffer.from(payload), privateKeyFromBase64Url(privateKey));
  return `${payload}.${signature.toString('base64url')}`;
}

function verifyInternalIdentity(token, {
  audience,
  publicKey,
  method = 'GET',
  pathname = '/',
  now = Date.now(),
  clockSkewSeconds = 5,
} = {}) {
  if (!token || !audience || !publicKey) return null;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return null;

  try {
    const valid = crypto.verify(
      null,
      Buffer.from(payload),
      publicKeyFromBase64Url(publicKey),
      Buffer.from(signature, 'base64url'),
    );
    if (!valid) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(now / 1000);
    if (
      claims.v !== 1
      || claims.iss !== TOKEN_ISSUER
      || claims.aud !== audience
      || !claims.sub
      || !PLATFORM_ROLES.has(claims.role)
      || !claims.csrf
      || claims.m !== String(method).toUpperCase()
      || claims.p !== String(pathname || '/')
      || !Number.isFinite(claims.iat)
      || !Number.isFinite(claims.exp)
      || !Number.isFinite(claims.session_exp)
      || !Number.isFinite(claims.reauth_exp)
      || claims.exp > claims.session_exp
      || claims.reauth_exp > claims.session_exp
      || claims.iat > nowSeconds + clockSkewSeconds
      || claims.exp <= nowSeconds - clockSkewSeconds
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

function requestPathWithQuery(req) {
  const requestUrl = new URL(req?.originalUrl || req?.url || '/', 'http://platform.internal');
  return `${requestUrl.pathname}${requestUrl.search}`;
}

function verifyPlatformSsoRequest(req, {
  audience,
  publicKey = process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY || '',
  now = Date.now(),
  clockSkewSeconds = 5,
  headerName = PLATFORM_SSO_HEADER,
} = {}) {
  const token = req?.headers?.[headerName];
  return verifyInternalIdentity(token, {
    audience,
    publicKey,
    method: req?.method || 'GET',
    pathname: requestPathWithQuery(req),
    now,
    clockSkewSeconds,
  });
}

module.exports = {
  HEADER_NAME: PLATFORM_SSO_HEADER,
  PLATFORM_SSO_HEADER,
  TOKEN_ISSUER,
  issueInternalIdentity,
  requestPathWithQuery,
  validateInternalKeyPair,
  verifyInternalIdentity,
  verifyPlatformSsoRequest,
};
