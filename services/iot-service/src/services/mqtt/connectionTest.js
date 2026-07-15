const mqtt = require('mqtt');

function testMqttConnection(url, options = {}) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const client = mqtt.connect(url, {
      clientId: options.clientId || 'test_client_' + Math.random().toString(16).slice(2, 8),
      username: options.username,
      password: options.password,
      connectTimeout: 3000,
      reconnectPeriod: 0
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.end(true);
        reject(new Error('MQTT 连接测试超时 (3秒内未建立连接)'));
      }
    }, 3000);

    client.on('connect', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        client.end(true);
        resolve(true);
      }
    });

    client.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        client.end(true);
        reject(error);
      }
    });
  });
}

module.exports = {
  testMqttConnection
};
