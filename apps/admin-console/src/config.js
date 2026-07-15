import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRegistryPath = path.resolve(__dirname, '..', '..', '..', 'config', 'platform.services.local.json');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const authDisabled = isProduction
    ? false
    : parseBoolean(env.PLATFORM_AUTH_DISABLED, true);

  const config = {
    nodeEnv,
    isProduction,
    host: env.PLATFORM_HOST || '127.0.0.1',
    port: parseInteger(env.PLATFORM_PORT, 8788, { min: 1, max: 65535 }),
    trustProxy: parseBoolean(env.PLATFORM_TRUST_PROXY, false),
    publicOrigin: String(env.PLATFORM_PUBLIC_ORIGIN || '').replace(/\/+$/, ''),
    registryPath: path.resolve(env.PLATFORM_CONFIG_PATH || defaultRegistryPath),
    authDisabled,
    adminUsername: env.PLATFORM_ADMIN_USERNAME || '',
    adminPasswordHash: env.PLATFORM_ADMIN_PASSWORD_HASH || '',
    sessionSecret: env.PLATFORM_SESSION_SECRET || '',
    sessionTtlHours: parseInteger(env.PLATFORM_SESSION_TTL_HOURS, 12, { min: 1, max: 168 }),
    serviceTimeoutMs: parseInteger(env.PLATFORM_SERVICE_TIMEOUT_MS, 8000, { min: 1000, max: 30000 }),
  };

  if (!config.authDisabled) {
    const missing = [];
    if (!config.adminUsername) missing.push('PLATFORM_ADMIN_USERNAME');
    if (!config.adminPasswordHash.startsWith('scrypt$')) missing.push('PLATFORM_ADMIN_PASSWORD_HASH');
    if (config.sessionSecret.length < 32) missing.push('PLATFORM_SESSION_SECRET');

    if (missing.length > 0) {
      throw new Error(`管理门户鉴权配置不完整：${missing.join(', ')}`);
    }
  }

  return config;
}

export { parseBoolean, parseInteger };
