import crypto from 'node:crypto';

const OAUTH_ERROR_CODES = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'server_error',
]);

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function privateKeyObject(value) {
  return crypto.createPrivateKey({
    key: Buffer.from(String(value || ''), 'base64url'),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyObject(value) {
  return crypto.createPublicKey({
    key: Buffer.from(String(value || ''), 'base64url'),
    format: 'der',
    type: 'spki',
  });
}

function safeStringEqual(left, right) {
  const actual = Buffer.from(String(left || ''));
  const expected = Buffer.from(String(right || ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier || '')).digest('base64url');
}

export function verifyPkceChallenge(verifier, challenge) {
  const normalized = String(verifier || '');
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(normalized)) return false;
  return safeStringEqual(pkceChallenge(normalized), challenge);
}

export function oauthError(code, description) {
  if (!OAUTH_ERROR_CODES.has(code)) {
    return { error: 'server_error', error_description: '身份服务暂时不可用。' };
  }
  return {
    error: code,
    error_description: String(description || '').slice(0, 300),
  };
}

export function createExternalIdentityService({
  issuer,
  privateKey,
  publicKey,
  keyId = 'external-auth',
  now = () => Date.now(),
  tokenTtlSeconds = 300,
} = {}) {
  const normalizedIssuer = String(issuer || '').replace(/\/+$/, '');
  if (!normalizedIssuer) throw new TypeError('External identity issuer is required.');
  const signingKey = privateKeyObject(privateKey);
  const verificationKey = publicKeyObject(publicKey);
  const publicJwk = {
    ...verificationKey.export({ format: 'jwk' }),
    kid: String(keyId || 'external-auth'),
    use: 'sig',
    alg: 'EdDSA',
  };
  const ttl = Math.min(Math.max(Number(tokenTtlSeconds) || 300, 60), 3600);

  function signToken(claims) {
    const header = encodeJson({ alg: 'EdDSA', kid: publicJwk.kid, typ: 'JWT' });
    const payload = encodeJson(claims);
    const signingInput = `${header}.${payload}`;
    const signature = crypto.sign(null, Buffer.from(signingInput), signingKey).toString('base64url');
    return `${signingInput}.${signature}`;
  }

  function verifyToken(token, { audience, type } = {}) {
    const [headerValue, payloadValue, signatureValue, extra] = String(token || '').split('.');
    if (!headerValue || !payloadValue || !signatureValue || extra) return null;
    try {
      const header = JSON.parse(Buffer.from(headerValue, 'base64url').toString('utf8'));
      if (header.alg !== 'EdDSA' || header.kid !== publicJwk.kid) return null;
      const valid = crypto.verify(
        null,
        Buffer.from(`${headerValue}.${payloadValue}`),
        verificationKey,
        Buffer.from(signatureValue, 'base64url'),
      );
      if (!valid) return null;
      const claims = JSON.parse(Buffer.from(payloadValue, 'base64url').toString('utf8'));
      const nowSeconds = Math.floor(now() / 1000);
      if (claims.iss !== normalizedIssuer || !Number.isFinite(claims.exp) || claims.exp <= nowSeconds) return null;
      if (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60) return null;
      if (audience && claims.aud !== audience) return null;
      if (type && claims.token_use !== type) return null;
      return claims;
    } catch {
      return null;
    }
  }

  return {
    discovery() {
      return {
        issuer: normalizedIssuer,
        authorization_endpoint: `${normalizedIssuer}/oauth/authorize`,
        token_endpoint: `${normalizedIssuer}/oauth/token`,
        userinfo_endpoint: `${normalizedIssuer}/oauth/userinfo`,
        jwks_uri: `${normalizedIssuer}/oauth/jwks.json`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['EdDSA'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile', 'roles'],
        claims_supported: ['sub', 'preferred_username', 'role'],
      };
    },

    jwks() {
      return { keys: [{ ...publicJwk }] };
    },

    issueTokens({ clientId, username, role = 'viewer', scope = 'openid', nonce = '' }) {
      const issuedAt = Math.floor(now() / 1000);
      const baseClaims = {
        iss: normalizedIssuer,
        aud: String(clientId || ''),
        sub: String(username || ''),
        preferred_username: String(username || ''),
        role: String(role || 'viewer'),
        iat: issuedAt,
        exp: issuedAt + ttl,
        jti: crypto.randomUUID(),
      };
      const accessToken = signToken({
        ...baseClaims,
        token_use: 'access',
        scope: String(scope || 'openid'),
      });
      const idToken = signToken({
        ...baseClaims,
        token_use: 'id',
        ...(nonce ? { nonce: String(nonce).slice(0, 256) } : {}),
      });
      return {
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: ttl,
        scope: String(scope || 'openid'),
      };
    },

    verifyToken,
  };
}
