const path = require('path');

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const configFile = process.env.CONFIG_FILE || path.join(dataDir, 'config.json');

const defaultConfig = {
  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clientId: process.env.MQTT_CLIENT_ID || 'node_api_client',
    clean: boolFromEnv('MQTT_CLEAN', true),
    qos: intFromEnv('MQTT_QOS', 0),
    reconnectPeriod: intFromEnv('MQTT_RECONNECT_PERIOD', 1000),
    connectTimeout: intFromEnv('MQTT_CONNECT_TIMEOUT', 30000)
  },
  devices: [
    {
      id: 'esp8266_living',
      name: '客厅监控设备',
      topics: {
        online: 'home/relay/online',
        temp: 'home/esp8266/sensor/temp',
        hum: 'home/esp8266/sensor/hum'
      },
      relays: [
        {
          id: 'relay1',
          name: '客厅灯光继电器',
          statusTopic: 'home/esp8266/relay/status',
          controlTopic: 'home/esp8266/relay/control'
        }
      ]
    },
    {
      id: 'relay_balcony',
      name: '阳台继电器',
      topics: {
        online: 'home/relay/online'
      },
      relays: [
        {
          id: 'relay2',
          name: '阳台插座继电器',
          statusTopic: 'home/relay/status',
          controlTopic: 'home/relay/control'
        }
      ]
    }
  ],
  api: {
    port: intFromEnv('API_PORT', 22102),
    deviceOnlineThreshold: intFromEnv('DEVICE_ONLINE_THRESHOLD', 60000),
    webhookUrl: process.env.WEBHOOK_URL || '',
    webhookEnabled: boolFromEnv('WEBHOOK_ENABLED', false),
    discoveryTopic: process.env.DISCOVERY_TOPIC || '+/+/+'
  },
  auth: {
    enabled: boolFromEnv('AUTH_ENABLED', false),
    username: process.env.AUTH_USERNAME || 'admin',
    password: process.env.AUTH_PASSWORD || '',
    sessionSecret: process.env.AUTH_SESSION_SECRET || 'change-me-in-production',
    sessionTtlHours: intFromEnv('AUTH_SESSION_TTL_HOURS', 24)
  },
  dashboard: {
    refreshInterval: intFromEnv('DASHBOARD_REFRESH_INTERVAL', 5000),
    dataRetentionDays: intFromEnv('DATA_RETENTION_DAYS', 30)
  }
};

module.exports = {
  dataDir,
  configFile,
  defaultConfig
};
