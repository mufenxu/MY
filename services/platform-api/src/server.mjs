import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createOfficialWebsiteApp, createPlatformRouter } from './router.mjs';
import { createEmbeddedServices } from './embedded-services.mjs';
import {
  closePortalStores,
  createPersistentPortalStores,
  pingPortalStores,
} from './portal-store-lifecycle.mjs';
import { resolveRuntimePaths } from './runtime-paths.mjs';
import { checkExternalServices, resolveServiceMode } from './service-targets.mjs';
import { createSessionVerifierCache } from './session-cache.mjs';
import { SESSION_COOKIE_NAME, parseCookies, sessionCookieName } from '../../../apps/admin-console/src/auth.js';

const require = createRequire(import.meta.url);
const serviceMode = resolveServiceMode();
const { paths } = resolveRuntimePaths({ includeLocalServices: !serviceMode.external });

let coreRuntime = null;
let examRuntime = null;
if (!serviceMode.external) {
  coreRuntime = require(paths.coreServer);
  examRuntime = require(paths.examServer);
}
const embeddedServices = serviceMode.external ? null : createEmbeddedServices({
  core: coreRuntime,
  exam: examRuntime,
  targets: serviceMode.targets,
});
let shuttingDown = false;
const [{ createApp: createPortalApp }, { loadConfig: loadPortalConfig }] = await Promise.all([
  import(pathToFileURL(paths.portalApp).href),
  import(pathToFileURL(paths.portalConfig).href),
]);
const { createMongoSessionRegistry } = await import(
  pathToFileURL(paths.portalMongoSessionRegistry).href
);
const { createMongoAuthStore } = await import(pathToFileURL(paths.portalAuthStore).href);
const { createMongoAuthRiskStore } = await import(pathToFileURL(paths.portalAuthRiskStore).href);
const { createMongoOperationsStore } = await import(
  pathToFileURL(paths.portalOperationsStore).href
);
const { createMongoReleaseStore } = await import(pathToFileURL(paths.portalReleaseStore).href);
const { createMongoConfigurationStore } = await import(
  pathToFileURL(paths.portalConfigurationStore).href
);
const { createMongoQrLoginStore } = await import(
  pathToFileURL(paths.portalQrLoginStore).href
);
const { createMongoWebLoginTicketStore } = await import(
  pathToFileURL(paths.portalWebLoginTicketStore).href
);
const { createMongoGoogleAccountStore } = await import(
  pathToFileURL(paths.portalGoogleAccountStore).href
);
const { createMongoExternalApplicationStore } = await import(
  pathToFileURL(paths.portalExternalApplicationStore).href
);

