const crypto = require('node:crypto');

const PLATFORM_SSO_HEADER = 'x-my-platform-sso';
const TOKEN_ISSUER = 'my-platform-gateway';
const PLATFORM_ROLES = new Set(['viewer', 'operator', 'super_admin']);
const PLATFORM_ROLE_NAMES = Object.freeze([...PLATFORM_ROLES]);
const SAFE_HTTP_METHODS = Object.freeze(['GET', 'HEAD', 'OPTIONS']);
const SAFE_HTTP_METHOD_SET = new Set(SAFE_HTTP_METHODS);
const SCAN_LOGIN_STATUSES = Object.freeze([
  'waiting',
  'pending',
  'scanned',
  'confirmed',
  'consumed',
  'cancelled',
  'rejected',
  'expired',
]);
const TERMINAL_SCAN_LOGIN_STATUS_SET = new Set(['consumed', 'cancelled', 'rejected', 'expired']);
const SERVICE_AUTH_HEADERS = Object.freeze({
  caller: 'x-my-service-caller',
  nonce: 'x-my-service-nonce',
  signature: 'x-my-service-signature',
  timestamp: 'x-my-service-timestamp',
});
const SERVICE_CALLER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function isPlatformRole(role) {
  return PLATFORM_ROLES.has(String(role || ''));
}

function isSafeHttpMethod(method = 'GET') {
  return SAFE_HTTP_METHOD_SET.has(String(method || 'GET').toUpperCase());
}

function isTerminalScanLoginStatus(status) {
  return TERMINAL_SCAN_LOGIN_STATUS_SET.has(String(status || ''));
}

function isScanLoginSessionExpired(session = {}, {
  now = Date.now(),
  ttlMs = 0,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const expiresAtMs = session.expiresAt
    ? new Date(session.expiresAt).getTime()
    : Number(session.createdAt ?? session.createdTime) + Number(ttlMs || 0);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return true;

  if (session.status !== 'confirmed') return false;
  const tempAuthCodeExpiresAtMs = new Date(session.tempAuthCodeExpiresAt || 0).getTime();
  return !Number.isFinite(tempAuthCodeExpiresAtMs) || tempAuthCodeExpiresAtMs <= nowMs;
}

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

function bodyBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  return Buffer.from(JSON.stringify(body), 'utf8');
}

function serviceRequestPath(value) {
  const requestUrl = new URL(String(value || '/'), 'http://service.internal');
  return `${requestUrl.pathname}${requestUrl.search}`;
}

function serviceRequestPayload({ caller, timestamp, nonce, method, pathname, body }) {
  const bodyDigest = crypto.createHash('sha256').update(bodyBuffer(body)).digest('base64url');
  return [
    'v1',
    String(caller),
    String(timestamp),
    String(nonce),
    String(method || 'GET').toUpperCase(),
    serviceRequestPath(pathname),
    bodyDigest,
  ].join('\n');
}

function issueServiceRequest({
  caller,
  secret,
  method = 'GET',
  pathname = '/',
  body = '',
  now = Date.now(),
  nonce = crypto.randomBytes(18).toString('base64url'),
} = {}) {
  const normalizedCaller = String(caller || '').trim();
  if (!SERVICE_CALLER_PATTERN.test(normalizedCaller) || !secret) {
    throw new Error('Cannot issue an internal service request without a valid caller and secret.');
  }
  const timestamp = Math.floor(Number(now));
  if (!Number.isFinite(timestamp)) throw new Error('Internal service request timestamp is invalid.');
  const normalizedNonce = String(nonce || '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalizedNonce)) {
    throw new Error('Internal service request nonce is invalid.');
  }
  const payload = serviceRequestPayload({
    caller: normalizedCaller,
    timestamp,
    nonce: normalizedNonce,
    method,
    pathname,
    body,
  });
  const signature = crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url');
  return {
    [SERVICE_AUTH_HEADERS.caller]: normalizedCaller,
    [SERVICE_AUTH_HEADERS.timestamp]: String(timestamp),
    [SERVICE_AUTH_HEADERS.nonce]: normalizedNonce,
    [SERVICE_AUTH_HEADERS.signature]: signature,
  };
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function safeSignatureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyServiceRequest({
  headers,
  secret,
  allowedCallers = [],
  method = 'GET',
  pathname = '/',
  body = '',
  now = Date.now(),
  maxAgeMs = 30_000,
  replayGuard = null,
} = {}) {
  if (!secret) return null;
  const caller = headerValue(headers, SERVICE_AUTH_HEADERS.caller).trim();
  const nonce = headerValue(headers, SERVICE_AUTH_HEADERS.nonce);
  const signature = headerValue(headers, SERVICE_AUTH_HEADERS.signature);
  const timestamp = Number.parseInt(headerValue(headers, SERVICE_AUTH_HEADERS.timestamp), 10);
  const callers = allowedCallers instanceof Set
    ? allowedCallers
    : new Set(Array.from(allowedCallers || [], (value) => String(value)));
  const currentTime = Number(now);
  const boundedMaxAge = Math.min(Math.max(Number(maxAgeMs) || 30_000, 1_000), 300_000);
  if (
    !SERVICE_CALLER_PATTERN.test(caller)
    || !callers.has(caller)
    || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
    || !signature
    || !Number.isFinite(timestamp)
    || !Number.isFinite(currentTime)
    || timestamp > currentTime + 5_000
    || currentTime - timestamp > boundedMaxAge
  ) return null;
  const payload = serviceRequestPayload({ caller, timestamp, nonce, method, pathname, body });
  const expected = crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url');
  if (!safeSignatureEqual(signature, expected)) return null;
  const identity = { caller, nonce, timestamp };
  if (typeof replayGuard === 'function' && replayGuard(identity) !== true) return null;
  return identity;
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
  PLATFORM_ROLE_NAMES,
  PLATFORM_SSO_HEADER,
  SAFE_HTTP_METHODS,
  SCAN_LOGIN_STATUSES,
  SERVICE_AUTH_HEADERS,
  TOKEN_ISSUER,
  issueInternalIdentity,
  issueServiceRequest,
  isPlatformRole,
  isScanLoginSessionExpired,
  isSafeHttpMethod,
  isTerminalScanLoginStatus,
  requestPathWithQuery,
  serviceRequestPath,
  validateInternalKeyPair,
  verifyInternalIdentity,
  verifyPlatformSsoRequest,
  verifyServiceRequest,
};
