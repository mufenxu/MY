const http = require('http');

const { createApp } = require('./app');
const config = require('./config');
const { createMemoryNotificationStore, createMongoNotificationStore } = require('./notification-store');

async function start() {
  const notificationStore = config.mongoUri
    ? await createMongoNotificationStore({
      uri: config.mongoUri,
      databaseName: config.mongoDatabase,
      encryptionKey: config.historyEncryptionKey,
      retentionDays: config.historyRetentionDays,
    })
    : createMemoryNotificationStore({
      encryptionKey: config.historyEncryptionKey,
      retentionDays: config.historyRetentionDays,
    });
  const app = createApp({ config, notificationStore });
  const server = http.createServer(app);

  server.listen(config.port, () => {
    console.log(`WeCom Notify API 已启动，端口：${config.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`收到 ${signal}，正在关闭通知服务。`);
    const forceTimer = setTimeout(() => server.closeAllConnections?.(), 10_000);
    forceTimer.unref();
    server.close(async (error) => {
      clearTimeout(forceTimer);
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
      await notificationStore.close();
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('通知服务启动失败。', error);
  process.exitCode = 1;
});