const portalConfig = loadPortalConfig();
const portalStores = await createPersistentPortalStores({
  config: portalConfig,
  factories: {
    createMongoAuthStore,
    createMongoAuthRiskStore,
    createMongoSessionRegistry,
    createMongoOperationsStore,
    createMongoReleaseStore,
    createMongoConfigurationStore,
    createMongoQrLoginStore,
    createMongoWebLoginTicketStore,
    createMongoGoogleAccountStore,
    createMongoExternalApplicationStore,
  },
});
const {
  authStore,
  authRiskStore,
  sessionRegistry,
  operationsStore,
  releaseStore,
  configurationStore,
  qrLoginStore,
  webLoginTicketStore,
  googleAccountStore,
  externalApplicationStore,
} = portalStores;
const readinessCheck = async () => {
  if (shuttingDown) return false;
  const [servicesReady, storesReady] = await Promise.all([
    serviceMode.external
      ? checkExternalServices(serviceMode.targets)
      : Promise.resolve(embeddedServices.isReady()),
    pingPortalStores(portalStores),
  ]);
  return Boolean(servicesReady && storesReady);
};
const portalApp = createPortalApp({
  config: portalConfig,
  serviceTargets: { core: serviceMode.targets.core, exam: serviceMode.targets.exam },
  authStore,
  authRiskStore,
  sessionRegistry,
  operationsStore,
  releaseStore,
  configurationStore,
  qrLoginStore,
  webLoginTicketStore,
  googleAccountStore,
  externalApplicationStore,
  readinessCheck,
});
const sessionVerifierCache = createSessionVerifierCache({
  verify: (token) => portalApp.locals.verifyConsoleSession(token),
  ttlMs: process.env.PLATFORM_SESSION_CACHE_TTL_MS || 5_000,
  negativeTtlMs: process.env.PLATFORM_SESSION_NEGATIVE_CACHE_TTL_MS || 1_000,
  maxEntries: process.env.PLATFORM_SESSION_CACHE_MAX_ENTRIES || 2_048,
});
portalApp.locals.onConsoleSessionRevoked = (token) => sessionVerifierCache.invalidate(token);
portalApp.locals.onConsoleSessionChanged = (token) => sessionVerifierCache.invalidate(token);
portalApp.locals.onConsoleSessionsChanged = () => sessionVerifierCache.clear();
const getPlatformSession = async (req) => {
  if (portalConfig.authDisabled) {
    return { sub: 'local-admin', role: 'super_admin', nonce: 'local-development-session' };
  }
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[sessionCookieName(portalConfig.isProduction)] || cookies[SESSION_COOKIE_NAME];
  return sessionVerifierCache.verify(token);
};
const websiteApp = createOfficialWebsiteApp({ staticPath: paths.officialWebsiteStatic });
const router = createPlatformRouter({
  portalApp,
  websiteApp,
  campusTarget: serviceMode.targets.campus || 'http://campus-service:22101',
  mqttTarget: serviceMode.targets.iot || 'http://iot-service:22102',
  coreTarget: serviceMode.targets.core,
  examTarget: serviceMode.targets.exam,
  notifyTarget: serviceMode.targets.notify,
  coreHosts: process.env.CORE_HOSTS || 'xcx.pxyb.cn',
  examHosts: process.env.EXAM_HOSTS || 'haxx.pxyb.cn',
  notifyHosts: process.env.NOTIFY_HOSTS || 'tongzhiapi.pxyb.cn',
  campusHosts: process.env.CAMPUS_HOSTS || '',
  mqttHosts: process.env.MQTT_HOSTS || '',
  getPlatformSession,
  internalAuthPrivateKey: portalConfig.internalAuthPrivateKey,
  platformPublicOrigin: portalConfig.publicOrigin,
  proxyTimeoutMs: process.env.PLATFORM_PROXY_TIMEOUT_MS || 15_000,
  recordProxyMetric: (metric) => {
    portalApp.locals.recordProxyMetric(metric);
    console.info(JSON.stringify({ event: 'platform_proxy_request', ...metric }));
  },
});

const host = process.env.PLATFORM_API_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PLATFORM_API_PORT || '22100', 10);

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
const connections = new Set();
server.on('connection', (socket) => {
  connections.add(socket);
  socket.once('close', () => connections.delete(socket));
});
server.requestTimeout = portalConfig.backupTransferTimeoutMs;
server.on('upgrade', (req, socket, head) => {
  router.handleUpgrade(req, socket, head).catch((error) => {
    console.error('Unhandled platform upgrade:', error);
    socket.destroy();
  });
});

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down MY Platform API.`);
  portalApp.locals.operationsCenter.stop();
  sessionVerifierCache.clear();
  const deadline = setTimeout(() => {
    console.error('主后端关闭超时，终止进程。');
    process.exit(1);
  }, 50_000);
  deadline.unref();
  const forceTimer = setTimeout(() => {
    // HTTP closeAllConnections does not include upgraded WebSocket connections.
    for (const socket of connections) socket.destroy();
  }, 10_000);
  forceTimer.unref();
  await new Promise((resolve) => server.close(resolve));
  clearTimeout(forceTimer);
  router.close();
  const results = await Promise.allSettled([
    embeddedServices?.close(),
    closePortalStores(portalStores).then((errors) => {
      if (errors.length) throw new AggregateError(errors, 'Failed to close one or more portal stores.');
    }),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(result.reason);
      exitCode = 1;
    }
  }
  clearTimeout(deadline);
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

try {
  await embeddedServices?.start();
  if (!shuttingDown) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
    portalApp.locals.operationsCenter.start();
    console.log(`MY Platform API listening on http://${host}:${port}`);
  }
} catch (error) {
  console.error('主后端启动失败。', error);
  await shutdown('startup failure', 1);
}
