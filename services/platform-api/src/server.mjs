import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createCoreWebApp, createPlatformRouter } from './router.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function resolveRuntimePath(envName, fallback) {
  return path.resolve(process.env[envName] || path.join(workspaceRoot, fallback));
}

const paths = {
  coreServer: resolveRuntimePath('CORE_SERVER_PATH', 'services/core-api/server.js'),
  coreStatic: resolveRuntimePath('CORE_STATIC_PATH', 'apps/core-admin/dist'),
  examServer: resolveRuntimePath('EXAM_SERVER_PATH', 'services/exam-api/src/server.js'),
  notifyApp: resolveRuntimePath('NOTIFY_APP_PATH', 'services/notification-service/src/app.js'),
  portalApp: resolveRuntimePath('PORTAL_APP_PATH', 'apps/admin-console/src/app.js'),
  portalConfig: resolveRuntimePath('PORTAL_CONFIG_PATH', 'apps/admin-console/src/config.js'),
};

const coreRuntime = require(paths.coreServer);
const examRuntime = require(paths.examServer);
const notifyApp = require(paths.notifyApp);
const [{ createApp: createPortalApp }, { loadConfig: loadPortalConfig }] = await Promise.all([
  import(pathToFileURL(paths.portalApp).href),
  import(pathToFileURL(paths.portalConfig).href),
]);

const portalConfig = loadPortalConfig();
const portalApp = createPortalApp({ config: portalConfig });
const coreWebApp = createCoreWebApp({ coreApp: coreRuntime.app, staticPath: paths.coreStatic });
const router = createPlatformRouter({
  portalApp,
  coreApp: coreWebApp,
  examApp: examRuntime.app,
  notifyApp,
  campusTarget: process.env.CAMPUS_SERVICE_URL || 'http://campus-service:8780',
  mqttTarget: process.env.MQTT_SERVICE_URL || 'http://mqtt-service:4066',
  coreHosts: process.env.CORE_HOSTS || 'xcx.pxyb.cn',
  examHosts: process.env.EXAM_HOSTS || 'haxx.pxyb.cn',
  notifyHosts: process.env.NOTIFY_HOSTS || 'tongzhiapi.pxyb.cn',
  campusHosts: process.env.CAMPUS_HOSTS || '',
  mqttHosts: process.env.MQTT_HOSTS || '',
});

const host = process.env.PLATFORM_API_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PLATFORM_API_PORT || '8080', 10);
let shuttingDown = false;

await Promise.all([
  coreRuntime.initializeCoreRuntime(),
  examRuntime.initializeExamRuntime(),
]);

const server = http.createServer(router.handler);
server.on('upgrade', router.handleUpgrade);
server.listen(port, host, () => {
  console.log(`MY Platform API listening on http://${host}:${port}`);
});

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down MY Platform API.`);
  await new Promise((resolve) => server.close(resolve));
  router.close();
  const results = await Promise.allSettled([
    coreRuntime.closeCoreRuntime(),
    examRuntime.closeExamRuntime(),
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
