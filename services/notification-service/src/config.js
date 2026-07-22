const path = require("path");
const dotenv = require("dotenv");
const { decodeEncryptionKey } = require('./history-crypto');

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

function ensureEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必要环境变量：${name}`);
  }
  return value;
}

function ensureStrongSecret(name, { minLength = 32 } = {}) {
  const value = ensureEnv(name);
  if (process.env.NODE_ENV === "production") {
    const placeholder = /^(?:replace|change)_with_/i.test(value);
    if (value.length < minLength || placeholder) {
      throw new Error(`环境变量 ${name} 必须是至少 ${minLength} 位的随机值`);
    }
  }
  return value;
}

const parseInteger = (value, name) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`环境变量 ${name} 必须是整数`);
  }
  return parsed;
};

function parseInternalCallers(value) {
  const callers = String(value || "platform-api,core-api")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(item));
  if (callers.length === 0) throw new Error("NOTIFY_INTERNAL_CALLERS must contain at least one caller");
  return [...new Set(callers)];
}

function parseManagementCallers(value) {
  const callers = String(value || 'admin-console')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(item));
  if (callers.length === 0) throw new Error('NOTIFY_MANAGEMENT_CALLERS must contain at least one caller');
  return [...new Set(callers)];
}

function parseBoundedInteger(value, name, fallback, minimum, maximum) {
  const parsed = value === undefined ? fallback : parseInteger(value, name);
  if (parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return parsed;
}

const historyEncryptionKey = ensureEnv('NOTIFY_HISTORY_ENCRYPTION_KEY');
decodeEncryptionKey(historyEncryptionKey);
const notificationMongoUri = String(process.env.NOTIFICATION_MONGODB_URI || '').trim();
if (process.env.NODE_ENV === 'production' && !notificationMongoUri) {
  throw new Error('缺少必要环境变量：NOTIFICATION_MONGODB_URI');
}

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  apiKey: ensureStrongSecret("NOTIFY_API_KEY"),
  internalCallers: parseInternalCallers(process.env.NOTIFY_INTERNAL_CALLERS),
  managementCallers: parseManagementCallers(process.env.NOTIFY_MANAGEMENT_CALLERS),
  mongoUri: notificationMongoUri,
  mongoDatabase: String(process.env.NOTIFICATION_MONGODB_DATABASE || 'notification_app').trim(),
  historyEncryptionKey,
  historyRetentionDays: parseBoundedInteger(process.env.NOTIFY_HISTORY_RETENTION_DAYS, 'NOTIFY_HISTORY_RETENTION_DAYS', 30, 1, 365),
  orchestrationIntervalMs: parseBoundedInteger(process.env.NOTIFY_ORCHESTRATION_INTERVAL_MS, 'NOTIFY_ORCHESTRATION_INTERVAL_MS', 15000, 1000, 300000),
  orchestrationBatchSize: parseBoundedInteger(process.env.NOTIFY_ORCHESTRATION_BATCH_SIZE, 'NOTIFY_ORCHESTRATION_BATCH_SIZE', 20, 1, 100),
  orchestrationConcurrency: parseBoundedInteger(process.env.NOTIFY_ORCHESTRATION_CONCURRENCY, 'NOTIFY_ORCHESTRATION_CONCURRENCY', 4, 3, 5),
  orchestrationLeaseMs: parseBoundedInteger(process.env.NOTIFY_ORCHESTRATION_LEASE_MS, 'NOTIFY_ORCHESTRATION_LEASE_MS', 120000, 30000, 900000),
  wecom: {
    corpId: ensureEnv("WECOM_CORP_ID"),
    agentId: parseInteger(ensureEnv("WECOM_AGENT_ID"), "WECOM_AGENT_ID"),
    secret: ensureEnv("WECOM_SECRET"),
  },
  tokenCacheMargin: parseInteger(
    process.env.TOKEN_CACHE_MARGIN || "120",
    "TOKEN_CACHE_MARGIN"
  ),
};

module.exports = config;

