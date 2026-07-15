const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { configFile, defaultConfig } = require('../config');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripUtf8Bom(value) {
  return typeof value === 'string' ? value.replace(/^\uFEFF/, '') : value;
}

const SECRET_DIRECTIVE_VALUES = new Set(['preserve', 'replace', 'clear']);

function normalizeSecretDirectives(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const pick = (key) => (SECRET_DIRECTIVE_VALUES.has(value[key]) ? value[key] : 'preserve');

  return {
    mqttPassword: pick('mqttPassword'),
    authPassword: pick('authPassword'),
    authSessionSecret: pick('authSessionSecret')
  };
}

function resolveSecretValue(currentValue, nextValue, directive) {
  if (directive === 'clear') {
    return '';
  }

  if (directive === 'replace') {
    return String(nextValue ?? '');
  }

  return String(currentValue ?? '');
}

function applySecretDirectives(currentConfig, partialConfig) {
  const input = partialConfig && typeof partialConfig === 'object' ? partialConfig : {};
  const nextInput = deepClone(input);
  const directives = normalizeSecretDirectives(nextInput.secretDirectives);
  delete nextInput.secretDirectives;

  nextInput.mqtt = nextInput.mqtt && typeof nextInput.mqtt === 'object' ? nextInput.mqtt : {};
  nextInput.auth = nextInput.auth && typeof nextInput.auth === 'object' ? nextInput.auth : {};

  nextInput.mqtt.password = resolveSecretValue(
    currentConfig.mqtt.password,
    nextInput.mqtt.password,
    directives.mqttPassword
  );
  nextInput.auth.password = resolveSecretValue(
    currentConfig.auth.password,
    nextInput.auth.password,
    directives.authPassword
  );
  nextInput.auth.sessionSecret = resolveSecretValue(
    currentConfig.auth.sessionSecret,
    nextInput.auth.sessionSecret,
    directives.authSessionSecret
  );

  return nextInput;
}

function createSecretState(config) {
  return {
    mqttPasswordConfigured: Boolean(config.mqtt.password),
    authPasswordConfigured: Boolean(config.auth.password),
    authSessionSecretConfigured: Boolean(config.auth.sessionSecret)
  };
}

function sanitizeConfigForPublic(config) {
  return {
    ...deepClone(config),
    mqtt: {
      ...deepClone(config.mqtt),
      password: ''
    },
    auth: {
      ...deepClone(config.auth),
      password: '',
      sessionSecret: ''
    }
  };
}

function buildPublicConfigPayload(config) {
  return {
    config: sanitizeConfigForPublic(config),
    secretState: createSecretState(config)
  };
}

