import { registerWebLoginRoutes } from './routes/web-login-routes.js';
import { registerQrLoginRoutes, registerQrApprovalRoutes } from './routes/qr-login-routes.js';
import { registerAuthRoutes, registerLogoutRoute, registerReauthenticationRoutes } from './routes/auth-routes.js';
import { createMemoryAuthenticatorVaultStore } from './authenticator-vault-store.js';
import { registerAuthenticatorVaultRoutes } from './routes/authenticator-vault-routes.js';
import { renderAppLoginErrorHtml } from './app-login-pages.js';
import { registerExternalAppRoutes } from './routes/external-app-routes.js';
import { registerNotificationRoutes } from './routes/notification-routes.js';
import { registerOperationsRoutes } from './routes/operations-routes.js';
import { registerSecurityRoutes } from './routes/security-routes.js';
import { registerReleaseRoutes } from './routes/release-routes.js';
import { registerAcrRoutes } from './routes/acr-routes.js';
import { registerBackupRoutes } from './routes/backup-routes.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import {
  SESSION_COOKIE_NAME,
  createPasswordHash,
  createSessionRegistry,
  parseCookies,
  passwordHashNeedsUpgrade,
  sessionCookieName,
  verifyPassword,
} from './auth.js';
import { createMemoryAuthStore } from './auth-store.js';
import { createMemoryAuthRiskStore } from './auth-risk-store.js';
import { createNativeDeviceSecurity, DeviceSecurityError, proofDigest } from './native-device-security.js';
import { BackupOperationError, createBackupManager, createBackupRunnerClient } from './backups.js';

import { createChangeCalendar } from './change-calendar.js';
import { ConfigurationError, createConfigurationManager } from './configuration-manager.js';
import { createMemoryConfigurationStore } from './configuration-store.js';
import { loadConfig } from './config.js';
import { createStatusMonitor, loadServiceRegistry } from './service-registry.js';
import { createMetrics } from './metrics.js';
import { createNotificationManagementClient } from './notification-management.js';
import { createOperationsCenter } from './operations-center.js';
import { createOperationsNotifier } from './operations-notifier.js';
import { createMemoryOperationsStore } from './operations-store.js';

import { createOperationalSearch } from './operational-search.js';
import { createPasskeyService } from './passkeys.js';
import { QR_LOGIN_TTL_MS, createMemoryQrLoginStore } from './qr-login-store.js';
import { createMemoryWebLoginTicketStore } from './web-login-ticket-store.js';
import { ReleaseOperationError, createReleaseService } from './release-service.js';
import { createAcrService } from './acr-service.js';
import { createMemoryReleaseStore } from './release-store.js';
import { createRequestDiagnostics } from './request-diagnostics.js';
import { createSloService } from './slo-service.js';
import { createTaskCenter } from './task-center.js';
import { createMemoryGoogleAccountStore } from './google-account-store.js';
import { createMemoryExternalApplicationStore } from './external-application-store.js';

import { createExternalIdentityService } from './external-identity.js';
import { registerOAuthRoutes } from './routes/oauth-routes.js';
import { EXTERNAL_AUTH_GUIDE_CSS, buildExternalAuthGuideContract, renderExternalAuthGuideHtml } from './external-auth-guide.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');

const ANDROID_APP_USER_AGENT_PREFIX = 'MY-Control-Android/';
const WEB_LOGIN_ALLOWED_PATHS = [
  '/console',
  '/apps/core',
  '/apps/exam',
  '/apps/campus',
  '/apps/iot',
  '/oauth/authorize',
  '/oauth/external-launch',
];

function isAndroidAppRequest(req) {
  return String(req.headers['user-agent'] || '').startsWith(ANDROID_APP_USER_AGENT_PREFIX);
}

function requestDeviceId(req) {
  const value = String(req.get('x-platform-device-id') || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : '';
}

function requestDeviceName(req) {
  const value = String(req.body?.deviceName || '').trim();
  return value ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 96) : '';
}

function sessionPolicyForRequest(req, config) {
  const androidApp = String(req.get('user-agent') || '').startsWith(ANDROID_APP_USER_AGENT_PREFIX);
  return androidApp
    ? { ttlHours: config.androidSessionTtlHours, idleMinutes: config.androidSessionIdleMinutes }
    : { ttlHours: config.sessionTtlHours, idleMinutes: config.sessionIdleMinutes };
}

function sessionCookieOptions(config, ttlHours = config.sessionTtlHours) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: '/',
    maxAge: ttlHours * 60 * 60 * 1000,
  };
}

function clearSessionCookies(res, config) {
  const options = { ...sessionCookieOptions(config), maxAge: 0 };
  res.clearCookie(sessionCookieName(config.isProduction), options);
  if (config.isProduction) res.clearCookie(SESSION_COOKIE_NAME, options);
}

function qrLoginCookieName(config, requestId) {
  const prefix = config.isProduction ? '__Host-' : '';
  return `${prefix}my_platform_qr_${String(requestId || '').replace(/[^A-Za-z0-9]/g, '')}`;
}

function qrLoginCookieOptions(config, maxAge = QR_LOGIN_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: '/',
    maxAge,
  };
}

function validQrRequestId(value) {
  const id = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
}

function userAgentLabel(value) {
  const userAgent = String(value || '');
  const browser = userAgent.includes('Edg/') ? 'Microsoft Edge'
    : userAgent.includes('Chrome/') ? 'Google Chrome'
      : userAgent.includes('Firefox/') ? 'Firefox'
        : userAgent.includes('Safari/') ? 'Safari'
          : '未知浏览器';
  const system = userAgent.includes('Windows') ? 'Windows'
    : userAgent.includes('Android') ? 'Android'
      : /iPhone|iPad/.test(userAgent) ? 'iOS'
        : userAgent.includes('Mac OS') ? 'macOS'
          : userAgent.includes('Linux') ? 'Linux'
            : '未知系统';
  return `${browser} · ${system}`;
}

