import { createApp } from './app.js';
import { createMongoAuthRiskStore } from './auth-risk-store.js';
import { createMongoAuthStore } from './auth-store.js';
import { loadConfig } from './config.js';
import { createMongoSessionRegistry } from './mongo-session-registry.js';
import { createMongoOperationsStore } from './operations-store.js';
import { createMongoReleaseStore } from './release-store.js';
import { createMongoConfigurationStore } from './configuration-store.js';

const config = loadConfig();
const authStore = config.mongoUri
  ? await createMongoAuthStore({
    uri: config.mongoUri,
    encryptionKey: config.authEncryptionKey,
    issuer: config.webauthnRpName,
    bootstrap: {
      username: config.adminUsername,
      passwordHash: config.adminPasswordHash,
      role: config.adminRole,
      totpSecret: config.adminTotpSecret,
    },
  })
  : null;
const authRiskStore = config.mongoUri
  ? await createMongoAuthRiskStore({
    uri: config.mongoUri,
    encryptionKey: config.authEncryptionKey,
    challengeConfigured: Boolean(config.turnstileSiteKey && config.turnstileSecretKey),
    windowMinutes: config.loginWindowMinutes,
    maxAttempts: config.loginMaxAttempts,
    challengeThreshold: config.loginChallengeThreshold,
    backoffBaseMs: config.loginBackoffBaseMs,
    backoffMaxMs: config.loginBackoffMaxMs,
  })
  : null;
const sessionRegistry = config.mongoUri
  ? await createMongoSessionRegistry({
    uri: config.mongoUri,
    secret: config.sessionSecret,
    idleTimeoutMinutes: config.sessionIdleMinutes,
  })
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
const configurationStore = config.mongoUri
  ? await createMongoConfigurationStore({ uri: config.mongoUri })
  : null;
const app = createApp({
  config,
  authStore,
  authRiskStore,
  sessionRegistry,
  operationsStore,
  releaseStore,
  configurationStore,
  readinessCheck: async () => {
    const [authReady, riskReady, sessionsReady, operationsReady, releasesReady, configurationReady] = await Promise.all([
      authStore ? authStore.ping() : true,
      authRiskStore ? authRiskStore.ping() : true,
      sessionRegistry ? sessionRegistry.ping() : true,
      operationsStore ? operationsStore.ping() : true,
      releaseStore ? releaseStore.ping() : true,
      configurationStore ? configurationStore.ping() : true,
    ]);
    return authReady && riskReady && sessionsReady && operationsReady && releasesReady && configurationReady;
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
    await Promise.allSettled([authStore?.close(), authRiskStore?.close(), sessionRegistry?.close()]);
    app.locals.operationsCenter.stop();
    await operationsStore?.close();
    await releaseStore?.close();
    await configurationStore?.close();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
