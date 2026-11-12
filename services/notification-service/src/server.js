const http = require('http');

const { createApp, loggableError } = require('./app');
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
  let shuttingDown = false;
  let orchestrationPromise = null;
  const runOrchestration = () => {
    if (shuttingDown) return Promise.resolve();
    if (orchestrationPromise) return orchestrationPromise;
    orchestrationPromise = app.locals.notificationOrchestrator.runDue(config.orchestrationBatchSize)
      .catch((error) => {
        console.error('通知编排任务执行失败。', loggableError(error));
      })
      .finally(() => {
        orchestrationPromise = null;
      });
    return orchestrationPromise;
  };
  const orchestrationTimer = setInterval(() => { void runOrchestration(); }, config.orchestrationIntervalMs);
  orchestrationTimer.unref?.();

  server.listen(config.port, () => {
    console.log(`WeCom Notify API 已启动，端口：${config.port}`);
  });

  let shutdownPromise = null;
  async function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    clearInterval(orchestrationTimer);
    app.locals.cmccClient?.close();
    console.log(`收到 ${signal}，正在关闭通知服务。`);
    shutdownPromise = (async () => {
      const serverClosed = new Promise((resolve) => {
        const forceTimer = setTimeout(() => server.closeAllConnections?.(), 10_000);
        forceTimer.unref?.();
        server.close((error) => {
          clearTimeout(forceTimer);
          if (error) {
            console.error(error);
            process.exitCode = 1;
          }
          resolve();
        });
      });
      try {
        await Promise.all([
          serverClosed,
          orchestrationPromise || app.locals.notificationOrchestrator.whenIdle(),
        ]);
      } finally {
        await notificationStore.close();
      }
    })();
    return shutdownPromise;
  }

  const handleSignal = (signal) => {
    void shutdown(signal).catch((error) => {
      console.error('通知服务关闭失败。', error);
      process.exitCode = 1;
    });
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  // Express 4 不接管 async 路由里的拒绝；没有这个兜底时，一个畸形请求就能让进程退出。
  process.on('unhandledRejection', (reason) => {
    console.error('未处理的 Promise 拒绝。', loggableError(reason));
  });
  // 同步异常之后进程状态不可信：记录、排空、以非零码退出，交给容器重启。
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常，通知服务即将退出。', loggableError(error));
    process.exitCode = 1;
    handleSignal('uncaughtException');
  });
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

start().catch((error) => {
  console.error('通知服务启动失败。', error);
  process.exitCode = 1;
});
