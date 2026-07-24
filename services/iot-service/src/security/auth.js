const crypto = require('crypto');
const { isSafeHttpMethod } = require('@my-platform/platform-auth');
const { verifyPlatformSso } = require('./platformSso');

const PLATFORM_ROLE_SCOPES = Object.freeze({
  viewer: Object.freeze(['devices:read', 'history:read']),
  operator: Object.freeze(['devices:read', 'history:read', 'relays:write']),
  super_admin: Object.freeze(['*'])
});

function platformScopesForRole(role) {
  return [...(PLATFORM_ROLE_SCOPES[role] || [])];
}

function platformRoleAllowsRequest(role, method = 'GET', requiredScopes = []) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (role === 'super_admin') return true;
  if (role === 'viewer') return isSafeHttpMethod(normalizedMethod);
  if (role !== 'operator') return false;
  if (isSafeHttpMethod(normalizedMethod)) return true;
  return requiredScopes.length > 0 && requiredScopes.every((scope) => scope === 'relays:write');
}
const { verifyPassword } = require('./password');

const COOKIE_NAME = 'mqttapi_session';

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    // 即使长度不等，也需执行一次等长时间的 timingSafeEqual 以消除时序差
    const dummyBuffer = Buffer.alloc(leftBuffer.length);
    crypto.timingSafeEqual(leftBuffer, dummyBuffer);
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header) {
  const cookies = {};

  if (!header) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.httpOnly) {
    segments.push('HttpOnly');
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.secure) {
    segments.push('Secure');
  }

  return segments.join('; ');
}

function hasRequiredScopes(availableScopes, requiredScopes) {
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }

  const granted = new Set(Array.isArray(availableScopes) ? availableScopes : []);
  return granted.has('*') || requiredScopes.every((scope) => granted.has(scope));
}

class AuthManager {
  constructor(settingsStore, db = null) {
    this.settingsStore = settingsStore;
    this.db = db;
  }

  getConfig() {
    return this.settingsStore.getConfig().auth;
  }

  isEnabled() {
    const auth = this.getConfig();
    return Boolean(auth.enabled && auth.password);
  }

  createSignature(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  issueSession(username) {
    const auth = this.getConfig();
    const expiresAt = Date.now() + auth.sessionTtlHours * 60 * 60 * 1000;
    const payload = toBase64Url(JSON.stringify({ username, expiresAt }));
    const signature = this.createSignature(payload, auth.sessionSecret);

    return {
      token: `${payload}.${signature}`,
      maxAge: auth.sessionTtlHours * 60 * 60
    };
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [payload, signature] = parts;
    const auth = this.getConfig();
    const expectedSignature = this.createSignature(payload, auth.sessionSecret);

    if (!safeEqual(signature, expectedSignature)) {
      return null;
    }

    try {
      const data = JSON.parse(fromBase64Url(payload));
      if (!data.expiresAt || data.expiresAt < Date.now()) {
        return null;
      }

      return data;
    } catch (error) {
      return null;
    }
  }

  getRequestAuth(req) {
    const platformIdentity = verifyPlatformSso(req);
    if (platformIdentity) {
      return {
        enabled: true,
        authenticated: true,
        username: platformIdentity.sub,
        isApiKey: false,
        platformSso: true,
        platformRole: platformIdentity.role,
        csrfToken: platformIdentity.csrf,
        scopes: platformScopesForRole(platformIdentity.role)
      };
    }

    if (!this.isEnabled()) {
      return {
        enabled: false,
        authenticated: true,
        username: null,
        isApiKey: false,
        scopes: ['*']
      };
    }

    const cookies = parseCookies(req.headers.cookie || '');
    const session = this.verifyToken(cookies[COOKIE_NAME]);

    return {
      enabled: true,
      authenticated: Boolean(session),
      username: session ? session.username : null,
      isApiKey: false,
      scopes: session ? ['*'] : []
    };
  }

  authenticate(username, password) {
    const auth = this.getConfig();

    if (!this.isEnabled()) {
      return {
        ok: true,
        disabled: true
      };
    }

    if (!safeEqual(username, auth.username) || !verifyPassword(password, auth.password)) {
      return {
        ok: false,
        message: '用户名或密码不正确。'
      };
    }

    return {
      ok: true,
      session: this.issueSession(auth.username)
    };
  }

  isSecureRequest(req) {
    return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https'));
  }

  applySessionCookie(res, session, options = {}) {
    res.setHeader(
      'Set-Cookie',
      serializeCookie(COOKIE_NAME, session.token, {
        maxAge: session.maxAge,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        secure: Boolean(options.secure)
      })
    );
  }

  clearSession(res) {
    res.setHeader(
      'Set-Cookie',
      serializeCookie(COOKIE_NAME, '', {
        maxAge: 0,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/'
      })
    );
  }

  async getApiKeyAuth(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const apiKey = authHeader.substring(7).trim();
    if (!apiKey || !this.db) {
      return { invalid: true };
    }

    try {
      const result = await this.db.verifyApiKey(apiKey);
      if (!result) {
        return { invalid: true };
      }

      return {
        enabled: true,
        authenticated: true,
        username: result.name || 'api_key_authorized',
        isApiKey: true,
        keyId: result.keyId,
        scopes: result.scopes || []
      };
    } catch (error) {
      return { invalid: true };
    }
  }

  requireAccess(requiredScopes = [], options = {}) {
    const allowApiKey = options.allowApiKey !== false;
    const allowSession = options.allowSession !== false;
    const insufficientScopeMessage = options.insufficientScopeMessage || '当前凭证没有访问该接口的权限。';

    return async (req, res, next) => {
      const authState = this.getRequestAuth(req);
      if (authState.platformSso) {
        req.auth = authState;
        if (!platformRoleAllowsRequest(authState.platformRole, req.method, requiredScopes)) {
          return res.status(403).json({
            error: 'The unified-platform role cannot perform this operation.'
          });
        }
        if (!hasRequiredScopes(authState.scopes, requiredScopes)) {
          return res.status(403).json({ error: insufficientScopeMessage });
        }
        return next();
      }

      const apiKeyAuth = await this.getApiKeyAuth(req);
      if (apiKeyAuth) {
        if (apiKeyAuth.invalid) {
          return res.status(401).json({
            error: '无效或已过期的 API Key。'
          });
        }

        if (!allowApiKey) {
          return res.status(403).json({
            error: 'API Key 无法访问该接口。'
          });
        }

        if (!hasRequiredScopes(apiKeyAuth.scopes, requiredScopes)) {
          return res.status(403).json({
            error: insufficientScopeMessage
          });
        }

        req.auth = apiKeyAuth;
        try {
          await this.db.recordApiKeyUsage(apiKeyAuth.keyId);
        } catch (error) {
          console.error(JSON.stringify({
            event: 'api_key_usage_record_failed',
            keyId: apiKeyAuth.keyId,
            message: error.message
          }));
        }
        return next();
      }

      req.auth = authState;

      if (!allowSession) {
        if (!authState.enabled) {
          return next();
        }

        return res.status(401).json({
          error: '请先登录。'
        });
      }

      if (!authState.enabled || authState.authenticated) {
        return next();
      }

      return res.status(401).json({
        error: '请先登录。'
      });
    };
  }

  requireSession() {
    return this.requireAccess([], { allowApiKey: false });
  }

  canAccessRealtime(req) {
    const authState = this.getRequestAuth(req);
    return !authState.enabled || authState.authenticated;
  }
}

module.exports = {
  AuthManager,
  platformRoleAllowsRequest,
  platformScopesForRole
};
