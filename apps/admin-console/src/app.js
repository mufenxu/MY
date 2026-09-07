import { renderAppLoginTransitionHtml, renderAppLoginErrorHtml } from './app-login-pages.js';
import { registerExternalAppRoutes } from './routes/external-app-routes.js';
import { registerNotificationRoutes } from './routes/notification-routes.js';
import { registerOperationsRoutes } from './routes/operations-routes.js';
import { registerSecurityRoutes } from './routes/security-routes.js';
import { registerReleaseRoutes } from './routes/release-routes.js';
import { registerBackupRoutes } from './routes/backup-routes.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import QRCode from 'qrcode';
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
import { BackupOperationError, createBackupManager, createBackupRunnerClient } from './backups.js';
import { verifyTurnstileToken } from './bot-challenge.js';
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
  return String(req.get('user-agent') || '').startsWith(ANDROID_APP_USER_AGENT_PREFIX);
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
  fetchImpl = fetch,
  sessionRegistry = null,
  readinessCheck = async () => true,
  backupManager = null,
  operationsStore = null,
  releaseStore = null,
  operationsManager = null,
  releaseManager = null,
  notificationManager = null,
  authStore = null,
  authRiskStore = null,
  qrLoginStore = null,
  webLoginTicketStore = null,
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
  const registry = loadServiceRegistry(config.registryPath);
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
    return sessions.verify(readSessionToken(req));
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

  function appQrResponse(record, role) {
    const androidPasskeyConfigured = (config.androidAppCertFingerprints || []).length > 0;
    const clientKind = record.clientKind || 'browser';
    const confirmationMethod = clientKind === 'android' || role === 'super_admin'
      ? (androidPasskeyConfigured ? 'passkey' : 'unavailable')
      : 'biometric';
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

  async function verifyReauthentication(req) {
    if (config.authDisabled) return true;
    const account = await accounts.findAccount(req.consoleUser?.username);
    if (!account?.active || !await verifyPassword(String(req.body?.password || ''), account.passwordHash)) return false;
    if (!account.totpEnabled) return true;
    return (await accounts.consumeSecondFactor(account.username, {
      totp: req.body?.totp,
      recoveryCode: req.body?.recoveryCode,
    })).valid;
  }

  async function confirmSensitiveAuthentication(req, res, action) {
    if (await verifyReauthentication(req)) return true;
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
    const policy = options.policy || sessionPolicyForRequest(req, config);
    const sessionKind = options.sessionKind || (isAndroidAppRequest(req) ? 'native_app' : 'browser');
    const deviceId = options.deviceId || requestDeviceId(req);
    const deviceName = options.deviceName || requestDeviceName(req);
    const now = Date.now();
    const token = await sessions.issue({
      username: account.username,
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
      now,
    });
    res.cookie(sessionCookieName(config.isProduction), token, sessionCookieOptions(config, policy.ttlHours));
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
    return { now, policy };
  }

  async function issueAuthenticatedSession(req, res, account, authenticationMethod, extra = {}) {
    const { now, policy } = await issueSessionCookie(req, res, account, authenticationMethod);
    return res.json({
      authenticated: true,
      authDisabled: false,
      totpRequired: account.totpEnabled,
      mfaRequired: Boolean(config.requireMfa),
      user: authUser(account),
      session: {
        expiresAt: new Date(now + policy.ttlHours * 60 * 60 * 1000).toISOString(),
        idleTimeoutMinutes: policy.idleMinutes,
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
  app.locals.verifyConsoleSession = async (token, now) => {
    const session = await sessions.verify(token, now);
    if (!session) return null;
    const account = await accounts.findAccount(session.sub);
    if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) return null;
    return { ...session, role: account.role };
  };
  app.locals.onConsoleSessionRevoked = () => {};
  app.locals.onConsoleSessionChanged = () => {};
  app.locals.onConsoleSessionsChanged = () => {};
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
  app.use(express.json({ limit: '32kb' }));
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

  app.get('/api/auth/status', async (req, res) => {
    if (config.authDisabled) {
      return res.json({ authenticated: true, authDisabled: true, totpRequired: false, user: { username: 'local-admin', role: 'super_admin', totpEnabled: false } });
    }
    const session = await readSession(req);
    const account = session ? await accounts.findAccount(session.sub) : null;
    const mfaCompliant = !config.requireMfa || strongFactorEnabled(account);
    return res.json({
      authenticated: Boolean(session && account?.active && mfaCompliant),
      authDisabled: false,
      totpRequired: Boolean(account?.totpEnabled),
      mfaRequired: Boolean(config.requireMfa),
      mfaEnrollmentRequired: Boolean(account?.active && !mfaCompliant),
      passkeySupported: true,
      androidPasskeySupported: (config.androidAppCertFingerprints || []).length > 0,
      botProtectionConfigured: Boolean(config.turnstileSiteKey && config.turnstileSecretKey),
      user: session && account?.active && mfaCompliant ? authUser(account) : null,
    });
  });

  const loginLimiter = rateLimit({
    windowMs: config.loginWindowMinutes * 60 * 1000,
    limit: Math.max(config.loginMaxAttempts * 3, 30),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: '登录尝试过多，请稍后再试。', code: 'LOGIN_RATE_LIMITED' },
  });
  const qrCreateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '二维码创建过于频繁，请稍后再试。', code: 'QR_LOGIN_RATE_LIMITED' },
  });
  const webLoginLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Web login ticket requests are too frequent.', code: 'WEB_LOGIN_RATE_LIMITED' },
  });
  const qrApprovalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '扫码确认请求过于频繁，请稍后再试。', code: 'QR_LOGIN_RATE_LIMITED' },
  });

  app.post('/api/auth/login', loginLimiter, requireConsoleRequest, async (req, res) => {
    if (config.authDisabled) {
      return res.json({
        authenticated: true,
        authDisabled: true,
        totpRequired: false,
        user: { username: 'local-admin', role: 'super_admin', totpEnabled: false },
      });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const riskState = await risk.assess({ username, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    if (riskState.challengeRequired) {
      const challenge = await verifyTurnstileToken({
        token: req.body?.challengeToken,
        secretKey: config.turnstileSecretKey,
        remoteIp: req.ip,
        expectedHostname: publicUrl.hostname,
        fetchImpl,
      });
      if (!challenge.valid) {
        return res.status(401).json({
          error: '请先完成人机验证。',
          code: 'BOT_CHALLENGE_REQUIRED',
          details: { challengeRequired: true, turnstileSiteKey: config.turnstileSiteKey },
        });
      }
    }

    const account = await accounts.findAccount(username);
    const passwordHash = account?.passwordHash || config.adminPasswordHash;
    const passwordValid = await verifyPassword(password, passwordHash);
    if (!account?.active || !passwordValid) {
      return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_credentials'));
    }
    if (config.requireMfa && !account.totpEnabled) {
      if (account.passkeyCount > 0) {
        return res.status(401).json({
          error: '该账号必须使用 Passkey 登录。',
          code: 'PASSKEY_REQUIRED',
        });
      }
      if (!req.body?.enrollmentCode) {
        const enrollment = await accounts.beginTotpEnrollment(username);
        await recordAudit(req, {
          actor: username,
          action: 'security.totp_enrollment_started',
          targetType: 'account',
          targetId: username,
          details: { requiredByPolicy: true },
        });
        return res.status(428).json({
          error: '首次登录需要绑定动态验证。',
          code: 'MFA_ENROLLMENT_REQUIRED',
          details: { enrollment },
        });
      }
      const enrollment = await accounts.confirmTotpEnrollment(username, req.body.enrollmentCode);
      if (!enrollment) {
        return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_mfa_enrollment'));
      }
      await recordAudit(req, {
        actor: username,
        action: 'security.totp_enabled',
        targetType: 'account',
        targetId: username,
        details: { requiredByPolicy: true },
      });
      await upgradePasswordHashAfterLogin(username, account.passwordHash, password);
      return issueAuthenticatedSession(
        req,
        res,
        { ...account, totpEnabled: true, recoveryCodesRemaining: enrollment.recoveryCodes.length },
        'password_totp_enrollment',
        { recoveryCodes: enrollment.recoveryCodes },
      );
    }
    if (account.totpEnabled && !req.body?.totp && !req.body?.recoveryCode) {
      return res.status(401).json({
        error: '请输入动态验证码或恢复码。',
        code: 'SECOND_FACTOR_REQUIRED',
        details: { totpRequired: true, recoveryCodeAllowed: account.recoveryCodesRemaining > 0 },
      });
    }
    const secondFactor = await accounts.consumeSecondFactor(username, {
      totp: req.body?.totp,
      recoveryCode: req.body?.recoveryCode,
    });
    if (!secondFactor.valid) {
      return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_second_factor'));
    }
    await upgradePasswordHashAfterLogin(username, account.passwordHash, password);
    return issueAuthenticatedSession(req, res, account, secondFactor.method === 'none' ? 'password' : `password_${secondFactor.method}`);
  });

  app.post('/api/auth/passkey/options', loginLimiter, requireConsoleRequest, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const riskState = await risk.assess({ username, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    if (riskState.challengeRequired) {
      const challenge = await verifyTurnstileToken({
        token: req.body?.challengeToken,
        secretKey: config.turnstileSecretKey,
        remoteIp: req.ip,
        expectedHostname: publicUrl.hostname,
        fetchImpl,
      });
      if (!challenge.valid) {
        return res.status(401).json({
          error: '请先完成人机验证。',
          code: 'BOT_CHALLENGE_REQUIRED',
          details: { challengeRequired: true, turnstileSiteKey: config.turnstileSiteKey },
        });
      }
    }
    const result = await passkeys.authenticationOptions(username);
    if (!result) {
      await recordLoginFailure(req, username, 'passkey_unavailable');
      return res.status(400).json({ error: '该账号没有可用的 Passkey。', code: 'PASSKEY_UNAVAILABLE' });
    }
    return res.json(result);
  });

  app.post('/api/auth/passkey/verify', loginLimiter, requireConsoleRequest, async (req, res) => {
    const requestedUsername = String(req.body?.username || '').trim();
    const riskState = await risk.assess({ username: requestedUsername, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    try {
      const verification = await passkeys.verifyAuthentication(requestedUsername, req.body);
      const username = verification.username || requestedUsername;
      const account = verification.verified ? await accounts.findAccount(username) : null;
      if (!verification.verified || !account?.active) {
        return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_passkey'));
      }
      return issueAuthenticatedSession(req, res, account, 'passkey');
    } catch {
      return sendRiskResponse(res, await recordLoginFailure(req, requestedUsername, 'invalid_passkey'));
    }
  });

  app.post('/api/auth/qr/requests', qrCreateLimiter, requireConsoleRequest, async (req, res, next) => {
    if (config.authDisabled) {
      return res.status(400).json({ error: '本地免登录模式不需要扫码登录。', code: 'QR_LOGIN_DISABLED' });
    }
    try {
      const clientKind = String(req.body?.clientKind || 'browser');
      const androidRequester = clientKind === 'android';
      if (!['browser', 'android'].includes(clientKind)) {
        return res.status(400).json({ error: '二维码请求来源无效。', code: 'QR_LOGIN_INVALID_CLIENT' });
      }
      if (androidRequester && !isAndroidAppRequest(req)) {
        return res.status(403).json({ error: 'Android 登录二维码仅允许官方 App 创建。', code: 'QR_LOGIN_INVALID_CLIENT' });
      }
      if (androidRequester && String(req.body?.confirmationMethod || 'passkey') !== 'passkey') {
        return res.status(400).json({ error: '二维码确认方式无效。', code: 'QR_LOGIN_INVALID_CONFIRMATION' });
      }
      if (androidRequester && (config.androidAppCertFingerprints || []).length === 0) {
        return res.status(503).json({ error: 'Android Passkey 尚未配置应用签名证书。', code: 'QR_ANDROID_PASSKEY_UNAVAILABLE' });
      }
      const requesterDeviceId = androidRequester ? requestDeviceId(req) : '';
      if (androidRequester && !requesterDeviceId) {
        return res.status(400).json({ error: 'Android 登录二维码缺少设备标识。', code: 'QR_LOGIN_DEVICE_MISSING' });
      }
      const created = await qrLogins.create({
        browserIp: req.ip,
        browserUserAgent: req.get('user-agent'),
        clientKind,
        requesterDeviceId,
      });
      const loginUrl = new URL('/app/qr-login', publicUrl.origin);
      loginUrl.searchParams.set('requestId', created.requestId);
      loginUrl.hash = new URLSearchParams({ scanToken: created.scanToken }).toString();
      const responseBody = {
        ...browserQrResponse(created.record),
        clientKind,
        qrDataUrl: await QRCode.toDataURL(loginUrl.toString(), {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 280,
        }),
      };
      if (androidRequester) {
        responseBody.requesterVerifier = created.browserVerifier;
      } else {
        res.cookie(
          qrLoginCookieName(config, created.requestId),
          created.browserVerifier,
          qrLoginCookieOptions(config),
        );
      }
      return res.status(201).json(responseBody);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/auth/qr/requests/:id', async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const record = await qrLogins.getForBrowser(requestId, readQrBrowserVerifier(req, requestId));
    if (!record) return res.status(410).json({ error: '二维码已过期，请刷新后重试。', code: 'QR_LOGIN_EXPIRED' });
    return res.json(browserQrResponse(record));
  });

  app.post('/api/auth/qr/requests/:id/status', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const requesterVerifier = String(req.body?.requesterVerifier || '');
    const record = await qrLogins.getForRequester(requestId, requesterVerifier, requestDeviceId(req));
    if (!record) return res.status(410).json({ error: '二维码已过期，请重新发起登录。', code: 'QR_LOGIN_EXPIRED' });
    return res.json(browserQrResponse(record));
  });

  app.post('/api/auth/qr/requests/:id/consume', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const requesterVerifier = String(req.body?.requesterVerifier || '');
    let record = await qrLogins.getForRequester(requestId, requesterVerifier, requestDeviceId(req));
    const androidRequester = Boolean(record);
    const browserVerifier = androidRequester ? requesterVerifier : readQrBrowserVerifier(req, requestId);
    if (!record) record = await qrLogins.getForBrowser(requestId, browserVerifier);
    if (!record) return res.status(410).json({ error: '二维码已过期，请刷新后重试。', code: 'QR_LOGIN_EXPIRED' });
    if (record.status !== 'approved') {
      return res.status(409).json({ error: 'App 尚未完成登录确认。', code: 'QR_LOGIN_NOT_APPROVED', details: { status: record.status } });
    }
    const account = await accounts.findAccount(record.approvedBy);
    if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) {
      return res.status(403).json({ error: '批准账号当前不可用于登录。', code: 'QR_LOGIN_ACCOUNT_UNAVAILABLE' });
    }
    const consumed = await qrLogins.consume(
      requestId,
      browserVerifier,
      androidRequester ? requestDeviceId(req) : '',
    );
    if (!consumed) return res.status(409).json({ error: '二维码已被使用。', code: 'QR_LOGIN_ALREADY_USED' });
    if (!androidRequester) clearQrBrowserVerifier(res, requestId);
    const authenticationMethod = androidRequester
      ? `qr_android_${consumed.confirmationMethod || 'biometric'}`
      : `qr_app_${consumed.confirmationMethod || 'biometric'}`;
    return issueAuthenticatedSession(req, res, account, authenticationMethod);
  });

  app.delete('/api/auth/qr/requests/:id', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const cancelled = await qrLogins.cancel(requestId, readQrBrowserVerifier(req, requestId));
    clearQrBrowserVerifier(res, requestId);
    return res.json({ cancelled: Boolean(cancelled) });
  });

  app.post('/api/auth/web-login-tickets', webLoginLimiter, requireConsoleRequest, async (req, res, next) => {
    if (config.authDisabled) {
      return res.status(400).json({ error: 'Web login tickets are disabled in local bypass mode.', code: 'WEB_LOGIN_DISABLED' });
    }
    if (!isAndroidAppRequest(req)) {
      return res.status(403).json({ error: 'Web login tickets can only be created by the Android app.', code: 'WEB_LOGIN_ANDROID_REQUIRED' });
    }
    try {
      const session = await readSession(req);
      if (!session) return res.status(401).json({ error: 'Please sign in first.', code: 'UNAUTHORIZED' });
      const account = await accounts.findAccount(session.sub);
      if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) {
        return res.status(403).json({ error: 'Current account cannot create web login tickets.', code: 'WEB_LOGIN_ACCOUNT_UNAVAILABLE' });
      }
      const redirect = normalizeWebLoginRedirect(req.body?.redirect, publicUrl);
      if (!redirect) {
        return res.status(400).json({ error: 'Web login redirect is invalid.', code: 'WEB_LOGIN_REDIRECT_INVALID' });
      }
      const created = await webLoginTickets.create({
        username: account.username,
        role: account.role,
        redirect,
        appSessionNonce: session.nonce,
        appIp: req.ip,
        appUserAgent: req.get('user-agent'),
      });
      const loginUrl = new URL('/console/app-login', publicUrl.origin);
      loginUrl.searchParams.set('ticket', created.ticket);
      loginUrl.searchParams.set('redirect', redirect);
      await recordAudit(req, {
        actor: account.username,
        action: 'auth.web_login_ticket.create',
        targetType: 'session',
        targetId: session.nonce || '',
        details: { redirect },
      });
      return res.status(201).json({
        loginUrl: loginUrl.toString(),
        redirect,
        expiresAt: created.record.expiresAt,
      });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/app-login', webLoginLimiter, async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'");
    const ticket = String(req.query?.ticket || '');
    const requestedRedirect = normalizeWebLoginRedirect(req.query?.redirect, publicUrl);
    if (!ticket || !requestedRedirect) {
      return res.status(400).send(renderAppLoginErrorHtml('链接无效', '免密登录链接不完整或已失效。'));
    }
    try {
      const consumed = await webLoginTickets.consume(ticket);
      if (!consumed) {
        return res.status(410).send(renderAppLoginErrorHtml('登录凭据已过期', '该免密登录凭据已过期或已被使用，请返回安卓 App 重新打开。'));
      }
      if (consumed.redirect !== requestedRedirect) {
        return res.status(400).send(renderAppLoginErrorHtml('跳转目标无效', '安全重定向目标校验失败。'));
      }
      const account = await accounts.findAccount(consumed.username);
      if (!account?.active || (config.requireMfa && !strongFactorEnabled(account))) {
        return res.status(403).send(renderAppLoginErrorHtml('无权访问', '当前账号已被禁用或尚未满足多因素认证要求。'));
      }
      const embeddedWebSession = consumed.sessionKind === 'embedded_web';
      await issueSessionCookie(req, res, account, 'android_web_ticket', embeddedWebSession ? {
        policy: { ttlHours: config.sessionTtlHours, idleMinutes: Math.min(config.sessionIdleMinutes, 5) },
        sessionKind: 'embedded_web',
        parentSessionNonce: consumed.appSessionNonce,
        replaceExisting: true,
      } : { sessionKind: 'browser' });
      await recordAudit(req, {
        actor: account.username,
        action: 'auth.web_login_ticket.consume',
        targetType: 'account',
        targetId: account.username,
        details: { redirect: consumed.redirect },
      });
      if (req.query?.direct === '1' || req.get('x-direct-redirect') === '1') {
        return res.redirect(303, consumed.redirect);
      }
      res.setHeader('Location', consumed.redirect);
      return res.send(renderAppLoginTransitionHtml(consumed.redirect));
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/auth/logout', requireConsoleRequest, async (req, res) => {
    const token = readSessionToken(req);
    const session = await sessions.verify(token);
    await sessions.revoke(token);
    await app.locals.onConsoleSessionRevoked(token);
    clearSessionCookies(res, config);
    await recordAudit(req, {
      actor: session?.sub || 'anonymous',
      action: 'auth.logout',
      targetType: 'session',
      targetId: session?.nonce || '',
    });
    res.json({ authenticated: false });
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

  app.post('/api/auth/qr/requests/:id/scan', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    const scanToken = String(req.body?.scanToken || '');
    if (!requestId || scanToken.length < 32 || scanToken.length > 128) {
      return res.status(400).json({ error: '二维码内容无效。', code: 'QR_LOGIN_INVALID' });
    }
    const record = await qrLogins.scan(requestId, scanToken, req.consoleUser.username);
    if (!record) return res.status(410).json({ error: '二维码已失效或已由其他账号扫描。', code: 'QR_LOGIN_UNAVAILABLE' });
    await recordAudit(req, {
      action: 'auth.qr_scan',
      targetType: 'qr_login',
      targetId: requestId,
      details: { browserIp: record.browserIp, browser: userAgentLabel(record.browserUserAgent) },
    });
    return res.json(appQrResponse(record, req.consoleUser.role));
  });

  app.post('/api/auth/qr/requests/:id/passkey/options', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const record = await qrLogins.getForActor(requestId, req.consoleUser.username);
    if (!record || record.status !== 'scanned') {
      return res.status(409).json({ error: '扫码请求当前不可确认。', code: 'QR_LOGIN_NOT_SCANNED' });
    }
    const androidPasskeyRequest = record.clientKind === 'android';
    if (!androidPasskeyRequest && req.consoleUser.role !== 'super_admin') {
      return res.status(400).json({ error: '当前账号使用设备生物识别确认。', code: 'QR_PASSKEY_NOT_REQUIRED' });
    }
    if ((config.androidAppCertFingerprints || []).length === 0) {
      return res.status(503).json({ error: 'Android Passkey 尚未配置应用签名证书。', code: 'QR_ANDROID_PASSKEY_UNAVAILABLE' });
    }
    const result = await passkeys.authenticationOptions(req.consoleUser.username);
    if (!result) {
      return res.status(403).json({ error: '超级管理员必须先绑定 Passkey 才能使用扫码登录。', code: 'QR_PASSKEY_REQUIRED' });
    }
    return res.json(result);
  });

  app.post('/api/auth/qr/requests/:id/approve', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const record = await qrLogins.getForActor(requestId, req.consoleUser.username);
    if (!record || record.status !== 'scanned') {
      return res.status(409).json({ error: '扫码请求当前不可确认。', code: 'QR_LOGIN_NOT_SCANNED' });
    }

    const androidPasskeyRequest = record.clientKind === 'android';
    let confirmationMethod = 'biometric';
    if (androidPasskeyRequest || req.consoleUser.role === 'super_admin') {
      if ((config.androidAppCertFingerprints || []).length === 0) {
        return res.status(503).json({ error: 'Android Passkey 尚未配置应用签名证书。', code: 'QR_ANDROID_PASSKEY_UNAVAILABLE' });
      }
      try {
        const verification = await passkeys.verifyAuthentication(req.consoleUser.username, req.body?.passkey);
        if (!verification.verified) throw new Error('Passkey verification failed.');
        confirmationMethod = 'passkey';
      } catch {
        await recordAudit(req, {
          action: 'auth.qr_approve',
          outcome: 'failure',
          targetType: 'qr_login',
          targetId: requestId,
          details: { reason: 'invalid_passkey' },
        });
        return res.status(403).json({ error: 'Passkey 验证失败，未批准网页登录。', code: 'QR_PASSKEY_INVALID' });
      }
    } else if (req.body?.localConfirmation !== true) {
      return res.status(400).json({ error: '请先完成设备生物识别。', code: 'QR_BIOMETRIC_REQUIRED' });
    }

    const approved = await qrLogins.approve(requestId, req.consoleUser.username, confirmationMethod);
    if (!approved) return res.status(409).json({ error: '扫码请求状态已变化，请重新扫描。', code: 'QR_LOGIN_STATE_CHANGED' });
    await recordAudit(req, {
      action: 'auth.qr_approve',
      targetType: 'qr_login',
      targetId: requestId,
      details: { confirmationMethod, browserIp: approved.browserIp, browser: userAgentLabel(approved.browserUserAgent) },
    });
    return res.json({ approved: true, ...appQrResponse(approved, req.consoleUser.role) });
  });

  app.post('/api/auth/qr/requests/:id/reject', qrApprovalLimiter, requireConsoleRequest, async (req, res) => {
    const requestId = validQrRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ error: '二维码请求编号无效。', code: 'QR_LOGIN_INVALID' });
    const rejected = await qrLogins.reject(requestId, req.consoleUser.username);
    if (!rejected) return res.status(409).json({ error: '扫码请求状态已变化。', code: 'QR_LOGIN_STATE_CHANGED' });
    await recordAudit(req, {
      action: 'auth.qr_reject',
      targetType: 'qr_login',
      targetId: requestId,
    });
    return res.json({ rejected: true });
  });

  app.post('/api/auth/reauth', loginLimiter, requireConsoleRequest, requireRole('super_admin'), async (req, res) => {
    if (!await verifyReauthentication(req)) {
      await recordAudit(req, {
        action: 'auth.reauthenticate',
        outcome: 'failure',
        targetType: 'session',
        targetId: req.consoleSession?.nonce || '',
        details: { reason: 'invalid_credentials' },
      });
      return res.status(403).json({ error: '管理员二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
    }
    const sessionToken = readSessionToken(req);
    const expiresAt = await sessions.markReauthenticated(sessionToken);
    if (!expiresAt) {
      return res.status(401).json({ error: '当前会话已失效。', code: 'UNAUTHORIZED' });
    }
    await app.locals.onConsoleSessionChanged(sessionToken);
    await recordAudit(req, {
      action: 'auth.reauthenticate',
      targetType: 'session',
      targetId: req.consoleSession?.nonce || '',
    });
    return res.json({ reauthenticated: true, expiresAt: new Date(expiresAt * 1000).toISOString() });
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
