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
import { BackupOperationError, createBackupManager, createBackupRunnerClient } from './backups.js';
import { verifyTurnstileToken } from './bot-challenge.js';
import { ConfigurationError, createConfigurationManager } from './configuration-manager.js';
import { createMemoryConfigurationStore } from './configuration-store.js';
import { loadConfig } from './config.js';
import { createStatusMonitor, loadServiceRegistry } from './service-registry.js';
import { createMetrics } from './metrics.js';
import { NotificationManagementError, createNotificationManagementClient } from './notification-management.js';
import { createOperationsCenter } from './operations-center.js';
import { createOperationsNotifier } from './operations-notifier.js';
import { createMemoryOperationsStore } from './operations-store.js';
import { createPasskeyService } from './passkeys.js';
import { ReleaseOperationError, createReleaseService } from './release-service.js';
import { createMemoryReleaseStore } from './release-store.js';
import { createRequestDiagnostics } from './request-diagnostics.js';
import { createTaskCenter } from './task-center.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '..', 'dist');

function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: '/',
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  };
}

function clearSessionCookies(res, config) {
  const options = { ...sessionCookieOptions(config), maxAge: 0 };
  res.clearCookie(sessionCookieName(config.isProduction), options);
  if (config.isProduction) res.clearCookie(SESSION_COOKIE_NAME, options);
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

function safeDownloadName(filename) {
  return String(filename || 'backup.tar.gz').replace(/[^A-Za-z0-9_.-]/g, '_');
}

const ROLE_LEVELS = { viewer: 1, operator: 2, super_admin: 3 };
const INTERNAL_HEALTH_PATHS = new Set(['/api/health', '/api/livez', '/api/readyz']);

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
  configurationStore = null,
  configurationManager = null,
  taskManager = null,
  requestDiagnostics = null,
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
  const publicUrl = new URL(config.publicOrigin || 'http://127.0.0.1');
  const passkeys = createPasskeyService({
    authStore: accounts,
    rpName: config.webauthnRpName || 'MY Platform',
    rpID: config.webauthnRpId || publicUrl.hostname,
    origin: publicUrl.origin,
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
    backupManager: backups,
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
  const diagnostics = requestDiagnostics || createRequestDiagnostics({
    services: registry.services,
    publicOrigin: config.publicOrigin,
    fetchImpl,
    timeoutMs: config.serviceTimeoutMs,
  });

  function readSessionToken(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[sessionCookieName(config.isProduction)] || cookies[SESSION_COOKIE_NAME];
  }

  async function readSession(req) {
    return sessions.verify(readSessionToken(req));
  }

  function sendBackupError(res, error) {
    if (error instanceof BackupOperationError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    throw error;
  }

  function sendNotificationManagementError(res, error) {
    if (error instanceof NotificationManagementError) {
      return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
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

  async function issueAuthenticatedSession(req, res, account, authenticationMethod, extra = {}) {
    const token = await sessions.issue({
      username: account.username,
      role: account.role,
      ttlHours: config.sessionTtlHours,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie(sessionCookieName(config.isProduction), token, sessionCookieOptions(config));
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
    return res.json({
      authenticated: true,
      authDisabled: false,
      totpRequired: account.totpEnabled,
      mfaRequired: Boolean(config.requireMfa),
      user: authUser(account),
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
  app.locals.requestDiagnostics = diagnostics;
  app.locals.authStore = accounts;
  app.locals.authRiskStore = risk;

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
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
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
      const status = await operations.getStatus();
      const monitored = (status.services || []).filter((service) => service.state !== 'unmonitored');
      const activeIncidents = await store.listIncidents({ status: 'open,acknowledged', limit: 100 });
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
      const overall = serviceOverall === 'operational' && activeIncidents.length > 0
        ? 'degraded'
        : serviceOverall;
      return res.json({
        platformName: registry.platformName,
        overall,
        generatedAt,
        stale,
        services,
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
    const username = String(req.body?.username || '').trim();
    const riskState = await risk.assess({ username, ip: req.ip });
    if (riskState.blocked) return sendRiskResponse(res, riskState);
    try {
      const verification = await passkeys.verifyAuthentication(username, req.body);
      const account = verification.verified ? await accounts.findAccount(username) : null;
      if (!verification.verified || !account?.active) {
        return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_passkey'));
      }
      return issueAuthenticatedSession(req, res, account, 'passkey');
    } catch {
      return sendRiskResponse(res, await recordLoginFailure(req, username, 'invalid_passkey'));
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

  app.get('/api/notifications/overview', async (_req, res, next) => {
    try {
      return res.json(await notificationManagement.getOverview());
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/notifications/deliveries', async (req, res, next) => {
    try {
      return res.json(await notificationManagement.listDeliveries({
        status: req.query.status,
        caller: req.query.caller,
        msgType: req.query.msgType,
        page: req.query.page,
        pageSize: req.query.pageSize,
      }));
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  const notificationSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '通知测试或重试操作过于频繁。', code: 'NOTIFICATION_SEND_RATE_LIMITED' },
  });

  app.post('/api/notifications/test', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await notificationManagement.sendTest(req.body || {}, req.consoleUser.username);
      await recordAudit(req, {
        action: 'notification.test_send',
        targetType: 'notification_recipient',
        targetId: String(req.body?.touser || '').slice(0, 64),
        details: { msgType: String(req.body?.msgType || '') },
      });
      return res.status(201).json(result);
    } catch (error) {
      await recordAudit(req, {
        action: 'notification.test_send',
        outcome: 'failure',
        targetType: 'notification_recipient',
        targetId: String(req.body?.touser || '').slice(0, 64),
        details: { code: String(error.code || 'UNKNOWN').slice(0, 80) },
      });
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/notifications/deliveries/:id/retry', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await notificationManagement.retryDelivery(req.params.id, req.consoleUser.username);
      await recordAudit(req, {
        action: 'notification.retry',
        targetType: 'notification_delivery',
        targetId: String(req.params.id || '').slice(0, 128),
      });
      return res.status(201).json(result);
    } catch (error) {
      await recordAudit(req, {
        action: 'notification.retry',
        outcome: 'failure',
        targetType: 'notification_delivery',
        targetId: String(req.params.id || '').slice(0, 128),
        details: { code: String(error.code || 'UNKNOWN').slice(0, 80) },
      });
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/notifications/templates', async (_req, res, next) => {
    try { return res.json(await notificationManagement.listTemplates()); }
    catch (error) { try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; } }
  });

  app.put('/api/notifications/templates/:key', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const result = await notificationManagement.saveTemplate({ ...req.body, key: req.params.key }, req.consoleUser.username);
      await recordAudit(req, { action: 'notification.template_saved', targetType: 'notification_template', targetId: req.params.key });
      return res.json(result);
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.delete('/api/notifications/templates/:key', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      await notificationManagement.deleteTemplate(req.params.key);
      await recordAudit(req, { action: 'notification.template_deleted', targetType: 'notification_template', targetId: req.params.key });
      return res.status(204).end();
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/notifications/jobs', async (req, res, next) => {
    try {
      return res.json(await notificationManagement.listJobs({
        status: req.query.status, caller: req.query.caller, page: req.query.page, pageSize: req.query.pageSize,
      }));
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/notifications/jobs', notificationSendLimiter, requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await notificationManagement.createJob(req.body || {}, req.consoleUser.username);
      await recordAudit(req, { action: 'notification.job_created', targetType: 'notification_job', targetId: result.job?.id || '' });
      return res.status(result.deduplicated ? 200 : 202).json(result);
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/notifications/jobs/:id/cancel', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await notificationManagement.cancelJob(req.params.id, req.consoleUser.username);
      await recordAudit(req, { action: 'notification.job_cancelled', targetType: 'notification_job', targetId: req.params.id });
      return res.json(result);
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/notifications/preferences/:targetId', requireRole('operator'), async (req, res, next) => {
    try { return res.json(await notificationManagement.getPreference(req.params.targetId)); }
    catch (error) { try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; } }
  });

  app.put('/api/notifications/preferences/:targetId', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await notificationManagement.savePreference(req.params.targetId, req.body || {}, req.consoleUser.username);
      await recordAudit(req, { action: 'notification.preference_saved', targetType: 'notification_recipient', targetId: req.params.targetId });
      return res.json(result);
    } catch (error) {
      try { return sendNotificationManagementError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/operations/overview', async (req, res, next) => {
    try {
      if (req.query.refresh === '1') await operations.refresh(true);
      res.json({ platformName: registry.platformName, ...(await operations.getOverview()) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/operations/history', async (req, res, next) => {
    try {
      const serviceId = String(req.query.serviceId || '');
      if (serviceId && !registry.services.some((service) => service.id === serviceId)) {
        return res.status(400).json({ error: '服务标识无效。', code: 'INVALID_SERVICE_ID' });
      }
      const samples = await operations.getHistory({
        serviceId: serviceId || undefined,
        hours: req.query.hours,
        limit: req.query.limit,
      });
      return res.json({ serviceId: serviceId || null, samples });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/incidents', async (req, res, next) => {
    try {
      const incidents = await store.listIncidents({ status: req.query.status, limit: req.query.limit });
      res.json({ incidents });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/incidents/:id/actions', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const action = String(req.body?.action || '');
      const incident = await operations.updateIncident(req.params.id, action, {
        actor: req.consoleUser.username,
        note: req.body?.note,
        assignedTo: req.body?.assignedTo,
        muteMinutes: req.body?.muteMinutes,
      });
      if (!incident) return res.status(404).json({ error: '事件不存在或操作无效。', code: 'INCIDENT_NOT_FOUND' });
      return res.json({ incident });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/audit', async (req, res, next) => {
    try {
      const events = await store.listAudit({
        action: req.query.action,
        actor: req.query.actor,
        outcome: req.query.outcome,
        limit: req.query.limit,
      });
      res.json({ events });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/operations/settings', async (req, res, next) => {
    try {
      const settings = await operations.getSettings();
      res.json({ settings, services: registry.services.map(({ id, name, shortName }) => ({ id, name, shortName })) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/operations/settings', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const change = await configurations.propose({
        settings: req.body?.settings || req.body || {},
        summary: req.body?.summary || 'Operations settings update',
        actor: req.consoleUser.username,
      });
      await recordAudit(req, { action: 'configuration.change_proposed', targetType: 'configuration_change', targetId: change.id, details: { changedKeys: change.changedKeys } });
      res.status(202).json({ change });
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) {
        return res.status(400).json({ error: '运行设置格式无效。', code: 'INVALID_OPERATIONS_SETTINGS' });
      }
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); }
      return undefined;
    }
  });

  app.get('/api/configuration', async (req, res, next) => {
    try { return res.json(await configurations.getOverview()); }
    catch (error) { next(error); return undefined; }
  });

  app.post('/api/configuration/changes', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const change = await configurations.propose({ settings: req.body?.settings || {}, summary: req.body?.summary, actor: req.consoleUser.username });
      await recordAudit(req, { action: 'configuration.change_proposed', targetType: 'configuration_change', targetId: change.id, details: { changedKeys: change.changedKeys } });
      return res.status(201).json({ change });
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/configuration/changes/:id/approve', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const result = await configurations.approve(req.params.id, req.consoleUser.username, req.body?.note);
      await recordAudit(req, { action: 'configuration.change_applied', targetType: 'configuration_change', targetId: req.params.id, details: { version: result.version } });
      return res.json(result);
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/configuration/changes/:id/reject', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const change = await configurations.reject(req.params.id, req.consoleUser.username, req.body?.note);
      await recordAudit(req, { action: 'configuration.change_rejected', targetType: 'configuration_change', targetId: req.params.id });
      return res.json({ change });
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.post('/api/configuration/versions/:version/rollback', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const change = await configurations.proposeRollback(req.params.version, { actor: req.consoleUser.username, summary: req.body?.summary });
      await recordAudit(req, { action: 'configuration.rollback_proposed', targetType: 'configuration_change', targetId: change.id, details: { targetVersion: change.targetVersion } });
      return res.status(201).json({ change });
    } catch (error) {
      try { return sendConfigurationError(res, error); } catch (unexpected) { next(unexpected); return undefined; }
    }
  });

  app.get('/api/tasks', async (req, res, next) => {
    try { return res.json(await tasks.list({ status: req.query.status, source: req.query.source, limit: req.query.limit })); }
    catch (error) { next(error); return undefined; }
  });

  app.post('/api/diagnostics/traces', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await diagnostics.run({ serviceId: req.body?.serviceId, parentRequestId: req.requestId });
      await recordAudit(req, { action: 'diagnostics.trace', outcome: result.summary.attention ? 'failure' : 'success', targetType: 'service', targetId: req.body?.serviceId || 'all', details: result.summary });
      return res.json(result);
    } catch (error) {
      if (error?.status && error?.code) return res.status(error.status).json({ error: error.message, code: error.code });
      next(error);
      return undefined;
    }
  });

  app.post('/api/diagnostics/run', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const result = await operations.runDiagnostics();
      await recordAudit(req, {
        action: 'diagnostics.run',
        outcome: result.checks.every((check) => check.status === 'passed') ? 'success' : 'failure',
        targetType: 'platform',
        details: { checks: result.checks.map(({ id, status }) => ({ id, status })) },
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/security/sessions', async (req, res, next) => {
    try {
      const list = await sessions.list?.({ subject: req.consoleUser.role === 'super_admin' ? undefined : req.consoleUser.username }) || [];
      res.json({
        currentNonce: req.consoleSession?.nonce || null,
        sessions: list,
        security: {
          role: req.consoleUser.role,
          totpEnabled: Boolean(req.consoleAccount?.totpEnabled),
          recoveryCodesRemaining: req.consoleAccount?.recoveryCodesRemaining || 0,
          passkeyCount: req.consoleAccount?.passkeyCount || 0,
          sessionTtlHours: config.sessionTtlHours,
          sessionIdleMinutes: config.sessionIdleMinutes,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/security/sessions/:nonce', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const revoked = await sessions.revokeByNonce?.(req.params.nonce);
      if (!revoked) return res.status(404).json({ error: '会话不存在或已经失效。', code: 'SESSION_NOT_FOUND' });
      await recordAudit(req, {
        action: 'security.session_revoked',
        targetType: 'session',
        targetId: req.params.nonce,
      });
      if (req.params.nonce === req.consoleSession?.nonce) {
        clearSessionCookies(res, config);
      }
      return res.json({ revoked: true, current: req.params.nonce === req.consoleSession?.nonce });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/security/accounts', requireRole('super_admin'), async (req, res, next) => {
    try {
      return res.json({ accounts: await accounts.listAccounts() });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/accounts', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.account_created')) return undefined;
      const passwordHash = await createPasswordHash(String(req.body?.newPassword || ''));
      const account = await accounts.createAccount({
        username: req.body?.username,
        passwordHash,
        role: req.body?.role,
      });
      await recordAudit(req, { action: 'security.account_created', targetType: 'account', targetId: account.username, details: { role: account.role } });
      return res.status(201).json({ account });
    } catch (error) {
      if (error.message === 'ACCOUNT_EXISTS') return res.status(409).json({ error: '管理员账号已经存在。', code: 'ACCOUNT_EXISTS' });
      if (error.message === 'INVALID_ACCOUNT' || error.message.includes('15 到 256')) {
        return res.status(400).json({ error: error.message === 'INVALID_ACCOUNT' ? '管理员账号或角色格式无效。' : error.message, code: 'INVALID_ACCOUNT' });
      }
      next(error);
      return undefined;
    }
  });

  app.patch('/api/security/accounts/:username', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.account_updated')) return undefined;
      const account = await accounts.updateAccount(req.params.username, { role: req.body?.role, active: req.body?.active });
      if (!account) return res.status(404).json({ error: '管理员账号不存在。', code: 'ACCOUNT_NOT_FOUND' });
      await sessions.revokeBySubject?.(account.username);
      await app.locals.onConsoleSessionsChanged();
      await recordAudit(req, { action: 'security.account_updated', targetType: 'account', targetId: account.username, details: { role: account.role, active: account.active } });
      if (account.username === req.consoleUser.username) clearSessionCookies(res, config);
      return res.json({ account, currentSessionRevoked: account.username === req.consoleUser.username });
    } catch (error) {
      if (error.message === 'LAST_SUPER_ADMIN') return res.status(409).json({ error: '不能停用或降级最后一个超级管理员。', code: 'LAST_SUPER_ADMIN' });
      if (error.message === 'INVALID_ROLE') return res.status(400).json({ error: '管理员角色无效。', code: 'INVALID_ROLE' });
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/password', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.password_changed')) return undefined;
      const newPassword = String(req.body?.newPassword || '');
      if (await verifyPassword(newPassword, req.consoleAccount.passwordHash)) {
        return res.status(400).json({ error: '新密码不能与当前密码相同。', code: 'PASSWORD_UNCHANGED' });
      }
      const passwordHash = await createPasswordHash(newPassword);
      await accounts.setPasswordHash(req.consoleUser.username, passwordHash);
      await sessions.revokeBySubject?.(req.consoleUser.username);
      await app.locals.onConsoleSessionsChanged();
      clearSessionCookies(res, config);
      await recordAudit(req, { action: 'security.password_changed', targetType: 'account', targetId: req.consoleUser.username });
      return res.json({ changed: true, currentSessionRevoked: true });
    } catch (error) {
      if (error.message.includes('15 到 256')) {
        return res.status(400).json({ error: error.message, code: 'INVALID_PASSWORD' });
      }
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/totp/enrollment', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.totp_enrollment_started')) return undefined;
      const enrollment = await accounts.beginTotpEnrollment(req.consoleUser.username);
      if (!enrollment) return res.status(404).json({ error: '管理员账号不存在。', code: 'ACCOUNT_NOT_FOUND' });
      await recordAudit(req, { action: 'security.totp_enrollment_started', targetType: 'account', targetId: req.consoleUser.username });
      return res.json({ enrollment });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/totp/confirm', requireConsoleRequest, async (req, res, next) => {
    try {
      const result = await accounts.confirmTotpEnrollment(req.consoleUser.username, req.body?.totp);
      if (!result) return res.status(400).json({ error: '动态验证码无效或注册已过期。', code: 'TOTP_ENROLLMENT_INVALID' });
      await recordAudit(req, { action: 'security.totp_enabled', targetType: 'account', targetId: req.consoleUser.username });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/totp/recovery-codes', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.recovery_codes_regenerated')) return undefined;
      const result = await accounts.regenerateRecoveryCodes(req.consoleUser.username);
      if (!result) return res.status(409).json({ error: '请先启用动态验证。', code: 'TOTP_NOT_ENABLED' });
      await recordAudit(req, { action: 'security.recovery_codes_regenerated', targetType: 'account', targetId: req.consoleUser.username });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.delete('/api/security/totp', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.totp_disabled')) return undefined;
      if (config.requireMfa) {
        return res.status(409).json({
          error: '生产多因素策略已启用，不能停用动态验证。',
          code: 'MFA_REQUIRED',
        });
      }
      await accounts.disableTotp(req.consoleUser.username);
      await sessions.revokeBySubject?.(req.consoleUser.username);
      await app.locals.onConsoleSessionsChanged();
      clearSessionCookies(res, config);
      await recordAudit(req, { action: 'security.totp_disabled', targetType: 'account', targetId: req.consoleUser.username });
      return res.json({ disabled: true, currentSessionRevoked: true });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/security/passkeys', async (req, res, next) => {
    try {
      return res.json({ passkeys: await accounts.listPasskeys(req.consoleUser.username) });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/passkeys/options', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.passkey_enrollment_started')) return undefined;
      const result = await passkeys.registrationOptions(req.consoleUser.username);
      if (!result) return res.status(404).json({ error: '管理员账号不存在。', code: 'ACCOUNT_NOT_FOUND' });
      await recordAudit(req, { action: 'security.passkey_enrollment_started', targetType: 'account', targetId: req.consoleUser.username });
      return res.json(result);
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.post('/api/security/passkeys/verify', requireConsoleRequest, async (req, res, next) => {
    try {
      const result = await passkeys.verifyRegistration(req.consoleUser.username, req.body);
      if (!result.verified) return res.status(400).json({ error: 'Passkey 注册验证失败。', code: 'PASSKEY_REGISTRATION_FAILED' });
      await recordAudit(req, { action: 'security.passkey_registered', targetType: 'account', targetId: req.consoleUser.username });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: 'Passkey 注册验证失败。', code: 'PASSKEY_REGISTRATION_FAILED' });
    }
  });

  app.delete('/api/security/passkeys/:id', requireConsoleRequest, async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'security.passkey_deleted')) return undefined;
      const deleted = await accounts.deletePasskey(req.consoleUser.username, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Passkey 不存在。', code: 'PASSKEY_NOT_FOUND' });
      await recordAudit(req, { action: 'security.passkey_deleted', targetType: 'passkey', targetId: req.params.id });
      return res.json({ deleted: true });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/releases', async (req, res, next) => {
    try {
      res.json(await releases.getSummary());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/releases/preflight', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const result = await releases.getPreflight({
        components: req.body?.components,
        action: req.body?.action,
        maintenanceApproved: Boolean(req.body?.maintenanceApproved),
      });
      return res.status(result.ok ? 200 : 409).json(result);
    } catch (error) {
      if (error instanceof ReleaseOperationError) {
        return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      }
      next(error);
      return undefined;
    }
  });

  app.post('/api/releases/build', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, { action: 'release.build', outcome: 'failure', targetType: 'release', details: { reason: 'reauthentication_failed' } });
        return res.status(403).json({ error: '二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
      }
      const result = await releases.dispatchBuild({ targets: req.body?.targets, requestedBy: req.consoleUser.username });
      await recordAudit(req, { action: 'release.build', targetType: 'release', targetId: result.id, details: { targets: result.targets } });
      return res.status(202).json(result);
    } catch (error) {
      if (error instanceof ReleaseOperationError) return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      next(error);
      return undefined;
    }
  });

  app.post('/api/releases/deploy', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const action = String(req.body?.action || '');
      const components = [...new Set((Array.isArray(req.body?.components) ? req.body.components : [req.body?.component])
        .map((component) => String(component || '').trim())
        .filter(Boolean))];
      const expectedConfirmation = `${action === 'rollback' ? 'ROLLBACK' : 'DEPLOY'} ${components.join(',')}`;
      if (!['deploy', 'rollback'].includes(action) || req.body?.confirmText !== expectedConfirmation) {
        return res.status(400).json({ error: '部署确认短语不正确。', code: 'DEPLOY_CONFIRMATION_REQUIRED' });
      }
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, { action: 'release.deploy', outcome: 'failure', targetType: 'release', details: { reason: 'reauthentication_failed' } });
        return res.status(403).json({ error: '二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
      }
      const result = await releases.dispatchDeployment({
        action,
        buildId: req.body?.buildId,
        sourceDeploymentId: req.body?.sourceDeploymentId,
        components,
        maintenanceApproved: Boolean(req.body?.maintenanceApproved),
        requestedBy: req.consoleUser.username,
      });
      await recordAudit(req, {
        action: `release.${action}`,
        targetType: 'release',
        targetId: result.id,
        details: { components, buildId: result.buildId, sourceDeploymentId: result.sourceDeploymentId },
      });
      return res.status(202).json(result);
    } catch (error) {
      if (error instanceof ReleaseOperationError) return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      next(error);
      return undefined;
    }
  });

  app.get('/api/backups/status', async (req, res, next) => {
    try {
      res.json(await backups.getStatus());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/backups/quality', async (req, res, next) => {
    try {
      res.json(await operations.getBackupQuality({ force: req.query.refresh === '1' }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/backups/run', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const job = await backups.startBackup({ requestedBy: req.consoleUser?.username || 'admin' });
      await recordAudit(req, { action: 'backup.started', targetType: 'backup_job', targetId: job.id, details: { type: job.type } });
      res.status(202).json({ job });
    } catch (error) {
      await recordAudit(req, { action: 'backup.started', outcome: 'failure', targetType: 'backup', details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.get('/api/backups/jobs/:id', async (req, res, next) => {
    try {
      const job = await backups.getJob(req.params.id);
      await operations.observeBackupJob(job);
      res.json({ job });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.all('/api/backups/:backupName/download', requireConsoleRequest, requireBackupDownloadAccess, async (req, res, next) => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).set('Allow', 'POST').json({ error: '备份下载仅支持安全 POST 请求。', code: 'METHOD_NOT_ALLOWED' });
      }
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, {
          action: 'backup.download',
          outcome: 'failure',
          targetType: 'backup',
          targetId: req.params.backupName,
          details: { reason: 'reauthentication_failed' },
        });
        return res.status(403).json({ error: '管理员二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
      }
      const download = await backups.downloadBackup({ backupName: req.params.backupName });
      await recordAudit(req, { action: 'backup.downloaded', targetType: 'backup', targetId: req.params.backupName });
      res.setHeader('Content-Type', download.contentType || 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName(download.filename)}"`);
      download.stream.once('error', next);
      download.stream.pipe(res);
    } catch (error) {
      await recordAudit(req, {
        action: 'backup.download',
        outcome: 'failure',
        targetType: 'backup',
        targetId: req.params.backupName,
        details: { reason: 'download_failed', error: String(error.message || error).slice(0, 200) },
      });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.delete('/api/backups/:backupName', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const result = await backups.deleteBackup({ backupName: req.params.backupName });
      await recordAudit(req, { action: 'backup.deleted', targetType: 'backup', targetId: req.params.backupName });
      res.json(result);
    } catch (error) {
      await recordAudit(req, { action: 'backup.deleted', outcome: 'failure', targetType: 'backup', targetId: req.params.backupName, details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/upload', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const filename = String(req.query.filename || req.get('X-Backup-Filename') || '');
      const result = await backups.uploadBackup({
        filename,
        stream: req,
        contentType: req.get('content-type') || 'application/gzip',
      });
      await recordAudit(req, { action: 'backup.uploaded', targetType: 'backup', targetId: filename });
      res.status(201).json(result);
    } catch (error) {
      await recordAudit(req, { action: 'backup.uploaded', outcome: 'failure', targetType: 'backup', details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/restore', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const backupName = String(req.body?.backupName || '');
      const confirmText = String(req.body?.confirmText || '');
      const password = String(req.body?.password || '');

      if (!backupName) {
        return res.status(400).json({ error: '请选择要恢复的备份。', code: 'BACKUP_REQUIRED' });
      }
      if (confirmText !== config.restoreConfirmText) {
        return res.status(400).json({ error: '确认短语不正确。', code: 'RESTORE_CONFIRMATION_REQUIRED' });
      }
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, { action: 'backup.restore', outcome: 'failure', targetType: 'backup', targetId: backupName, details: { reason: 'reauthentication_failed' } });
        return res.status(403).json({ error: '管理员二次验证失败，恢复已拒绝。', code: 'RESTORE_PASSWORD_INVALID' });
      }

      const job = await backups.startRestore({
        backupName,
        requestedBy: req.consoleUser?.username || 'admin',
      });
      await recordAudit(req, { action: 'backup.restore', targetType: 'backup_job', targetId: job.id, details: { backupName } });
      return res.status(202).json({ job });
    } catch (error) {
      await recordAudit(req, { action: 'backup.restore', outcome: 'failure', targetType: 'backup', targetId: String(req.body?.backupName || ''), details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
      return undefined;
    }
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
