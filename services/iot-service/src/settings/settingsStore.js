const { EventEmitter } = require('events');
const { defaultConfig } = require('../config');
const { hashPassword, isPasswordHash } = require('../security/password');

const TEMPLATE_PASSWORDS = new Set([
  'admin',
  'changeme',
  'change-me',
  'password',
  'replace_with_strong_password',
  'secret-password'
]);
const TEMPLATE_SESSION_SECRETS = new Set([
  'change-me-in-production',
  'replace_with_at_least_32_random_characters',
  'session-secret'
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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

function validateProductionSecrets(auth, nodeEnv = process.env.NODE_ENV) {
  const errors = [];
  if (nodeEnv !== 'production' || !auth.enabled) return errors;

  const password = String(auth.password || '');
  if (!isPasswordHash(password)) {
    if (password.length < 16) errors.push('生产环境管理员密码至少需要 16 个字符。');
    if (TEMPLATE_PASSWORDS.has(password.trim().toLowerCase())) {
      errors.push('生产环境管理员密码不能使用模板默认值。');
    }
  }

  const sessionSecret = String(auth.sessionSecret || '').trim();
  if (sessionSecret.length < 32) errors.push('生产环境 Session Secret 至少需要 32 个字符。');
  if (TEMPLATE_SESSION_SECRETS.has(sessionSecret.toLowerCase())) {
    errors.push('生产环境 Session Secret 不能使用模板默认值。');
  }
  return errors;
}

function hasInvalidProductionPassword(password) {
  const value = String(password || '');
  if (isPasswordHash(value)) return false;
  return value.length < 16 || TEMPLATE_PASSWORDS.has(value.trim().toLowerCase());
}

function hasInvalidProductionSessionSecret(sessionSecret) {
  const value = String(sessionSecret || '').trim();
  return value.length < 32 || TEMPLATE_SESSION_SECRETS.has(value.toLowerCase());
}

function refreshInvalidProductionAuthSecrets(config, defaults, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== 'production' || !config.auth.enabled) {
    return { config, refreshed: false };
  }

  const next = deepClone(config);
  let refreshed = false;

  if (hasInvalidProductionPassword(next.auth.password)) {
    next.auth.password = defaults.auth.password;
    refreshed = true;
  }

  if (hasInvalidProductionSessionSecret(next.auth.sessionSecret)) {
    next.auth.sessionSecret = defaults.auth.sessionSecret;
    refreshed = true;
  }

  return { config: next, refreshed };
}

function protectAuthPassword(config) {
  const protectedConfig = deepClone(config);
  protectedConfig.auth.password = hashPassword(protectedConfig.auth.password);
  return protectedConfig;
}

class SettingsStore extends EventEmitter {
  constructor({ storage } = {}) {
    super();
    if (!storage) throw new Error('SettingsStore requires a MongoDB storage adapter.');
    this.storage = storage;
    const normalizedDefaults = normalizeConfig(defaultConfig, defaultConfig);
    const defaultSecretErrors = validateProductionSecrets(normalizedDefaults.auth);
    if (defaultSecretErrors.length > 0) throw new Error(defaultSecretErrors.join(' '));
    this.defaults = protectAuthPassword(normalizedDefaults);
    this.config = deepClone(this.defaults);
  }

  async initialize() {
    let loaded = await this.storage.loadSettings() || {};
    let shouldPersist = false;
    if (Object.keys(loaded).length === 0) shouldPersist = true;

    let normalized = normalizeConfig(loaded, this.defaults);
    const refreshedAuth = refreshInvalidProductionAuthSecrets(normalized, this.defaults);
    if (refreshedAuth.refreshed) {
      normalized = refreshedAuth.config;
      shouldPersist = true;
      console.warn('[security] Replaced invalid persisted IoT auth secrets with current environment defaults.');
    }

    // 自动用随机密钥替换不安全的默认 Session Secret，防止签名被伪造漏洞
    if (normalized.auth.sessionSecret === 'change-me-in-production') {
      const crypto = require('crypto');
      normalized.auth.sessionSecret = crypto.randomBytes(32).toString('hex');
      console.warn('\x1b[33m%s\x1b[0m', '【安全警报】检测到默认的 sessionSecret，已自动生成强随机密钥进行替换以保证登录 Session 的安全性！');
      shouldPersist = true;
    }

    const errors = [
      ...validateConfig(normalized),
      ...validateProductionSecrets(normalized.auth)
    ];
    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }

    normalized = protectAuthPassword(normalized);
    this.config = normalized;

    if (JSON.stringify(loaded) !== JSON.stringify(normalized)) {
      shouldPersist = true;
    }

    if (shouldPersist) {
      await this.persist(normalized);
    }

    return this.getConfig();
  }

  async persist(config) {
    await this.storage.saveSettings(protectAuthPassword(config));
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

  async saveConfig(partialConfig) {
    const previous = this.getConfig();
    const input = applySecretDirectives(this.config, partialConfig);
    const merged = mergeObjects(this.config, input);
    let next = normalizeConfig(merged, this.defaults);
    const errors = [
      ...validateConfig(next),
      ...validateProductionSecrets(next.auth)
    ];

    if (errors.length > 0) {
      const error = new Error(errors.join(' '));
      error.statusCode = 400;
      throw error;
    }

    next = protectAuthPassword(next);
    await this.persist(next);
    this.config = next;
    this.emit('updated', { previous, current: this.getConfig() });

    return {
      previous,
      config: this.getConfig()
    };
  }

  async resetConfig() {
    const previous = this.getConfig();
    const next = this.getDefaults();

    await this.persist(next);
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
  sanitizeConfigForPublic,
  refreshInvalidProductionAuthSecrets,
  validateProductionSecrets
};
