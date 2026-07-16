import crypto from 'node:crypto';

export const PLATFORM_SSO_HEADER = 'x-my-platform-sso';
const TOKEN_ISSUER = 'my-platform-gateway';

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

export function validateInternalKeyPair(privateKey, publicKey) {
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

export function issueInternalIdentity({
  audience,
  session,
  privateKey,
  method = 'GET',
  pathname = '/',
  now = Date.now(),
  ttlSeconds = 15,
}) {
  if (!audience || !session?.sub || !session?.nonce || !privateKey) {
    throw new Error('无法签发内部身份：参数不完整。');
  }

  const issuedAt = Math.floor(now / 1000);
  const csrf = crypto.createHash('sha256')
    .update(`csrf:${audience}:${session.nonce}`)
    .digest('base64url');
  const payload = encodeJson({
    v: 1,
    iss: TOKEN_ISSUER,
    aud: audience,
    sub: session.sub,
    role: 'platform_admin',
    csrf,
    m: String(method).toUpperCase(),
    p: String(pathname || '/'),
    session_exp: Number.isFinite(session.exp) ? session.exp : issuedAt + ttlSeconds,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  });
  const signature = crypto.sign(null, Buffer.from(payload), privateKeyFromBase64Url(privateKey));
  return `${payload}.${signature.toString('base64url')}`;
}

export function verifyInternalIdentity(token, {
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
      || claims.role !== 'platform_admin'
      || !claims.csrf
      || claims.m !== String(method).toUpperCase()
      || claims.p !== String(pathname || '/')
      || !Number.isFinite(claims.iat)
      || !Number.isFinite(claims.exp)
      || claims.iat > nowSeconds + clockSkewSeconds
      || claims.exp <= nowSeconds - clockSkewSeconds
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
