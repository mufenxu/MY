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
} from './auth.js';
import { BackupOperationError, createBackupManager } from './backups.js';
import { loadConfig } from './config.js';
import { createStatusMonitor, loadServiceRegistry } from './service-registry.js';
import { createMetrics } from './metrics.js';

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

export function createApp({
  config = loadConfig(),
  fetchImpl = fetch,
  sessionRegistry = null,
  readinessCheck = async () => true,
  backupManager = null,
} = {}) {
  const registry = loadServiceRegistry(config.registryPath);
  const monitor = createStatusMonitor(registry.services, {
    timeoutMs: config.serviceTimeoutMs,
    fetchImpl,
  });
  const app = express();
  const sessions = sessionRegistry || createSessionRegistry({ secret: config.sessionSecret });
  const metrics = createMetrics();
  const backups = backupManager || createBackupManager({ config });

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

  app.locals.verifyConsoleSession = async (token, now) => sessions.verify(token, now);
  app.locals.sessionRegistry = sessions;

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
      return res.json({ authenticated: true, authDisabled: true, user: { username: 'local-admin' } });
    }
    const session = await readSession(req);
    return res.json({
      authenticated: Boolean(session),
      authDisabled: false,
      user: session ? { username: session.sub } : null,
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
      return res.json({ authenticated: true, authDisabled: true, user: { username: 'local-admin' } });
    }

    const username = String(req.body?.username || '');
    const password = String(req.body?.password || '');
    const passwordValid = await verifyPassword(password, config.adminPasswordHash);
    if (username !== config.adminUsername || !passwordValid) {
      return res.status(401).json({ error: '账号或密码错误。', code: 'INVALID_CREDENTIALS' });
    }

    const token = await sessions.issue({
      username: config.adminUsername,
      ttlHours: config.sessionTtlHours,
    });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(config));
    return res.json({ authenticated: true, authDisabled: false, user: { username: config.adminUsername } });
  });

  app.post('/api/auth/logout', requireConsoleRequest, async (req, res) => {
    await sessions.revoke(readSessionToken(req));
    res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(config), maxAge: 0 });
    res.json({ authenticated: false });
  });

  app.use('/api', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (config.authDisabled) {
      req.consoleUser = { username: 'local-admin' };
      return next();
    }
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: '请先登录。', code: 'UNAUTHORIZED' });
    req.consoleUser = { username: session.sub };
    return next();
  });

  app.get('/api/services', (req, res) => {
    res.json({ platformName: registry.platformName, services: registry.services });
  });

  app.get('/api/services/status', async (req, res, next) => {
    try {
      const force = req.query.refresh === '1';
      const services = await monitor.refresh(force);
      const counts = services.reduce((summary, service) => {
        summary[service.state] = (summary[service.state] || 0) + 1;
        return summary;
      }, {});
      res.json({ platformName: registry.platformName, services, counts, refreshedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/backups/status', async (req, res, next) => {
    try {
      res.json(await backups.getStatus());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/backups/run', requireConsoleRequest, async (req, res, next) => {
    try {
      const job = await backups.startBackup({ requestedBy: req.consoleUser?.username || 'admin' });
      res.status(202).json({ job });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.get('/api/backups/jobs/:id', async (req, res, next) => {
    try {
      res.json({ job: backups.getJob(req.params.id) });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/restore', requireConsoleRequest, async (req, res, next) => {
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
      if (!config.authDisabled) {
        const passwordValid = await verifyPassword(password, config.adminPasswordHash);
        if (!passwordValid) {
          return res.status(403).json({ error: '管理员密码错误，恢复已拒绝。', code: 'RESTORE_PASSWORD_INVALID' });
        }
      }

      const job = await backups.startRestore({
        backupName,
        requestedBy: req.consoleUser?.username || 'admin',
      });
      return res.status(202).json({ job });
    } catch (error) {
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
    return res.status(500).json({ error: '管理门户内部错误。', code: 'INTERNAL_ERROR', requestId: req.requestId });
  });

  return app;
}
