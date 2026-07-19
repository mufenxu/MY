import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMongoSessionRegistry } from './mongo-session-registry.js';
import { createMongoOperationsStore } from './operations-store.js';
import { createMongoReleaseStore } from './release-store.js';

const config = loadConfig();
const sessionRegistry = config.mongoUri
  ? await createMongoSessionRegistry({ uri: config.mongoUri, secret: config.sessionSecret })
  : null;
const operationsStore = config.mongoUri
  ? await createMongoOperationsStore({
    uri: config.mongoUri,
    statusRetentionDays: config.statusRetentionDays,
    auditRetentionDays: config.auditRetentionDays,
  })
  : null;
const releaseStore = config.mongoUri
  ? await createMongoReleaseStore({ uri: config.mongoUri })
  : null;
const app = createApp({
  config,
  sessionRegistry,
  operationsStore,
  releaseStore,
  readinessCheck: async () => {
    const [sessionsReady, operationsReady, releasesReady] = await Promise.all([
      sessionRegistry ? sessionRegistry.ping() : true,
      operationsStore ? operationsStore.ping() : true,
      releaseStore ? releaseStore.ping() : true,
    ]);
    return sessionsReady && operationsReady && releasesReady;
  },
});
app.locals.operationsCenter.start();
const server = app.listen(config.port, config.host, () => {
  console.log(`统一服务控制台 API 已启动：http://${config.host}:${config.port}`);
  if (config.authDisabled) console.warn('当前为本地开发免登录模式。');
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`收到 ${signal}，正在关闭服务。`);
  const forceTimer = setTimeout(() => server.closeAllConnections?.(), 10_000);
  forceTimer.unref();
  server.close(async (error) => {
    clearTimeout(forceTimer);
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
    await sessionRegistry?.close();
    app.locals.operationsCenter.stop();
    await operationsStore?.close();
    await releaseStore?.close();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
