const { createApiServer } = require('./http/apiServer');
const { MqttService } = require('./services/mqttClient');
const { SettingsStore } = require('./settings/settingsStore');

function registerShutdown(server, mqttService) {
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    server.close(async () => {
      mqttService.stop();

      try {
        await mqttService.db?.close?.();
        process.exit(0);
      } catch (error) {
        console.error('Failed to close database cleanly:', error);
        process.exit(1);
      }
    });

    setTimeout(() => {
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.listen(port, onListening);
  });
}

async function main() {
  console.log('Starting MQTT dashboard service...');

  const settingsStore = new SettingsStore();
  const initialConfig = settingsStore.initialize();
  const mqttService = new MqttService(settingsStore);
  const { server } = createApiServer({ settingsStore, mqttService });

  await mqttService.start();
  await listen(server, initialConfig.api.port);

  console.log(`API server listening on port ${initialConfig.api.port}`);
  console.log(`Dashboard: http://localhost:${initialConfig.api.port}`);

  registerShutdown(server, mqttService);
}

main().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
