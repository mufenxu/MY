const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocket, WebSocketServer } = require('ws');
const { AuthManager } = require('../security/auth');
const { createLimiter } = require('./middleware/rateLimit');
const {
  attachRequestContext,
  createErrorPayload,
  logRequestError,
  normalizeErrorCode,
  normalizeStatusCode
} = require('./middleware/requestContext');
const {
  isAllowedRealtimeOrigin,
  parseTrustProxy,
  requireSameOriginSessionWrite,
  setSecurityHeaders
} = require('./middleware/security');
const { createInfoPayload } = require('./payloads/infoPayload');
const { registerApiDocsRoute } = require('./routes/apiDocs');
const { registerAuthRoutes } = require('./routes/auth');
const { registerDeviceRoutes } = require('./routes/devices');
const { registerKeyRoutes } = require('./routes/keys');
const { registerSystemRoutes } = require('./routes/system');

function rejectUpgrade(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n'
  );
  socket.destroy();
}

function createApiServer({ settingsStore, mqttService }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  const server = http.createServer(app);
  const wsServer = new WebSocketServer({ noServer: true });
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const authManager = new AuthManager(settingsStore, mqttService.db);
  const requireSession = authManager.requireSession();
  const requireTelemetryAccess = authManager.requireAccess(['devices:read'], {
    insufficientScopeMessage: '当前 API Key 没有读取设备数据的权限。'
  });
  const requireHistoryAccess = authManager.requireAccess(['history:read'], {
    insufficientScopeMessage: '当前 API Key 没有读取历史数据的权限。'
  });
  const requireRelayControl = authManager.requireAccess(['relays:write'], {
    insufficientScopeMessage: '当前 API Key 没有继电器控制权限。'
  });

  app.use(attachRequestContext);

  function createRealtimePayload(type = 'snapshot') {
    return {
      type,
      timestamp: Date.now(),
      data: createInfoPayload(settingsStore, mqttService)
    };
  }

  function broadcast(type) {
    const payload = JSON.stringify(createRealtimePayload(type));

    wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  wsServer.on('connection', (socket) => {
    socket.send(JSON.stringify(createRealtimePayload('snapshot')));
  });

  server.on('upgrade', (req, socket, head) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    if (requestUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    if (!authManager.canAccessRealtime(req)) {
      rejectUpgrade(socket, 401, 'Unauthorized');
      return;
    }

    if (!isAllowedRealtimeOrigin(req)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }

    wsServer.handleUpgrade(req, socket, head, (client) => {
      wsServer.emit('connection', client, req);
    });
  });

  mqttService.on('message', () => broadcast('message'));
  mqttService.on('status', () => broadcast('status'));

  app.use(setSecurityHeaders);

  const loginLimiter = createLimiter({
    windowMs: 60000,
    max: 6,
    name: 'login',
    message: '登录过于频繁，防暴力破解机制已触发。请在 1 分钟后重试。'
  });

  const apiLimiter = createLimiter({
    windowMs: 60000,
    max: 60,
    name: 'api',
    message: 'API 请求频率超限，请稍后再试。'
  });

  app.use('/api', apiLimiter);
  app.use('/api', requireSameOriginSessionWrite);

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(publicDir));

  registerApiDocsRoute(app);
  registerAuthRoutes(app, { authManager, loginLimiter });
  registerDeviceRoutes(app, {
    settingsStore,
    mqttService,
    requireTelemetryAccess,
    requireHistoryAccess,
    requireRelayControl
  });
  registerKeyRoutes(app, { mqttService, requireSession });
  registerSystemRoutes(app, { settingsStore, mqttService, requireSession });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const statusCode = normalizeStatusCode(error.statusCode || error.status);
    const internalCode = normalizeErrorCode(statusCode, error.code);
    const code = statusCode >= 500 && !error.expose
      ? normalizeErrorCode(statusCode)
      : internalCode;
    res.locals.errorCode = code;
    logRequestError(error, req, res, statusCode, code, internalCode);
    res.status(statusCode).json(createErrorPayload(req, statusCode, error.message, code));
  });

  return {
    app,
    server
  };
}

module.exports = {
  createApiServer
};
