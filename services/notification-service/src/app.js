const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const { verifyServiceRequest } = require('@my-platform/platform-auth');

const defaultConfig = require('./config');
const WeComClient = require('./wecom-client');
const { notificationSchema, buildWeComPayload } = require('./notification-schema');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createReplayGuard({ ttlMs = 60_000, maxEntries = 4_096 } = {}) {
  const seen = new Map();
  return ({ caller, nonce, timestamp }) => {
    const now = Date.now();
    for (const [key, expiresAt] of seen) {
      if (expiresAt <= now) seen.delete(key);
    }
    const key = `${caller}:${nonce}`;
    if (seen.has(key)) return false;
    seen.set(key, Math.max(now, timestamp) + ttlMs);
    while (seen.size > maxEntries) seen.delete(seen.keys().next().value);
    return true;
  };
}

function createApp({ config = defaultConfig, wecomClient = null } = {}) {
  const app = express();
  const client = wecomClient || new WeComClient({
    corpId: config.wecom.corpId,
    secret: config.wecom.secret,
    margin: config.tokenCacheMargin,
  });
  const guardAgainstReplay = createReplayGuard();

  const checkApiKey = (req, res, next) => {
    const apiKey = req.get('X-API-KEY');
    if (apiKey && safeEqual(apiKey, config.apiKey)) {
      req.serviceCaller = 'external-api';
      return next();
    }
    const identity = verifyServiceRequest({
      headers: req.headers,
      secret: config.apiKey,
      allowedCallers: config.internalCallers || [],
      method: req.method,
      pathname: req.originalUrl || req.url,
      body: req.rawBody || '',
      replayGuard: guardAgainstReplay,
    });
    if (!identity) return res.status(401).json({ errcode: 401, errmsg: '无效的 API KEY' });
    req.serviceCaller = identity.caller;
    return next();
  };

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const incoming = String(req.get('x-request-id') || '');
    req.id = /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(helmet());
  morgan.token('request-id', (req) => req.id || '-');
  app.use(morgan(process.env.NODE_ENV === 'production'
    ? ':request-id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : ':request-id :method :url :status :response-time ms - :res[content-length]'));
  app.use(express.json({
    limit: '64kb',
    verify(req, _res, buffer) {
      req.rawBody = Buffer.from(buffer);
    },
  }));

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.post('/notify', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }), checkApiKey, async (req, res, next) => {
    try {
      const parsed = notificationSchema.parse(req.body);
      const payload = buildWeComPayload(parsed, config.wecom.agentId);
      const result = await client.sendMessage(payload);
      res.json({ errcode: 0, errmsg: 'ok', detail: result });
    } catch (error) {
      next(error);
    }
  });

  app.use((err, req, res, next) => {
    if (err.name === 'ZodError') {
      return res.status(400).json({ errcode: 400, errmsg: '请求参数错误', detail: err.issues });
    }
    if (err.message?.startsWith('企业微信发送失败') || err.message?.startsWith('获取企业微信 token 失败')) {
      return res.status(502).json({ errcode: 502, errmsg: err.message });
    }
    console.error(`[${req.id}]`, err);
    return res.status(500).json({ errcode: 500, errmsg: '服务器内部错误', requestId: req.id });
  });

  return app;
}

const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
module.exports.createReplayGuard = createReplayGuard;
module.exports.safeEqual = safeEqual;