function requireConsoleRequest(req, res, next) {
  if (req.get('X-Platform-Request') !== 'console') {
    return res.status(403).json({ error: '请求来源无效。', code: 'INVALID_REQUEST_SOURCE' });
  }
  return next();
}

function secureTokenEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeWebLoginRedirect(value, publicUrl) {
  const raw = String(value || '/console').trim();
  let url;
  try {
    url = raw.startsWith('/') ? new URL(raw, publicUrl.origin) : new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== publicUrl.origin) return null;
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const allowed = WEB_LOGIN_ALLOWED_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return allowed ? url.toString() : null;
}

function safeDownloadName(filename) {
  return String(filename || 'backup.tar.gz').replace(/[^A-Za-z0-9_.-]/g, '_');
}

const ROLE_LEVELS = { viewer: 1, operator: 2, super_admin: 3 };
const INTERNAL_HEALTH_PATHS = new Set(['/api/health', '/api/livez', '/api/readyz']);
const CLIENT_EXPERIENCE_APPLICATIONS = new Set(['console', 'core-admin', 'exam-admin']);
const CLIENT_EXPERIENCE_EVENTS = new Set([
  'page_load',
  'route_change',
  'ui_error',
  'unhandled_error',
  'unhandled_rejection',
  'request_failure',
]);

