const { createApiServer } = require('./http/apiServer');
const { MqttService } = require('./services/mqttClient');
const { SettingsStore } = require('./settings/settingsStore');
const { getDatabase } = require('./storage/db');

function registerShutdown(server, mqttService, closeRealtime) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    const serverClosed = new Promise((resolve) => server.close(resolve));
    const forceTimer = setTimeout(() => server.closeAllConnections?.(), 5000);
    forceTimer.unref?.();

    try {
      await Promise.allSettled([
        mqttService.stop({ force: false }),
        closeRealtime?.()
      ]);
      await serverClosed;
      await mqttService.db?.close?.();
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (error) {
      console.error('Failed to shut down cleanly:', error);
      process.exit(1);
    }
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

  const database = getDatabase();
  await database.initialize();
  const settingsStore = new SettingsStore({ storage: database });
  const initialConfig = await settingsStore.initialize();
  const mqttService = new MqttService(settingsStore, database);
  const { closeRealtime, server } = createApiServer({ settingsStore, mqttService });

  await mqttService.start({ databaseInitialized: true });
  await listen(server, initialConfig.api.port);

  console.log(`API server listening on port ${initialConfig.api.port}`);
  console.log(`Dashboard: http://localhost:${initialConfig.api.port}`);

  registerShutdown(server, mqttService, closeRealtime);
}

main().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
