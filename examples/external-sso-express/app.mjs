import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const config = loadConfig(process.env);
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(session({
  name: 'external_project_session',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

let discoveryCache;
let jwksCache;

class OidcTokenError extends Error {
  constructor(code, message, statusCode, retryAfter = '') {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.type('html').send('<p>尚未登录。<a href="/auth/my/start">使用 MY 登录</a></p>');
  }
  return res.type('html').send(
    `<p>已登录：${escapeHtml(req.session.user.username)} (${escapeHtml(req.session.user.role)})</p>`
      + '<form method="post" action="/logout"><button type="submit">退出本项目</button></form>',
  );
});

app.get('/auth/my/start', async (req, res, next) => {
  try {
    const discovery = await getDiscovery();
    const state = randomToken(32);
    const nonce = randomToken(32);
    const verifier = randomToken(64);
    req.session.myOauth = {
      state,
      nonce,
      verifier,
      returnTo: safeReturnTo(req.query.returnTo),
      createdAt: Date.now(),
    };
    await saveSession(req);

    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'openid profile roles',
      state,
      nonce,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
    }).toString();
    return res.redirect(303, authorizeUrl.toString());
  } catch (error) {
    next(error);
    return undefined;
  }
});

app.get('/auth/my/callback', async (req, res, next) => {
  const pending = req.session.myOauth;
  delete req.session.myOauth;
  try {
    if (req.query.error) {
      throw new Error(`MY authorization failed: ${String(req.query.error)}`);
    }
    if (!pending || Date.now() - pending.createdAt > 5 * 60 * 1000) {
      throw new Error('Login state is missing or expired.');
    }
    if (!safeEqual(req.query.state, pending.state) || typeof req.query.code !== 'string') {
      throw new Error('OAuth state or authorization code is invalid.');
    }

    const discovery = await getDiscovery();
    const tokens = await exchangeCode(discovery, req.query.code, pending.verifier);
    const claims = await verifyIdToken(discovery, tokens.id_token, pending.nonce);
    const user = {
      id: String(claims.sub),
      username: String(claims.preferred_username || claims.sub),
      role: mapRole(claims.role),
    };
    const returnTo = pending.returnTo;

    await regenerateSession(req);
    req.session.user = user;
    await saveSession(req);
    return res.redirect(303, returnTo);
  } catch (error) {
    next(error);
    return undefined;
  }
});

