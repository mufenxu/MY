const http = require('http');
const https = require('https');

function createDevicePresencePayload(type, device, thresholdMs) {
  return {
    event: type === 'online' ? 'device_online' : 'device_offline',
    title: type === 'online' ? '🚨 物联网设备恢复上线' : '🚨 物联网设备失联告警',
    message: type === 'online'
      ? `设备【${device.name}】(ID: ${device.id}) 已恢复连接，重新开始上报传感器数据。`
      : `设备【${device.name}】(ID: ${device.id}) 已超过 ${thresholdMs / 1000} 秒未收到任何消息，已被判定为离线。`,
    timestamp: Date.now(),
    deviceId: device.id,
    deviceName: device.name
  };
}

function postJson(webhookUrl, payload, timeout = 5000) {
  const url = new URL(webhookUrl);
  const httpLib = url.protocol === 'https:' ? https : http;
  const postData = JSON.stringify(payload);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout
  };

  return new Promise((resolve, reject) => {
    const req = httpLib.request(options, (res) => {
      res.resume();
      res.once('end', () => resolve(res.statusCode));
    });

    req.once('timeout', () => {
      const error = new Error(`Webhook request timed out after ${timeout}ms`);
      error.code = 'ETIMEDOUT';
      req.destroy(error);
    });
    req.once('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendDevicePresenceWebhook(config, type, device) {
  if (!config.api.webhookEnabled || !config.api.webhookUrl) {
    return;
  }

  const payload = createDevicePresencePayload(type, device, config.api.deviceOnlineThreshold);

  try {
    await postJson(config.api.webhookUrl, payload);
  } catch (error) {
    console.error('Webhook notification failed:', error.message);
  }
}

module.exports = {
  createDevicePresencePayload,
  postJson,
  sendDevicePresenceWebhook
};
