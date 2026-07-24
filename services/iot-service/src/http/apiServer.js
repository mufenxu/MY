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
const { registerAutomationRoutes } = require('./routes/automations');
const { registerDeviceRoutes } = require('./routes/devices');
const { registerKeyRoutes } = require('./routes/keys');
const { registerSystemRoutes } = require('./routes/system');

const WS_COALESCE_MS = 50;
const WS_RETRY_MS = 250;
const WS_MAX_BUFFERED_BYTES = 512 * 1024;
const WS_BACKPRESSURE_TIMEOUT_MS = 10000;

function rejectUpgrade(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n'
  );
  socket.destroy();
}

function createApiServer({ settingsStore, mqttService, automationEngine = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  const server = http.createServer(app);
  const wsServer = new WebSocketServer({ noServer: true });
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const authManager = new AuthManager(settingsStore, mqttService.db);
  const requireSession = authManager.requireSession();
  const requireTelemetryAccess = authManager.requireAccess(['devices:read'], {
    insufficientScopeMessage: '当前凭证没有读取设备数据的权限。'
  });
  const requireHistoryAccess = authManager.requireAccess(['history:read'], {
    insufficientScopeMessage: '当前凭证没有读取历史数据的权限。'
  });
  const requireRelayControl = authManager.requireAccess(['relays:write'], {
    insufficientScopeMessage: '当前凭证没有继电器控制权限。'
  });

  app.use(attachRequestContext);

  function createRealtimePayload(type = 'snapshot') {
    return {
      type,
      timestamp: Date.now(),
      data: createInfoPayload(settingsStore, mqttService)
    };
  }

  const socketStates = new WeakMap();

  function clearSocketState(socket) {
    const state = socketStates.get(socket);
    if (state?.timer) clearTimeout(state.timer);
    socketStates.delete(socket);
  }

  function scheduleRealtimePayload(socket, type, { immediate = false } = {}) {
    if (socket.readyState !== WebSocket.OPEN) return;
    const state = socketStates.get(socket) || {
      blockedSince: 0,
      pendingType: type,
      timer: null
    };
    state.pendingType = type;
    socketStates.set(socket, state);

    const flush = () => {
      state.timer = null;
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > WS_MAX_BUFFERED_BYTES) {
        state.blockedSince ||= Date.now();
        if (Date.now() - state.blockedSince >= WS_BACKPRESSURE_TIMEOUT_MS) {
          socket.close(1013, 'Realtime client is too slow');
          return;
        }
        state.timer = setTimeout(flush, WS_RETRY_MS);
        state.timer.unref?.();
        return;
      }

      state.blockedSince = 0;
      const payload = JSON.stringify(createRealtimePayload(state.pendingType));
      socket.send(payload, (error) => {
        if (error) socket.terminate();
      });
    };

    if (state.timer) return;
    if (immediate) flush();
    else {
      state.timer = setTimeout(flush, WS_COALESCE_MS);
      state.timer.unref?.();
    }
  }

  function broadcast(type) {
    wsServer.clients.forEach((client) => {
      scheduleRealtimePayload(client, type);
    });
  }

  wsServer.on('connection', (socket) => {
    socket.once('close', () => clearSocketState(socket));
    scheduleRealtimePayload(socket, 'snapshot', { immediate: true });
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

  const onMqttMessage = () => broadcast('message');
  const onMqttStatus = () => broadcast('status');
  const onAutomationRun = () => broadcast('automation');
  mqttService.on('message', onMqttMessage);
  mqttService.on('status', onMqttStatus);
  automationEngine?.on('run', onAutomationRun);

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
  if (automationEngine) {
    registerAutomationRoutes(app, {
      automationEngine,
      requireTelemetryAccess,
      requireRelayControl
    });
  }
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

  async function closeRealtime() {
    mqttService.off('message', onMqttMessage);
    mqttService.off('status', onMqttStatus);
    automationEngine?.off('run', onAutomationRun);
    for (const client of wsServer.clients) {
      clearSocketState(client);
      client.close(1001, 'Service shutting down');
    }

    await new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(forceTimer);
        resolve();
      };
      const forceTimer = setTimeout(() => {
        for (const client of wsServer.clients) client.terminate();
        done();
      }, 1000);
      forceTimer.unref?.();
      wsServer.close(done);
    });
  }

  return {
    app,
    closeRealtime,
    server,
    wsServer
  };
}

module.exports = {
  WS_BACKPRESSURE_TIMEOUT_MS,
  WS_COALESCE_MS,
  WS_MAX_BUFFERED_BYTES,
  createApiServer
};
