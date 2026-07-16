import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMongoSessionRegistry } from './mongo-session-registry.js';

const config = loadConfig();
const sessionRegistry = config.mongoUri
  ? await createMongoSessionRegistry({ uri: config.mongoUri, secret: config.sessionSecret })
  : null;
const app = createApp({
  config,
  sessionRegistry,
  readinessCheck: async () => !sessionRegistry || sessionRegistry.ping(),
});
const server = app.listen(config.port, config.host, () => {
  console.log(`MY 管理中心 API 已启动：http://${config.host}:${config.port}`);
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
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
