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

  const req = httpLib.request(options, (res) => {
    res.resume();
  });

  req.on('error', (error) => {
    console.error('Webhook notification failed:', error.message);
  });

  req.write(postData);
  req.end();
}

async function sendDevicePresenceWebhook(config, type, device) {
  if (!config.api.webhookEnabled || !config.api.webhookUrl) {
    return;
  }

  const payload = createDevicePresencePayload(type, device, config.api.deviceOnlineThreshold);

  try {
    postJson(config.api.webhookUrl, payload);
  } catch (error) {
    console.error('Webhook URL parse error:', error.message);
  }
}

module.exports = {
  createDevicePresencePayload,
  sendDevicePresenceWebhook
};