function normalizeClientRoute(value) {
  const route = String(value || 'unknown').split(/[?#]/, 1)[0].trim().slice(0, 120);
  if (!route || !/^[A-Za-z0-9_/:.-]+$/.test(route)) return 'unknown';
  return route
    .split('/')
    .map((segment) => (/^(?:\d{4,}|[0-9a-f]{12,}|[A-Za-z0-9_-]{32,})$/i.test(segment) ? ':id' : segment))
    .join('/')
    .slice(0, 80) || 'unknown';
}

function normalizeClientExperience(input) {
  const application = String(input?.application || '');
  const event = String(input?.event || '');
  const outcome = String(input?.outcome || 'error');
  if (!CLIENT_EXPERIENCE_APPLICATIONS.has(application) || !CLIENT_EXPERIENCE_EVENTS.has(event)) return null;
  if (!['ok', 'error', 'timeout', 'aborted'].includes(outcome)) return null;
  const duration = Number(input?.durationMs);
  const fingerprint = /^[0-9a-f]{8,16}$/i.test(String(input?.fingerprint || ''))
    ? String(input.fingerprint).toLowerCase()
    : 'none';
  return {
    application,
    event,
    outcome,
    route: normalizeClientRoute(input?.route),
    fingerprint,
    durationMs: Number.isFinite(duration) && duration >= 0 ? Math.min(Math.round(duration), 300_000) : null,
  };
}

function requireRole(requiredRole) {
  return (req, res, next) => {
    const current = ROLE_LEVELS[req.consoleUser?.role] || 0;
    if (current < ROLE_LEVELS[requiredRole]) {
      return res.status(403).json({ error: '当前账号权限不足。', code: 'INSUFFICIENT_ROLE' });
    }
    return next();
  };
}

function requestAuditFields(req) {
  return {
    requestId: req.requestId || '',
    ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 128),
    userAgent: String(req.get('user-agent') || '').slice(0, 256),
  };
}

export function createApp({
  config = loadConfig(),
  serviceTargets = {},
  fetchImpl = fetch,
  sessionRegistry = null,
  readinessCheck = async () => true,
  backupManager = null,
  operationsStore = null,
  releaseStore = null,
  operationsManager = null,
  releaseManager = null,
  acrManager = null,
  notificationManager = null,
  authStore = null,
  authRiskStore = null,
  qrLoginStore = null,
  webLoginTicketStore = null,
  authenticatorVaultStore = null,
  googleAccountStore = null,
  externalApplicationStore = null,
  configurationStore = null,
  configurationManager = null,
  taskManager = null,
  requestDiagnostics = null,
  operationalSearchManager = null,
  sloManager = null,
  changeCalendarManager = null,
} = {}) {
  const registry = loadServiceRegistry(config.registryPath, { baseUrls: serviceTargets });
  const monitor = createStatusMonitor(registry.services, {
    timeoutMs: config.serviceTimeoutMs,
    fetchImpl,
  });
  const app = express();
  const sessions = sessionRegistry || createSessionRegistry({
    secret: config.sessionSecret,
    idleTimeoutMinutes: config.sessionIdleMinutes,
  });
  const fallbackEncryptionKey = config.authEncryptionKey || crypto.randomBytes(32).toString('base64url');
  const accounts = authStore || createMemoryAuthStore({
    encryptionKey: fallbackEncryptionKey,
    issuer: config.webauthnRpName || 'MY Platform',
    legacyBindings: config.legacyServiceBindings,
    bootstrap: {
      username: config.adminUsername || 'local-admin',
      passwordHash: config.adminPasswordHash || 'development-only',
      role: config.adminRole || 'super_admin',
      totpSecret: config.adminTotpSecret || '',
    },
  });
  const risk = authRiskStore || createMemoryAuthRiskStore({
    encryptionKey: fallbackEncryptionKey,
    challengeConfigured: Boolean(config.turnstileSiteKey && config.turnstileSecretKey),
    windowMinutes: config.loginWindowMinutes,
    maxAttempts: config.loginMaxAttempts,
    challengeThreshold: config.loginChallengeThreshold,
    backoffBaseMs: config.loginBackoffBaseMs,
    backoffMaxMs: config.loginBackoffMaxMs,
  });
  const qrLogins = qrLoginStore || createMemoryQrLoginStore();
  const webLoginTickets = webLoginTicketStore || createMemoryWebLoginTicketStore();
  const googleAccounts = googleAccountStore || createMemoryGoogleAccountStore();
  const externalApplications = externalApplicationStore || createMemoryExternalApplicationStore();
  const publicUrl = new URL(config.publicOrigin || 'http://127.0.0.1');
  const externalIdentity = createExternalIdentityService({
    issuer: config.externalAuthIssuer || publicUrl.origin,
    privateKey: config.externalAuthPrivateKey,
    publicKey: config.externalAuthPublicKey,
    keyId: config.externalAuthKeyId,
    tokenTtlSeconds: config.externalAuthTokenTtlSeconds,
  });
  const passkeyOrigins = [publicUrl.origin, ...(config.androidPasskeyOrigins || [])];
  const passkeys = createPasskeyService({
    authStore: accounts,
    rpName: config.webauthnRpName || 'MY Platform',
    rpID: config.webauthnRpId || publicUrl.hostname,
    origin: passkeyOrigins.length === 1 ? passkeyOrigins[0] : passkeyOrigins,
  });
  const metrics = createMetrics({ serviceIds: registry.services.map((service) => service.id) });
  const backups = backupManager || (config.backupRunnerUrl
    ? createBackupRunnerClient({ config })
    : createBackupManager({ config }));
  const store = operationsStore || createMemoryOperationsStore({
    statusRetentionDays: config.statusRetentionDays,
    auditRetentionDays: config.auditRetentionDays,
  });
  const releaseData = releaseStore || createMemoryReleaseStore();
  const notifier = createOperationsNotifier({
    serviceUrl: config.notificationServiceUrl,
    apiKey: config.notificationApiKey,
    publicOrigin: config.publicOrigin,
    enabled: config.incidentNotificationsEnabled,
    fetchImpl,
  });
  const notificationManagement = notificationManager || createNotificationManagementClient({
    serviceUrl: config.notificationServiceUrl,
    apiKey: config.notificationApiKey,
    fetchImpl,
  });
  const releases = releaseManager || createReleaseService({
    config,
    fetchImpl,
    store: releaseData,
    operationsStore: store,
    notifier,
  });
  const acr = acrManager || createAcrService({ config, fetchImpl });
  const operations = operationsManager || createOperationsCenter({
    services: registry.services,
    monitor,
    store,
    notifier,
    backups,
    releaseService: releases,
    metrics,
    config,
    readinessCheck,
    fetchImpl,
  });
  const configurationData = configurationStore || createMemoryConfigurationStore();
  const configurations = configurationManager || createConfigurationManager({
    store: configurationData,
    operations,
    enforceTwoPerson: config.configurationTwoPersonApproval,
  });
  const tasks = taskManager || createTaskCenter({
    backups,
    releases,
    notificationManagement,
    operationsStore: store,
    configurationManager: configurations,
  });
  const operationalSearch = operationalSearchManager || createOperationalSearch({
    services: registry.services,
    operationsStore: store,
    taskCenter: tasks,
    releaseStore: releaseData,
    configurationStore: configurationData,
  });
  const slos = sloManager || createSloService({
    services: registry.services,
    operationsStore: store,
  });
  const changeCalendar = changeCalendarManager || createChangeCalendar({
    services: registry.services,
    releaseStore: releaseData,
    configurationStore: configurationData,
    operationsStore: store,
    operationsManager: operations,
  });
  const diagnostics = requestDiagnostics || createRequestDiagnostics({
    services: registry.services,
    publicOrigin: config.publicOrigin,
    fetchImpl,
    timeoutMs: config.serviceTimeoutMs,
  });
  const readBlackboxStatus = (options) => typeof operations.getBlackboxStatus === 'function'
    ? operations.getBlackboxStatus(options)
    : Promise.resolve({ observed: false, overall: 'unconfigured', latest: [], samples: [] });

  function readSessionToken(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[sessionCookieName(config.isProduction)] || cookies[SESSION_COOKIE_NAME];
  }

  async function readSession(req) {
    const token = readSessionToken(req);
    const session = await app.locals.verifyConsoleSession(token);
    return app.locals.verifyConsoleRequest(req, session, token);
  }

  async function readExternalPrincipal(req) {
    if (config.authDisabled) {
      return {
        session: { sub: 'local-admin', role: 'super_admin', nonce: 'local-development-session' },
        account: { username: 'local-admin', role: 'super_admin', active: true },
      };
    }
    const session = await readSession(req);
    const account = session ? await accounts.findAccount(session.sub) : null;
    if (!session || !account?.active || (config.requireMfa && !strongFactorEnabled(account))) return null;
    return { session, account };
  }

  function readOAuthClientCredentials(req) {
    const authorization = String(req.get('authorization') || '');
    if (authorization.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        if (separator > 0) {
          return {
            clientId: decodeURIComponent(decoded.slice(0, separator)),
            clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
          };
        }
      } catch {
        return { clientId: '', clientSecret: '' };
      }
    }
    return {
      clientId: String(req.body?.client_id || ''),
      clientSecret: String(req.body?.client_secret || ''),
    };
  }

  function readQrBrowserVerifier(req, requestId) {
    return parseCookies(req.headers.cookie)[qrLoginCookieName(config, requestId)] || '';
  }

  function clearQrBrowserVerifier(res, requestId) {
    res.clearCookie(qrLoginCookieName(config, requestId), qrLoginCookieOptions(config, 0));
  }

  function browserQrResponse(record) {
    return {
      requestId: record.id,
      status: record.status,
      verificationCode: record.verificationCode,
      scannedBy: record.scannedBy || null,
      expiresAt: record.expiresAt,
    };
  }

  function appQrResponse(record) {
    const androidPasskeyConfigured = (config.androidAppCertFingerprints || []).length > 0;
    const clientKind = record.clientKind || 'browser';
    const confirmationMethod = androidPasskeyConfigured ? 'passkey' : 'unavailable';
    return {
      requestId: record.id,
      status: record.status,
      verificationCode: record.verificationCode,
      clientKind,
      browser: {
        label: userAgentLabel(record.browserUserAgent),
        ip: record.browserIp || '未知 IP',
        userAgent: record.browserUserAgent || '未知设备',
      },
      expiresAt: record.expiresAt,
      confirmationMethod,
    };
  }

  function sendBackupError(res, error) {
    if (error instanceof BackupOperationError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }

  function sendConfigurationError(res, error) {
    if (error instanceof ConfigurationError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }

  async function recordAudit(req, input) {
    return operations.recordAudit({
      actor: req.consoleUser?.username || input.actor || 'anonymous',
      ...requestAuditFields(req),
      ...input,
    });
  }

  async function verifyReauthentication(req, { allowRecent = true } = {}) {
    if (config.authDisabled) return true;
    if (allowRecent && req.consoleSession?.reauthenticatedUntil > Math.floor(Date.now() / 1000)) return true;
    const account = await accounts.findAccount(req.consoleUser?.username);
    if (!account?.active || !await verifyPassword(String(req.body?.password || ''), account.passwordHash)) return false;
    if (!account.totpEnabled) return !config.requireMfa || !account.passkeyCount;
    return (await accounts.consumeSecondFactor(account.username, {
      totp: req.body?.totp,
      recoveryCode: req.body?.recoveryCode,
    })).valid;
  }

  async function confirmSensitiveAuthentication(req, res, action) {
    const riskState = await risk.assess({ username: req.consoleUser?.username, ip: req.ip });
    if (riskState.blocked) { sendRiskResponse(res, riskState); return false; }
    if (await verifyReauthentication(req)) return true;
    await risk.recordFailure({ username: req.consoleUser?.username, ip: req.ip });
    await recordAudit(req, {
      action,
      outcome: 'failure',
      targetType: 'account',
      targetId: req.consoleUser?.username || '',
      details: { reason: 'reauthentication_failed' },
    });
    res.status(403).json({ error: '管理员二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
    return false;
  }

  function authUser(account) {
    return {
      id: account.id,
      username: account.username,
      role: account.role,
      totpEnabled: Boolean(account.totpEnabled),
      passkeyCount: Number(account.passkeyCount) || 0,
      mfaCompliant: !config.requireMfa || Boolean(account.totpEnabled || account.passkeyCount),
    };
  }

  function strongFactorEnabled(account) {
    return Boolean(account?.totpEnabled || account?.passkeyCount);
  }

  async function recordLoginFailure(req, username, reason) {
    const riskState = await risk.recordFailure({ username, ip: req.ip });
    await recordAudit(req, {
      actor: username || 'anonymous',
      action: 'auth.login',
      outcome: 'failure',
      targetType: 'account',
      targetId: username,
      details: { reason, failures: riskState.failures },
    });
    if (riskState.alert) {
      notifier.sendSecurityAlert({
        type: 'failed_login',
        username,
        ip: req.ip,
        failures: riskState.failures,
      }).catch(() => {});
    }
    return riskState;
  }

  function sendRiskResponse(res, riskState) {
    if (riskState.retryAfterSeconds) res.setHeader('Retry-After', String(riskState.retryAfterSeconds));
    return res.status(riskState.blocked ? 429 : 401).json({
      error: riskState.blocked ? '登录暂时受限，请稍后再试。' : '账号或密码错误。',
      code: riskState.blocked ? 'LOGIN_BACKOFF_ACTIVE' : 'INVALID_CREDENTIALS',
      details: {
        challengeRequired: Boolean(riskState.challengeRequired),
        turnstileSiteKey: riskState.challengeRequired ? config.turnstileSiteKey : undefined,
        retryAfterSeconds: riskState.retryAfterSeconds || 0,
      },
    });
  }

  async function issueSessionCookie(req, res, account, authenticationMethod, options = {}) {
    const sessionKind = options.sessionKind || (isAndroidAppRequest(req) || req.body?.deviceRegistration ? 'native_app' : 'browser');
    const policy = options.policy || (sessionKind === 'native_app'
      ? { ttlHours: config.androidSessionTtlHours, idleMinutes: config.androidSessionIdleMinutes }
      : sessionPolicyForRequest(req, config));
    const deviceId = options.deviceId || requestDeviceId(req);
    const deviceName = options.deviceName || requestDeviceName(req);
    const now = Date.now();
    const nativeSecurity = sessionKind === 'native_app' && (config.androidRequireDeviceProof || req.headers.dpop)
      ? await deviceSecurity.register(await deviceSecurity.proof(req), req.body?.deviceRegistration)
      : null;
    const issued = await sessions.issue({
      username: account.username,
      accountId: account.id,
      authVersion: account.authVersion || 0,
      role: account.role,
      ttlHours: policy.ttlHours,
      idleTimeoutMinutes: policy.idleMinutes,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      sessionKind,
      parentSessionNonce: options.parentSessionNonce || '',
      deviceId,
      deviceName,
      replaceExisting: options.replaceExisting ?? (sessionKind === 'native_app' && Boolean(deviceId)),
      nativeSecurity,
      accessTtlSeconds: config.androidAccessTtlSeconds,
      now,
    });
    const token = typeof issued === 'string' ? issued : issued.token;
    await app.locals.onConsoleSessionsChanged();
    res.cookie(sessionCookieName(config.isProduction), token, sessionCookieOptions(config,
      nativeSecurity ? config.androidAccessTtlSeconds / 3600 : policy.ttlHours));
    if (config.isProduction) {
      res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(config), maxAge: 0 });
    }
    await risk.recordSuccess({ username: account.username, ip: req.ip });
    const loginIp = await accounts.rememberLoginIp(account.username, req.ip);
    await recordAudit(req, {
      actor: account.username,
      action: 'auth.login',
      targetType: 'account',
      targetId: account.username,
      details: { authenticationMethod, newIp: loginIp.newIp },
    });
    if (loginIp.newIp) {
      notifier.sendSecurityAlert({ type: 'new_ip_login', username: account.username, ip: req.ip }).catch(() => {});
    }
    return { now, policy, native: nativeSecurity ? {
      refreshToken: issued.refreshToken,
      accessExpiresAt: new Date(issued.accessExpiresAt * 1000).toISOString(),
      deviceBound: true,
      deviceIntegrity: nativeSecurity.integrity,
    } : {} };
  }

  async function issueAuthenticatedSession(req, res, account, authenticationMethod, extra = {}) {
    const { now, policy, native } = await issueSessionCookie(req, res, account, authenticationMethod);
    return res.json({
      authenticated: true,
      authDisabled: false,
      totpRequired: account.totpEnabled,
      mfaRequired: Boolean(config.requireMfa),
      user: authUser(account),
      session: {
        expiresAt: new Date(now + policy.ttlHours * 60 * 60 * 1000).toISOString(),
        idleTimeoutMinutes: policy.idleMinutes,
        ...native,
      },
      ...extra,
    });
  }

  async function upgradePasswordHashAfterLogin(username, currentHash, password) {
    if (!passwordHashNeedsUpgrade(currentHash)) return false;
    const passwordValue = String(password || '');
    if (passwordValue.length < 15 || passwordValue.length > 256) return false;
    const upgraded = await createPasswordHash(passwordValue);
    return accounts.upgradePasswordHash(username, currentHash, upgraded);
  }

  async function requireBackupDownloadAccess(req, res, next) {
    const current = ROLE_LEVELS[req.consoleUser?.role] || 0;
    if (current < ROLE_LEVELS.super_admin) {
      await recordAudit(req, {
        action: 'backup.download',
        outcome: 'failure',
        targetType: 'backup',
        targetId: req.params.backupName,
        details: { reason: 'insufficient_role' },
      });
      return res.status(403).json({ error: '仅超级管理员可以下载备份。', code: 'INSUFFICIENT_ROLE' });
    }
    return next();
  }

  const proxyAuditTimes = new Map();
  const deviceSecurity = createNativeDeviceSecurity({ config, authStore: accounts, fetchImpl });
  async function nativeLoginProof(req) {
    return (isAndroidAppRequest(req) && config.androidRequireDeviceProof) || req.headers.dpop
      ? deviceSecurity.proof(req) : null;
  }
  function nativeIntegrityAllowed(session, now = Date.now()) {
    if ((session.nativeVersionCode || 0) < config.androidMinVersionCode) return false;
    return !config.androidRequireIntegrity || (
      session.nativeIntegrity === 'verified' && session.nativeVersionCode >= config.androidMinVersionCode &&
      session.nativeAttestedAt > now - config.androidAttestationMaxAgeHours * 3600_000
    );
  }
  app.locals.verifyConsoleSession = async (token, now) => {
    const session = await sessions.verify(token, now);
    if (!session) return null;
    const account = await accounts.findAccount(session.sub);
    if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) return null;
    if ((session.accountId && session.accountId !== account.id) || (session.authVersion || 0) !== (account.authVersion || 0)) return null;
    if (session.sessionKind === 'native_app' && (
      (config.androidRequireDeviceProof && !session.nativeKeyThumbprint) || !nativeIntegrityAllowed(session, now)
    )) return null;
    return { ...session, role: account.role, accountId: account.id, serviceBindings: account.serviceBindings };
  };
  app.locals.verifyConsoleRequest = async (req, session, token) => {
    if (!session) return null;
    if (session.nativeKeyThumbprint || session.cnf?.jkt) {
      const proof = await deviceSecurity.proof(req, token);
      if (proof.thumbprint !== session.nativeKeyThumbprint || proof.thumbprint !== session.cnf?.jkt) {
        throw new DeviceSecurityError('DEVICE_KEY_MISMATCH', '当前会话与设备不匹配，请重新登录。');
      }
    } else if (config.androidRequireDeviceProof && isAndroidAppRequest(req)) {
      throw new DeviceSecurityError('DEVICE_BINDING_REQUIRED', '请更新应用并重新登录以建立设备安全绑定。', 401);
    }
    return session;
  };
  app.locals.onConsoleSessionRevoked = () => {};
  app.locals.onConsoleSessionChanged = () => {};
  app.locals.onConsoleSessionsChanged = () => {};
  app.locals.revokeConsoleSessions = async ({ subject, nonce, exceptNonce }) => {
    const revoked = nonce
      ? await sessions.revokeByNonce(nonce, { subject })
      : await sessions.revokeBySubject(subject, { exceptNonce });
    await webLoginTickets.revokeForSessions({ subject, nonce, exceptNonce });
    await app.locals.onConsoleSessionsChanged();
    return revoked;
  };
  app.locals.recordProxyMetric = (metric) => {
    metrics.recordProxy(metric);
    operations.recordProxyMetric(metric).catch(() => {});
    if (metric?.outcome === 'error') {
      const auditKey = `${metric.service || 'other'}:${metric.errorKind || metric.statusClass || 'unknown'}`;
      const now = Date.now();
      const lastAuditAt = proxyAuditTimes.get(auditKey) || 0;
      if (now - lastAuditAt < 60_000) return;
      proxyAuditTimes.set(auditKey, now);
      operations.recordAudit({
        actor: 'system',
        action: 'gateway.proxy_error',
        outcome: 'failure',
        targetType: 'service',
        targetId: String(metric.service || 'other'),
        details: {
          statusClass: metric.statusClass,
          errorKind: metric.errorKind,
          durationMs: Math.max(Number(metric.durationMs) || 0, 0),
        },
      }).catch(() => {});
    }
  };
  app.locals.sessionRegistry = sessions;
  app.locals.operationsStore = store;
  app.locals.operationsCenter = operations;
  app.locals.releaseService = releases;
  app.locals.releaseStore = releaseData;
  app.locals.notificationManagement = notificationManagement;
  app.locals.configurationStore = configurationData;
  app.locals.configurationManager = configurations;
  app.locals.taskCenter = tasks;
  app.locals.operationalSearch = operationalSearch;
  app.locals.sloService = slos;
  app.locals.changeCalendar = changeCalendar;
  app.locals.requestDiagnostics = diagnostics;
  app.locals.authStore = accounts;
  app.locals.authRiskStore = risk;
  app.locals.qrLoginStore = qrLogins;
  app.locals.webLoginTicketStore = webLoginTickets;
  app.locals.googleAccountStore = googleAccounts;
  app.locals.externalApplicationStore = externalApplications;
  app.locals.externalIdentity = externalIdentity;

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    const internalHealthRequest = (req.method === 'GET' || req.method === 'HEAD')
      && INTERNAL_HEALTH_PATHS.has(req.path);
    if (!config.isProduction || req.secure || internalHealthRequest) return next();
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api/')) {
      return res.redirect(308, new URL(req.originalUrl || '/', config.publicOrigin).toString());
    }
    return res.status(400).json({ error: '必须使用 HTTPS 访问管理控制台。', code: 'HTTPS_REQUIRED' });
  });
  app.use((req, res, next) => {
    const incoming = String(req.get('x-request-id') || '');
    req.requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(metrics.middleware);
  app.use(helmet({
    strictTransportSecurity: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...(config.turnstileSiteKey ? ['https://challenges.cloudflare.com'] : [])],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", ...(config.turnstileSiteKey ? ['https://challenges.cloudflare.com'] : [])],
        frameSrc: config.turnstileSiteKey ? ['https://challenges.cloudflare.com'] : ["'none'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(compression());
  const blackboxIngestLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'External probe ingest rate exceeded.', code: 'BLACKBOX_RATE_LIMITED' },
  });
  const clientExperienceLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '体验事件上报过于频繁。', code: 'CLIENT_EXPERIENCE_RATE_LIMITED' },
  });
  app.post(
    '/api/internal/blackbox/samples',
    blackboxIngestLimiter,
    express.json({ limit: '256kb' }),
    async (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!config.blackboxIngestToken) {
        return res.status(503).json({ error: 'External probe ingest is not configured.', code: 'BLACKBOX_NOT_CONFIGURED' });
      }
      if (typeof operations.ingestBlackboxSamples !== 'function') {
        return res.status(503).json({ error: 'External probe storage is unavailable.', code: 'BLACKBOX_STORE_UNAVAILABLE' });
      }
      const authorization = String(req.get('authorization') || '');
      if (!secureTokenEqual(authorization, `Bearer ${config.blackboxIngestToken}`)) {
        return res.status(401).json({ error: 'External probe credential is invalid.', code: 'BLACKBOX_UNAUTHORIZED' });
      }
      try {
        const result = await operations.ingestBlackboxSamples(req.body?.samples, { probeId: req.body?.probeId });
        return res.status(202).json(result);
      } catch (error) {
        if (error instanceof RangeError) {
          return res.status(400).json({ error: error.message, code: 'INVALID_BLACKBOX_SAMPLES' });
        }
        next(error);
        return undefined;
      }
    },
  );
  const consoleJsonParser = (limit) => express.json({ limit, verify: (req, res, body) => {
    if (req.headers.dpop && req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
      throw new DeviceSecurityError('DEVICE_BODY_ENCODING', '设备请求不支持压缩正文。', 415);
    }
    req.bodyDigest = proofDigest(body);
  } });
  // 新消息富媒体上传需要携带 base64 文件，单独放宽该路由上限，其余接口保持 128kb。
  const defaultConsoleJsonParser = consoleJsonParser('128kb');
  const consoleUploadJsonParser = consoleJsonParser('16mb');
  app.use((req, res, next) => (
    req.path === '/api/notifications/cmcc/media' ? consoleUploadJsonParser : defaultConsoleJsonParser
  )(req, res, next));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/external-auth-guide', (req, res) => res.redirect(308, '/docs/external-auth'));
  app.get('/external-auth-guide.json', (req, res) => res.redirect(308, '/docs/external-auth.json'));
  app.get('/docs/external-auth.css', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.type('text/css').send(EXTERNAL_AUTH_GUIDE_CSS);
  });
  app.get('/docs/external-auth', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.type('html').send(renderExternalAuthGuideHtml({
      origin: publicUrl.origin,
      tokenTtlSeconds: config.externalAuthTokenTtlSeconds,
    }));
  });
  app.get('/docs/external-auth.json', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.json(buildExternalAuthGuideContract({
      origin: publicUrl.origin,
      tokenTtlSeconds: config.externalAuthTokenTtlSeconds,
    }));
  });

  registerOAuthRoutes(app, {
    accounts,
    config,
    externalApplications,
    externalIdentity,
    readExternalPrincipal,
    readOAuthClientCredentials,
    recordAudit,
    renderAppLoginErrorHtml,
    sessions,
  });

  app.post('/api/client-experience', clientExperienceLimiter, requireConsoleRequest, (req, res) => {
    const event = normalizeClientExperience(req.body);
    if (!event) {
      return res.status(400).json({ error: '体验事件格式无效。', code: 'INVALID_CLIENT_EXPERIENCE' });
    }
    metrics.recordClientExperience(event);
    console.info(JSON.stringify({
      logType: 'client_experience',
      requestId: req.requestId,
      ...event,
    }));
    return res.status(202).json({ accepted: true });
  });

  app.get('/.well-known/assetlinks.json', (req, res) => {
    const fingerprints = config.androidAppCertFingerprints || [];
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json(fingerprints.length === 0 ? [] : [{
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: config.androidAppPackage,
        sha256_cert_fingerprints: fingerprints,
      },
    }]);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'admin-console' });
  });

  app.get('/api/livez', (req, res) => {
    res.json({ status: 'ok', service: 'admin-console' });
  });

  app.get('/api/readyz', async (req, res) => {
    try {
      const ready = Boolean(await readinessCheck());
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', service: 'admin-console' });
    } catch {
      res.status(503).json({ status: 'not-ready', service: 'admin-console' });
    }
  });

  app.get('/api/public/android/download', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const downloadBase = `${String(config.androidReleaseDownloadBaseUrl || 'https://7n.pxyb.cn').replace(/\/$/, '')}/android/`;
      const response = await fetchImpl(`${downloadBase}latest.json`, {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Android manifest unavailable');
      const manifest = await response.json();
      const apkUrl = new URL(manifest.apkUrl);
      const allowedBase = new URL(downloadBase);
      if (apkUrl.protocol !== 'https:' || apkUrl.origin !== allowedBase.origin
        || !apkUrl.pathname.startsWith(allowedBase.pathname) || !apkUrl.pathname.endsWith('.apk')
        || apkUrl.username || apkUrl.password) {
        throw new Error('Invalid Android download URL');
      }
      return res.redirect(302, apkUrl.href);
    } catch {
      return res.status(503).type('text/plain').send('安卓安装包暂时无法下载，请稍后重试。');
    }
  });

  app.get('/api/public/status', async (req, res, next) => {
    try {
      const [status, activeIncidents, blackbox] = await Promise.all([
        operations.getStatus(),
        store.listIncidents({ status: 'open,acknowledged', limit: 100 }),
        readBlackboxStatus({ hours: 1, limit: 240 }),
      ]);
      const monitored = (status.services || []).filter((service) => service.state !== 'unmonitored');
      const generatedAt = new Date().toISOString();
      const staleAfterMs = Math.max((config.monitorIntervalMs || 30000) * 3, 60000);
      const services = (status.services || []).map((service) => ({
        id: service.id,
        name: service.shortName || service.name,
        category: service.category,
        state: service.state,
        checkedAt: service.checkedAt || null,
        stale: !service.checkedAt || Date.now() - Date.parse(service.checkedAt) > staleAfterMs,
      }));
      const stale = services.some((service) => service.state !== 'unmonitored' && service.stale);
      const unhealthy = monitored.filter((service) => ['degraded', 'offline'].includes(service.state));
      const serviceOverall = monitored.length === 0 || stale
        ? 'unknown'
        : unhealthy.length === 0 ? 'operational' : unhealthy.length === monitored.length ? 'outage' : 'degraded';
      let overall = serviceOverall === 'operational' && activeIncidents.length > 0
        ? 'degraded'
        : serviceOverall;
      if (blackbox.observed && blackbox.overall === 'unknown' && overall !== 'outage') overall = 'unknown';
      if (blackbox.observed && blackbox.overall === 'outage') overall = 'outage';
      if (blackbox.observed && blackbox.overall === 'degraded' && overall === 'operational') overall = 'degraded';
      return res.json({
        platformName: registry.platformName,
        overall,
        generatedAt,
        stale: stale || (blackbox.observed && blackbox.overall === 'unknown'),
        services,
        blackbox: {
          observed: blackbox.observed,
          overall: blackbox.overall,
          latest: blackbox.latest.map((sample) => ({
            probeId: sample.probeId,
            targetId: sample.targetId,
            state: sample.state,
            recordedAt: sample.recordedAt,
            stale: sample.stale,
          })),
        },
        incidents: activeIncidents.map((incident) => ({
          id: incident.id,
          state: incident.status,
          severity: incident.severity,
          serviceId: incident.serviceId || null,
          openedAt: incident.openedAt,
          updatedAt: incident.lastSeenAt,
        })),
      });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/metrics', async (req, res) => {
    const authorization = String(req.get('authorization') || '');
    if (!config.metricsToken || !secureTokenEqual(authorization, `Bearer ${config.metricsToken}`)) {
      return res.status(401).json({ error: '指标访问凭据无效。', code: 'METRICS_UNAUTHORIZED' });
    }
    res.type(metrics.contentType);
    return res.send(await metrics.render());
  });

  const { loginLimiter, qrCreateLimiter, webLoginLimiter, qrApprovalLimiter } = registerAuthRoutes(app, {
    accounts,
    authUser,
    clearSessionCookies,
    config,
    deviceSecurity,
    fetchImpl,
    isAndroidAppRequest,
    issueAuthenticatedSession,
    nativeIntegrityAllowed,
    nativeLoginProof,
    passkeys,
    publicUrl,
    readSession,
    recordAudit,
    recordLoginFailure,
    requestDeviceId,
    requireConsoleRequest,
    risk,
    sendRiskResponse,
    sessionCookieOptions,
    sessions,
    strongFactorEnabled,
    upgradePasswordHashAfterLogin,
  });

  registerQrLoginRoutes(app, {
    URLSearchParams,
    accounts,
    browserQrResponse,
    clearQrBrowserVerifier,
    config,
    isAndroidAppRequest,
    issueAuthenticatedSession,
    nativeLoginProof,
    publicUrl,
    qrApprovalLimiter,
    qrCreateLimiter,
    qrLoginCookieName,
    qrLoginCookieOptions,
    qrLogins,
    readQrBrowserVerifier,
    requestDeviceId,
    requireConsoleRequest,
    strongFactorEnabled,
    validQrRequestId,
  });

  registerWebLoginRoutes(app, {
    accounts,
    config,
    isAndroidAppRequest,
    issueSessionCookie,
    normalizeWebLoginRedirect,
    publicUrl,
    readSession,
    recordAudit,
    requireConsoleRequest,
    sessions,
    strongFactorEnabled,
    webLoginLimiter,
    webLoginTickets,
  });

  registerLogoutRoute(app, {
    clearSessionCookies,
    config,
    readSession,
    readSessionToken,
    recordAudit,
    requireConsoleRequest,
  });

  const releaseCallbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 240,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '发布回调请求过多。', code: 'RELEASE_CALLBACK_RATE_LIMITED' },
  });

  app.post('/api/releases/callback', releaseCallbackLimiter, async (req, res, next) => {
    if (!config.releaseCallbackToken) {
      return res.status(503).json({ error: '发布回调尚未配置。', code: 'RELEASE_CALLBACK_NOT_CONFIGURED' });
    }
    const authorization = String(req.get('authorization') || '');
    if (!secureTokenEqual(authorization, `Bearer ${config.releaseCallbackToken}`)) {
      return res.status(401).json({ error: '发布回调凭据无效。', code: 'RELEASE_CALLBACK_UNAUTHORIZED' });
    }
    try {
      const record = await releases.acceptCallback(req.body);
      return res.status(202).json({ accepted: true, id: record.id, status: record.status });
    } catch (error) {
      if (error instanceof ReleaseOperationError) {
        return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      }
      next(error);
      return undefined;
    }
  });

  app.use('/api', async (req, res, next) => {
    if (config.authDisabled) {
      req.consoleUser = { username: 'local-admin', role: 'super_admin' };
      req.consoleSession = { sub: 'local-admin', role: 'super_admin', nonce: 'local-development-session' };
      return next();
    }
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: '请先登录。', code: 'UNAUTHORIZED' });
    const account = await accounts.findAccount(session.sub);
    if (!account?.active) {
      await sessions.revoke(readSessionToken(req));
      clearSessionCookies(res, config);
      return res.status(401).json({ error: '当前账号已经停用。', code: 'ACCOUNT_DISABLED' });
    }
    if (config.requireMfa && !strongFactorEnabled(account)) {
      await sessions.revoke(readSessionToken(req));
      clearSessionCookies(res, config);
      return res.status(403).json({ error: '当前账号必须先启用多因素验证。', code: 'MFA_ENROLLMENT_REQUIRED' });
    }
    req.consoleSession = session;
    req.consoleUser = { username: account.username, role: account.role };
    req.consoleAccount = account;
    return next();
  });

  registerExternalAppRoutes(app, {
    config,
    externalApplications,
    fetchImpl,
    googleAccounts,
    isAndroidAppRequest,
    publicUrl,
    recordAudit,
    requireConsoleRequest,
    requireRole,
    webLoginTickets,
  });

  registerQrApprovalRoutes(app, {
    appQrResponse,
    config,
    passkeys,
    qrApprovalLimiter,
    qrLogins,
    recordAudit,
    requireConsoleRequest,
    userAgentLabel,
    validQrRequestId,
  });

  registerReauthenticationRoutes(app, {
    loginLimiter,
    passkeys,
    readSessionToken,
    recordAudit,
    requireConsoleRequest,
    sessions,
    verifyReauthentication,
  });

  app.get('/api/services', (req, res) => {
    res.json({ platformName: registry.platformName, services: registry.services });
  });

  app.get('/api/services/status', async (req, res, next) => {
    try {
      const force = req.query.refresh === '1';
      const status = await operations.getStatus({ force });
      res.json({ platformName: registry.platformName, ...status });
    } catch (error) {
      next(error);
    }
  });

  registerAuthenticatorVaultRoutes(app, { vaults: authenticatorVaultStore || createMemoryAuthenticatorVaultStore(), requireConsoleRequest, recordAudit });

  registerNotificationRoutes(app, {
    notificationManagement,
    recordAudit,
    requireConsoleRequest,
    requireRole,
  });

  registerOperationsRoutes(app, {
    changeCalendar,
    configurations,
    diagnostics,
    operationalSearch,
    operations,
    readBlackboxStatus,
    recordAudit,
    registry,
    requireConsoleRequest,
    requireRole,
    sendConfigurationError,
    slos,
    store,
    tasks,
  });

  registerSecurityRoutes(app, {
    accounts,
    clearSessionCookies,
    config,
    confirmSensitiveAuthentication,
    passkeys,
    recordAudit,
    requireConsoleRequest,
    requireRole,
    sessionPolicyForRequest,
    sessions,
  });

  registerReleaseRoutes(app, {
    recordAudit,
    releases,
    requireConsoleRequest,
    requireRole,
    verifyReauthentication,
  });

  registerAcrRoutes(app, {
    acr,
    recordAudit,
    requireConsoleRequest,
    requireRole,
  });

  registerBackupRoutes(app, {
    backups,
    config,
    confirmSensitiveAuthentication,
    operations,
    recordAudit,
    requireBackupDownloadAccess,
    requireConsoleRequest,
    requireRole,
    safeDownloadName,
    sendBackupError,
    verifyReauthentication,
  });

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { maxAge: '1y', immutable: true, index: false }));
    app.get('*splat', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: '请求的资源不存在。', code: 'NOT_FOUND', requestId: req.requestId });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof DeviceSecurityError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    // Parser errors retain raw bodies and snippets in their messages, including login or refresh credentials.
    if (['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported', 'request.aborted', 'request.size.invalid'].includes(error.type)) {
      return res.status([400, 413, 415].includes(error.status) ? error.status : 400)
        .json({ error: '请求正文格式、编码或大小不符合要求。', code: 'INVALID_REQUEST_BODY', requestId: req.requestId });
    }
    console.error(`[${req.requestId}]`, error);
    operations.recordAudit({
      actor: req.consoleUser?.username || 'anonymous',
      action: 'platform.request_failed',
      outcome: 'failure',
      targetType: 'request',
      targetId: req.path,
      ...requestAuditFields(req),
      details: { method: req.method, error: String(error.message || error).slice(0, 200) },
    }).catch(() => {});
    return res.status(500).json({ error: '管理门户内部错误。', code: 'INTERNAL_ERROR', requestId: req.requestId });
  });

  return app;
}
