const ROLE_LEVELS = Object.freeze({ viewer: 1, operator: 2, super_admin: 3 });
const OPEN_MODES = new Set(['webview', 'browser']);

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

function secureHttpUrl(value, label, { isProduction = true, optional = false, allowInsecure = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw && optional) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError(`${label}无效。`);
  }
  if (url.username || url.password) throw new TypeError(`${label}不能包含账号信息。`);
  if (url.hash) throw new TypeError(`${label}不能包含 fragment。`);
  const allowed = url.protocol === 'https:'
    || (url.protocol === 'http:' && (allowInsecure || (!isProduction && isLoopback(url.hostname))));
  if (!allowed) {
    throw new TypeError(`${label}必须使用 HTTPS；开发环境仅允许 loopback HTTP。`);
  }
  return url.toString();
}

function normalizeAutoLogin(input, { isProduction = true } = {}) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new TypeError('自动登录配置无效。');
  const loginUrl = secureHttpUrl(input.loginUrl, '自动登录页地址', { isProduction, allowInsecure: true });
  const username = String(input.username || '').trim();
  if (!username || username.length > 100) throw new TypeError('自动登录账号必须为 1 到 100 个字符。');
  const password = String(input.password || '');
  if (!password || password.length > 200) throw new TypeError('自动登录密码必须为 1 到 200 个字符。');
  let homeUrl = null;
  if (String(input.homeUrl || '').trim()) {
    homeUrl = secureHttpUrl(input.homeUrl, '自动登录后地址', { isProduction, allowInsecure: true });
    if (new URL(homeUrl).origin !== new URL(loginUrl).origin) {
      throw new TypeError('自动登录后地址必须与登录页同源。');
    }
  }
  return { loginUrl, username, password, homeUrl };
}

export function normalizeExternalApplicationInput(input, { isProduction = true } = {}) {
  if (!input || typeof input !== 'object') throw new TypeError('外部应用参数无效。');
  const name = String(input.name || '').trim();
  if (!name || name.length > 100) throw new TypeError('应用名称必须为 1 到 100 个字符。');
  const autoLogin = normalizeAutoLogin(input.autoLogin, { isProduction });
  const redirectUris = [...new Set((Array.isArray(input.redirectUris) ? input.redirectUris : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (redirectUris.length > 10) throw new TypeError('回调地址最多 10 个。');
  if (redirectUris.length === 0 && !autoLogin) throw new TypeError('至少需要一个回调地址。');
  if (redirectUris.some((value) => value.includes('*'))) throw new TypeError('回调地址禁止使用通配符。');
  const normalizedRedirects = redirectUris.map((value) => secureHttpUrl(value, '回调地址', { isProduction }));
  const requiredRole = String(input.requiredRole || 'viewer').trim().toLowerCase();
  if (!ROLE_LEVELS[requiredRole]) throw new TypeError('访问角色无效。');
  const openMode = String(input.openMode || 'webview').trim().toLowerCase();
  if (!OPEN_MODES.has(openMode)) throw new TypeError('打开方式无效。');
  return {
    name,
    description: String(input.description || '').trim().slice(0, 500),
    redirectUris: normalizedRedirects,
    launchUrl: secureHttpUrl(input.launchUrl, '启动地址', { isProduction, allowInsecure: Boolean(autoLogin) }),
    healthUrl: secureHttpUrl(input.healthUrl, '健康检查地址', { isProduction, optional: true }),
    requiredRole,
    openMode,
    enabled: input.enabled !== false,
    autoLogin,
  };
}

export function roleCanAccessExternalApplication(role, application) {
  if (!application?.enabled) return false;
  return (ROLE_LEVELS[String(role || 'viewer')] || 0)
    >= (ROLE_LEVELS[String(application.requiredRole || 'viewer')] || Number.POSITIVE_INFINITY);
}

export function visibleExternalApplications(applications, role) {
  const rows = Array.isArray(applications) ? applications : [];
  if (role === 'super_admin') return rows;
  return rows.filter((application) => roleCanAccessExternalApplication(role, application));
}

export function sanitizeExternalApplication(application, { role = 'viewer', includeClient = false } = {}) {
  if (!application) return null;
  const sanitized = { ...structuredClone(application) };
  delete sanitized.clientSecretHash;
  if (!includeClient) {
    delete sanitized.clientId;
    delete sanitized.clientSecretHint;
  }
  if (sanitized.autoLogin) {
    sanitized.autoLogin = {
      loginUrl: sanitized.autoLogin.loginUrl,
      username: sanitized.autoLogin.username,
      homeUrl: sanitized.autoLogin.homeUrl,
      hasPassword: Boolean(sanitized.autoLogin.password),
    };
  }
  sanitized.canAccess = roleCanAccessExternalApplication(role, application);
  return sanitized;
}

export async function checkExternalApplicationHealth(application, {
  fetchImpl = fetch,
  timeoutMs = 5_000,
  now = () => Date.now(),
} = {}) {
  const checkedAt = new Date().toISOString();
  if (!application?.enabled || !application?.healthUrl) {
    return { state: 'unmonitored', httpStatus: null, latencyMs: null, checkedAt };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(Number(timeoutMs) || 5_000, 500), 15_000));
  const startedAt = now();
  try {
    const response = await fetchImpl(application.healthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.5' },
    });
    return {
      state: response.ok ? 'healthy' : 'degraded',
      httpStatus: response.status,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      checkedAt,
    };
  } catch {
    return {
      state: 'offline',
      httpStatus: null,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
