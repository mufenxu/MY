import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closePortalStores, createPersistentPortalStores, pingPortalStores } from './portal-stores.js';

const config = loadConfig();
const stores = await createPersistentPortalStores({ config });
const app = createApp({
  config,
  ...stores,
  readinessCheck: () => pingPortalStores(stores),
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
    app.locals.operationsCenter.stop();
    const errors = await closePortalStores(stores);
    if (errors.length) {
      console.error(new AggregateError(errors, 'Failed to close portal stores.'));
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
