import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createCoreWebApp, createPlatformRouter } from './router.mjs';
import { resolveRuntimePaths } from './runtime-paths.mjs';
import { SESSION_COOKIE_NAME, parseCookies } from '../../../apps/admin-console/src/auth.js';

const require = createRequire(import.meta.url);
const { paths } = resolveRuntimePaths();

const coreRuntime = require(paths.coreServer);
const examRuntime = require(paths.examServer);
const notifyApp = require(paths.notifyApp);
const [{ createApp: createPortalApp }, { loadConfig: loadPortalConfig }] = await Promise.all([
  import(pathToFileURL(paths.portalApp).href),
  import(pathToFileURL(paths.portalConfig).href),
]);
const { createMongoSessionRegistry } = await import(
  pathToFileURL(paths.portalMongoSessionRegistry).href
);

const portalConfig = loadPortalConfig();
const sessionRegistry = portalConfig.mongoUri
  ? await createMongoSessionRegistry({ uri: portalConfig.mongoUri, secret: portalConfig.sessionSecret })
  : null;
const portalApp = createPortalApp({
  config: portalConfig,
  sessionRegistry,
  readinessCheck: async () => Boolean(
    coreRuntime.isCoreRuntimeReady()
    && examRuntime.isExamRuntimeReady()
    && (!sessionRegistry || await sessionRegistry.ping())
  ),
});
const getPlatformSession = async (req) => {
  if (portalConfig.authDisabled) {
    return { sub: 'local-admin', nonce: 'local-development-session' };
  }
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  return portalApp.locals.verifyConsoleSession(token);
};
const coreWebApp = createCoreWebApp({ coreApp: coreRuntime.app, staticPath: paths.coreStatic });
const router = createPlatformRouter({
  portalApp,
  coreApp: coreWebApp,
  examApp: examRuntime.app,
  notifyApp,
  campusTarget: process.env.CAMPUS_SERVICE_URL || 'http://campus-service:22101',
  mqttTarget: process.env.MQTT_SERVICE_URL || 'http://iot-service:22102',
  coreHosts: process.env.CORE_HOSTS || 'xcx.pxyb.cn',
  examHosts: process.env.EXAM_HOSTS || 'haxx.pxyb.cn',
  notifyHosts: process.env.NOTIFY_HOSTS || 'tongzhiapi.pxyb.cn',
  campusHosts: process.env.CAMPUS_HOSTS || '',
  mqttHosts: process.env.MQTT_HOSTS || '',
  getPlatformSession,
  internalAuthPrivateKey: portalConfig.internalAuthPrivateKey,
  platformPublicOrigin: portalConfig.publicOrigin,
});

const host = process.env.PLATFORM_API_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PLATFORM_API_PORT || '22100', 10);
let shuttingDown = false;

await Promise.all([
  coreRuntime.initializeCoreRuntime(),
  examRuntime.initializeExamRuntime(),
]);

const server = http.createServer((req, res) => {
  router.handler(req, res).catch((error) => {
    console.error('Unhandled platform request:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '平台内部错误。', code: 'PLATFORM_INTERNAL_ERROR' }));
    } else {
      res.destroy(error);
    }
  });
});
server.on('upgrade', (req, socket, head) => {
  router.handleUpgrade(req, socket, head).catch((error) => {
    console.error('Unhandled platform upgrade:', error);
    socket.destroy();
  });
});
server.listen(port, host, () => {
  console.log(`MY Platform API listening on http://${host}:${port}`);
});

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down MY Platform API.`);
  router.close();
  const forceTimer = setTimeout(() => server.closeAllConnections?.(), 10_000);
  forceTimer.unref();
  await new Promise((resolve) => server.close(resolve));
  clearTimeout(forceTimer);
  const results = await Promise.allSettled([
    coreRuntime.closeCoreRuntime(),
    examRuntime.closeExamRuntime(),
    sessionRegistry?.close(),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') console.error(result.reason);
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});
