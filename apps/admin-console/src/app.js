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
  createSessionRegistry,
  parseCookies,
  verifyPassword,
  verifyTotp,
} from './auth.js';
import { BackupOperationError, createBackupManager, createBackupRunnerClient } from './backups.js';
import { loadConfig } from './config.js';
import { createStatusMonitor, loadServiceRegistry } from './service-registry.js';
import { createMetrics } from './metrics.js';
import { createOperationsCenter } from './operations-center.js';
import { createOperationsNotifier } from './operations-notifier.js';
import { createMemoryOperationsStore } from './operations-store.js';
import { ReleaseOperationError, createReleaseService } from './release-service.js';
import { createMemoryReleaseStore } from './release-store.js';

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
} = {}) {
  const registry = loadServiceRegistry(config.registryPath);
  const monitor = createStatusMonitor(registry.services, {
    timeoutMs: config.serviceTimeoutMs,
    fetchImpl,
  });
  const app = express();
  const sessions = sessionRegistry || createSessionRegistry({ secret: config.sessionSecret });
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

  function readSessionToken(req) {
    return parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
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

  async function recordAudit(req, input) {
    return operations.recordAudit({
      actor: req.consoleUser?.username || input.actor || 'anonymous',
      ...requestAuditFields(req),
      ...input,
    });
  }

  async function verifyReauthentication(req) {
    if (config.authDisabled) return true;
    const passwordValid = await verifyPassword(String(req.body?.password || ''), config.adminPasswordHash);
    const totpValid = !config.adminTotpSecret || verifyTotp(req.body?.totp, config.adminTotpSecret);
    return passwordValid && totpValid;
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
  app.locals.verifyConsoleSession = async (token, now) => sessions.verify(token, now);
  app.locals.onConsoleSessionRevoked = () => {};
  app.locals.onConsoleSessionChanged = () => {};
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

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    const incoming = String(req.get('x-request-id') || '');
    req.requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(metrics.middleware);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(compression());
  app.use(express.json({ limit: '32kb' }));

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
    return res.json({
      authenticated: Boolean(session),
      authDisabled: false,
      totpRequired: Boolean(config.adminTotpSecret),
      user: session ? { username: session.sub, role: session.role || config.adminRole, totpEnabled: Boolean(config.adminTotpSecret) } : null,
    });
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
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

    const username = String(req.body?.username || '');
    const password = String(req.body?.password || '');
    const passwordValid = await verifyPassword(password, config.adminPasswordHash);
    const totpValid = !config.adminTotpSecret || verifyTotp(req.body?.totp, config.adminTotpSecret);
    if (username !== config.adminUsername || !passwordValid || !totpValid) {
      await recordAudit(req, {
        actor: username || 'anonymous',
        action: 'auth.login',
        outcome: 'failure',
        targetType: 'account',
        targetId: username,
        details: { reason: !passwordValid || username !== config.adminUsername ? 'invalid_credentials' : 'invalid_totp' },
      });
      return res.status(401).json({ error: '账号或密码错误。', code: 'INVALID_CREDENTIALS' });
    }

    const token = await sessions.issue({
      username: config.adminUsername,
      role: config.adminRole,
      ttlHours: config.sessionTtlHours,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(config));
    await recordAudit(req, {
      actor: config.adminUsername,
      action: 'auth.login',
      targetType: 'account',
      targetId: config.adminUsername,
    });
    return res.json({
      authenticated: true,
      authDisabled: false,
      totpRequired: Boolean(config.adminTotpSecret),
      user: { username: config.adminUsername, role: config.adminRole, totpEnabled: Boolean(config.adminTotpSecret) },
    });
  });

  app.post('/api/auth/logout', requireConsoleRequest, async (req, res) => {
    const token = readSessionToken(req);
    const session = await sessions.verify(token);
    await sessions.revoke(token);
    await app.locals.onConsoleSessionRevoked(token);
    res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(config), maxAge: 0 });
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
    res.setHeader('Cache-Control', 'no-store');
    if (config.authDisabled) {
      req.consoleUser = { username: 'local-admin', role: 'super_admin' };
      req.consoleSession = { sub: 'local-admin', role: 'super_admin', nonce: 'local-development-session' };
      return next();
    }
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: '请先登录。', code: 'UNAUTHORIZED' });
    req.consoleSession = session;
    req.consoleUser = { username: session.sub, role: session.role || config.adminRole };
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

  app.put('/api/operations/settings', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const settings = await operations.updateSettings(req.body || {}, req.consoleUser.username);
      res.json({ settings });
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) {
        return res.status(400).json({ error: '运行设置格式无效。', code: 'INVALID_OPERATIONS_SETTINGS' });
      }
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
          totpEnabled: Boolean(config.adminTotpSecret),
          sessionTtlHours: config.sessionTtlHours,
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
        res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(config), maxAge: 0 });
      }
      return res.json({ revoked: true, current: req.params.nonce === req.consoleSession?.nonce });
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
