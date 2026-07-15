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
  issueSession,
  parseCookies,
  verifyPassword,
  verifySession,
} from './auth.js';
import { loadConfig } from './config.js';
import { createStatusMonitor, loadServiceRegistry } from './service-registry.js';

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

export function createApp({ config = loadConfig(), fetchImpl = fetch } = {}) {
  const registry = loadServiceRegistry(config.registryPath);
  const monitor = createStatusMonitor(registry.services, {
    timeoutMs: config.serviceTimeoutMs,
    fetchImpl,
  });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
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

  app.get('/api/auth/status', (req, res) => {
    if (config.authDisabled) {
      return res.json({ authenticated: true, authDisabled: true, user: { username: 'local-admin' } });
    }
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
    const session = verifySession(token, config.sessionSecret);
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

    const token = issueSession({
      username: config.adminUsername,
      secret: config.sessionSecret,
      ttlHours: config.sessionTtlHours,
    });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(config));
    return res.json({ authenticated: true, authDisabled: false, user: { username: config.adminUsername } });
  });

  app.post('/api/auth/logout', requireConsoleRequest, (req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(config), maxAge: 0 });
    res.json({ authenticated: false });
  });

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (config.authDisabled) {
      req.consoleUser = { username: 'local-admin' };
      return next();
    }
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
    const session = verifySession(token, config.sessionSecret);
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
