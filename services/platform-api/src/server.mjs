import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createCoreWebApp, createPlatformRouter } from './router.mjs';
import { resolveRuntimePaths } from './runtime-paths.mjs';

const require = createRequire(import.meta.url);
const { paths } = resolveRuntimePaths();

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
  campusTarget: process.env.CAMPUS_SERVICE_URL || 'http://campus-service:22101',
  mqttTarget: process.env.MQTT_SERVICE_URL || 'http://iot-service:22102',
  coreHosts: process.env.CORE_HOSTS || 'xcx.pxyb.cn',
  examHosts: process.env.EXAM_HOSTS || 'haxx.pxyb.cn',
  notifyHosts: process.env.NOTIFY_HOSTS || 'tongzhiapi.pxyb.cn',
  campusHosts: process.env.CAMPUS_HOSTS || '',
  mqttHosts: process.env.MQTT_HOSTS || '',
});

const host = process.env.PLATFORM_API_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PLATFORM_API_PORT || '22100', 10);
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