app.post('/logout', async (req, res, next) => {
  try {
    await destroySession(req);
    res.clearCookie('external_project_session', {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      path: '/',
    });
    return res.redirect(303, '/');
  } catch (error) {
    next(error);
    return undefined;
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((error, _req, res, _next) => {
  const errorCode = error instanceof OidcTokenError ? error.code : 'unexpected_error';
  console.error(`External SSO authentication failed: ${errorCode}`);
  if (error instanceof OidcTokenError) {
    if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
    return res.status(error.statusCode).type('html').send(`<p>${escapeHtml(error.message)}</p>`);
  }
  res.status(500).type('html').send('<p>登录暂时失败，请返回后重新发起登录。</p>');
  return undefined;
});

app.listen(config.port, () => {
  console.log(`External SSO example listening on ${config.appOrigin}`);
});

async function getDiscovery() {
  if (discoveryCache?.expiresAt > Date.now()) return discoveryCache.value;
  const response = await fetch(`${config.issuer}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}.`);
  const value = await response.json();
  if (value.issuer !== config.issuer) throw new Error('OIDC discovery issuer mismatch.');
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (typeof value[field] !== 'string' || new URL(value[field]).origin !== new URL(config.issuer).origin) {
      throw new Error(`OIDC discovery ${field} is invalid.`);
    }
  }
  discoveryCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
  return value;
}

async function exchangeCode(discovery, code, verifier) {
  const basic = Buffer.from(
    `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
    'utf8',
  ).toString('base64');
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw mapTokenEndpointError(response, body);
  if (typeof body.id_token !== 'string') {
    throw new OidcTokenError('token_response_invalid', 'MY Token 响应无效，请重新登录。', 502);
  }
  return body;
}

function mapTokenEndpointError(response, body) {
  const code = typeof body?.error === 'string' ? body.error : '';
  if (code === 'temporarily_unavailable' && [429, 503].includes(response.status)) {
    return new OidcTokenError(
      code,
      'MY 认证服务请求过于频繁，请稍后重新登录。',
      503,
      safeRetryAfter(response.headers.get('retry-after')),
    );
  }
  if (code === 'invalid_grant' && response.status === 400) {
    return new OidcTokenError(code, '登录授权已失效，请重新登录。', 400);
  }
  if (code === 'invalid_client' && [400, 401].includes(response.status)) {
    return new OidcTokenError(code, 'MY OIDC 客户端配置无效，请联系管理员。', 503);
  }
  return new OidcTokenError('token_exchange_failed', 'MY Token 兑换失败，请重新登录。', 502);
}

function safeRetryAfter(value) {
  const candidate = String(value || '').trim();
  if (!/^\d{1,4}$/.test(candidate)) return '';
  const seconds = Number(candidate);
  return seconds >= 1 && seconds <= 3600 ? String(seconds) : '';
}

async function verifyIdToken(discovery, token, expectedNonce) {
  if (!jwksCache || jwksCache.uri !== discovery.jwks_uri) {
    jwksCache = {
      uri: discovery.jwks_uri,
      resolver: createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 5_000 }),
    };
  }
  const { payload, protectedHeader } = await jwtVerify(token, jwksCache.resolver, {
    issuer: config.issuer,
    audience: config.clientId,
    algorithms: ['EdDSA'],
  });
  if (protectedHeader.alg !== 'EdDSA' || payload.token_use !== 'id') {
    throw new Error('ID Token type is invalid.');
  }
  if (!safeEqual(payload.nonce, expectedNonce)) throw new Error('ID Token nonce mismatch.');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('ID Token subject is missing.');
  return payload;
}

function loadConfig(env) {
  const production = env.NODE_ENV === 'production';
  const issuer = normalizedOrigin(required(env.MY_ISSUER, 'MY_ISSUER'));
  const appOrigin = normalizedOrigin(required(env.APP_ORIGIN, 'APP_ORIGIN'));
  const redirectUri = new URL(required(env.MY_REDIRECT_URI, 'MY_REDIRECT_URI'));
  if (redirectUri.origin !== appOrigin || redirectUri.pathname !== '/auth/my/callback') {
    throw new Error('MY_REDIRECT_URI must be APP_ORIGIN/auth/my/callback.');
  }
  if (production && (new URL(issuer).protocol !== 'https:' || new URL(appOrigin).protocol !== 'https:')) {
    throw new Error('Production issuer and application origin must use HTTPS.');
  }
  const sessionSecret = required(env.SESSION_SECRET, 'SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  return {
    production,
    issuer,
    appOrigin,
    redirectUri: redirectUri.toString(),
    clientId: required(env.MY_CLIENT_ID, 'MY_CLIENT_ID'),
    clientSecret: required(env.MY_CLIENT_SECRET, 'MY_CLIENT_SECRET'),
    sessionSecret,
    trustProxy: production ? 1 : false,
    port: Number(env.PORT) || 3000,
  };
}

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function normalizedOrigin(value) {
  const url = new URL(value);
  if (url.pathname !== '/' || url.search || url.hash) throw new Error(`${value} must be an origin without a path.`);
  return url.origin;
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function safeReturnTo(value) {
  const target = typeof value === 'string' ? value : '/';
  return /^\/(?!\/)[^\\\r\n]*$/.test(target) ? target : '/';
}

function mapRole(value) {
  const role = String(value || '');
  if (!['viewer', 'operator', 'super_admin'].includes(role)) throw new Error('Unknown MY role.');
  return role;
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
}

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