function mergeObjects(base, override) {
  const source = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  const extra = override && typeof override === 'object' && !Array.isArray(override) ? override : {};
  const result = { ...source };

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) {
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeObjects(source[key], value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeDevices(devices, defaults = []) {
  if (!Array.isArray(devices)) {
    return defaults;
  }

  return devices.map((device, index) => {
    const defaultDev = defaults.find(d => d.id === device.id) || {};
    const id = String(device.id || defaultDev.id || `device_${index}`).trim();
    const name = String(device.name || defaultDev.name || `设备 ${index}`).trim();

    const rawTopics = device.topics || {};
    const defaultTopics = defaultDev.topics || {};
    const topics = {
      online: String(rawTopics.online || defaultTopics.online || '').trim(),
      temp: rawTopics.temp !== undefined ? String(rawTopics.temp).trim() : undefined,
      hum: rawTopics.hum !== undefined ? String(rawTopics.hum).trim() : undefined
    };

    let relays = undefined;
    if (Array.isArray(device.relays)) {
      relays = device.relays.map((relay, rIndex) => {
        const defaultRelay = (defaultDev.relays && defaultDev.relays.find(r => r.id === relay.id)) || {};
        return {
          id: String(relay.id || defaultRelay.id || `relay_${rIndex}`).trim(),
          name: String(relay.name || defaultRelay.name || `继电器 ${rIndex + 1}`).trim(),
          statusTopic: String(relay.statusTopic || defaultRelay.statusTopic || '').trim(),
          controlTopic: String(relay.controlTopic || defaultRelay.controlTopic || '').trim()
        };
      });
    }

    return { id, name, topics, relays };
  });
}

function normalizeConfig(input, defaults = defaultConfig) {
  const merged = mergeObjects(defaults, input);
  const mqttDefaults = defaults.mqtt;
  const apiDefaults = defaults.api;
  const authDefaults = defaults.auth;
  const dashboardDefaults = defaults.dashboard;
  const devicesDefaults = defaults.devices;

  return {
    mqtt: {
      url: String(merged.mqtt.url || mqttDefaults.url).trim(),
      username: String(merged.mqtt.username ?? mqttDefaults.username),
      password: String(merged.mqtt.password ?? mqttDefaults.password),
      clientId: String(merged.mqtt.clientId || mqttDefaults.clientId).trim(),
      clean: normalizeBoolean(merged.mqtt.clean, mqttDefaults.clean),
      qos: clampInteger(merged.mqtt.qos, mqttDefaults.qos, 0, 2),
      reconnectPeriod: clampInteger(merged.mqtt.reconnectPeriod, mqttDefaults.reconnectPeriod, 0, 3600000),
      connectTimeout: clampInteger(merged.mqtt.connectTimeout, mqttDefaults.connectTimeout, 1000, 3600000)
    },
    devices: normalizeDevices(merged.devices, devicesDefaults),
    api: {
      port: clampInteger(merged.api.port, apiDefaults.port, 1, 65535),
      deviceOnlineThreshold: clampInteger(
        merged.api.deviceOnlineThreshold,
        apiDefaults.deviceOnlineThreshold,
        0,
        86400000
      ),
      webhookUrl: String(merged.api.webhookUrl ?? apiDefaults.webhookUrl).trim(),
      webhookEnabled: normalizeBoolean(merged.api.webhookEnabled, apiDefaults.webhookEnabled),
      discoveryTopic: String(merged.api.discoveryTopic ?? apiDefaults.discoveryTopic).trim()
    },
    auth: {
      enabled: normalizeBoolean(merged.auth.enabled, authDefaults.enabled),
      username: String(merged.auth.username ?? authDefaults.username).trim(),
      password: String(merged.auth.password ?? authDefaults.password),
      sessionSecret: String(merged.auth.sessionSecret || authDefaults.sessionSecret).trim(),
      sessionTtlHours: clampInteger(merged.auth.sessionTtlHours, authDefaults.sessionTtlHours, 1, 720)
    },
    dashboard: {
      refreshInterval: clampInteger(
        merged.dashboard.refreshInterval,
        dashboardDefaults.refreshInterval,
        1000,
        3600000
      ),
      dataRetentionDays: clampInteger(
        merged.dashboard.dataRetentionDays,
        dashboardDefaults.dataRetentionDays,
        0,
        3650
      )
    }
  };
}

function validateConfig(config) {
  const errors = [];

  if (!config.mqtt.url) {
    errors.push('MQTT 地址不能为空。');
  }

  if (!config.mqtt.clientId) {
    errors.push('MQTT Client ID 不能为空。');
  }

  if (config.auth.enabled && !config.auth.password) {
    errors.push('启用登录鉴权时，密码不能为空。');
  }

  if (config.auth.enabled && !config.auth.sessionSecret) {
    errors.push('启用登录鉴权时，Session Secret 不能为空。');
  }

  if (config.api.webhookEnabled && !config.api.webhookUrl) {
    errors.push('启用告警推送时，Webhook URL 不能为空。');
  }

  if (!Array.isArray(config.devices) || config.devices.length === 0) {
    errors.push('设备列表不能为空。');
  } else {
    config.devices.forEach((device, index) => {
      if (!device.id) {
        errors.push(`第 ${index + 1} 个设备的 ID 不能为空。`);
      }
      if (!device.name) {
        errors.push(`设备 ${device.id || index + 1} 的名称不能为空。`);
      }
      if (device.topics) {
        if (device.topics.temp && !device.topics.temp.trim()) {
          errors.push(`设备 ${device.name} 的温度主题不能为空。`);
        }
        if (device.topics.hum && !device.topics.hum.trim()) {
          errors.push(`设备 ${device.name} 的湿度主题不能为空。`);
        }
      }
      if (Array.isArray(device.relays)) {
        device.relays.forEach((relay, rIndex) => {
          if (!relay.id) {
            errors.push(`设备 ${device.name} 的第 ${rIndex + 1} 个继电器 ID 不能为空。`);
          }
          if (!relay.statusTopic) {
            errors.push(`设备 ${device.name} 继电器 ${relay.id || rIndex + 1} 的状态主题不能为空。`);
          }
        });
      }
    });
  }

  return errors;
}

class SettingsStore extends EventEmitter {
  constructor() {
    super();
    this.filePath = configFile;
    this.defaults = normalizeConfig(defaultConfig, defaultConfig);
    this.config = deepClone(this.defaults);
  }

  initialize() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    let loaded = {};
    let shouldPersist = false;

    if (fs.existsSync(this.filePath)) {
      try {
        loaded = JSON.parse(stripUtf8Bom(fs.readFileSync(this.filePath, 'utf8')));
      } catch (error) {
        throw new Error(`配置文件读取失败: ${error.message}`);
      }
    } else {
      shouldPersist = true;
    }

    const normalized = normalizeConfig(loaded, this.defaults);

    // 自动用随机密钥替换不安全的默认 Session Secret，防止签名被伪造漏洞
    if (normalized.auth.sessionSecret === 'change-me-in-production') {
      const crypto = require('crypto');
      normalized.auth.sessionSecret = crypto.randomBytes(32).toString('hex');
      console.warn('\x1b[33m%s\x1b[0m', '【安全警报】检测到默认的 sessionSecret，已自动生成强随机密钥进行替换以保证登录 Session 的安全性！');
      shouldPersist = true;
    }

    const errors = validateConfig(normalized);
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    this.config = normalized;

    if (!fs.existsSync(this.filePath) || JSON.stringify(loaded) !== JSON.stringify(normalized)) {
      shouldPersist = true;
    }

    if (shouldPersist) {
      this.persist(normalized);
    }

    return this.getConfig();
  }

  persist(config) {
    fs.writeFileSync(this.filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  getConfig() {
    return deepClone(this.config);
  }

  getDefaults() {
    return deepClone(this.defaults);
  }

  getPublicConfig() {
    return buildPublicConfigPayload(this.config);
  }

  getPublicDefaults() {
    return buildPublicConfigPayload(this.defaults);
  }

  getConfigPath() {
    return this.filePath;
  }

  saveConfig(partialConfig) {
    const previous = this.getConfig();
    const input = applySecretDirectives(this.config, partialConfig);
    const merged = mergeObjects(this.config, input);
    const next = normalizeConfig(merged, this.defaults);
    const errors = validateConfig(next);

    if (errors.length > 0) {
      const error = new Error(errors.join(' '));
      error.statusCode = 400;
      throw error;
    }

    this.persist(next);
    this.config = next;
    this.emit('updated', { previous, current: this.getConfig() });

    return {
      previous,
      config: this.getConfig()
    };
  }

  resetConfig() {
    const previous = this.getConfig();
    const next = this.getDefaults();

    this.persist(next);
    this.config = next;
    this.emit('updated', { previous, current: this.getConfig() });

    return {
      previous,
      config: this.getConfig()
    };
  }
}

module.exports = {
  SettingsStore,
  applySecretDirectives,
  buildPublicConfigPayload,
  normalizeConfig,
  sanitizeConfigForPublic
};
