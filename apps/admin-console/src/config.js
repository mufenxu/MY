import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const defaultRegistryPath = path.resolve(__dirname, '..', '..', '..', 'config', 'platform.services.local.json');
const localInternalKeyPair = crypto.generateKeyPairSync('ed25519');
const localInternalPrivateKey = localInternalKeyPair.privateKey
  .export({ format: 'der', type: 'pkcs8' }).toString('base64url');
const localInternalPublicKey = localInternalKeyPair.publicKey
  .export({ format: 'der', type: 'spki' }).toString('base64url');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function parseTrustProxy(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return 1;
  const hops = Number.parseInt(normalized, 10);
  return Number.isFinite(hops) && hops >= 0 ? hops : String(value).trim();
}

function validEd25519Key(value, type) {
  try {
    const key = type === 'private'
      ? crypto.createPrivateKey({ key: Buffer.from(String(value || ''), 'base64url'), format: 'der', type: 'pkcs8' })
      : crypto.createPublicKey({ key: Buffer.from(String(value || ''), 'base64url'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

function matchingEd25519KeyPair(privateValue, publicValue) {
  try {
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(String(privateValue || ''), 'base64url'), format: 'der', type: 'pkcs8',
    });
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(String(publicValue || ''), 'base64url'), format: 'der', type: 'spki',
    });
    const probe = Buffer.from('my-platform-internal-key-pair');
    return crypto.verify(null, probe, publicKey, crypto.sign(null, probe, privateKey));
  } catch {
    return false;
  }
}

function isTemplatePlaceholder(value) {
  return /^(?:replace|change)_with_/i.test(String(value || '').trim());
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const authDisabled = isProduction
    ? false
    : parseBoolean(env.PLATFORM_AUTH_DISABLED, true);
  const platformApiPort = parseInteger(env.PLATFORM_API_PORT, 22100, { min: 1, max: 65535 });

  const config = {
    nodeEnv,
    isProduction,
    host: env.PLATFORM_HOST || '127.0.0.1',
    port: parseInteger(env.PLATFORM_PORT, 8788, { min: 1, max: 65535 }),
    trustProxy: parseTrustProxy(env.PLATFORM_TRUST_PROXY, false),
    publicOrigin: parseOrigin(env.PLATFORM_PUBLIC_ORIGIN)
      || (isProduction ? '' : `http://127.0.0.1:${platformApiPort}`),
    registryPath: path.resolve(env.PLATFORM_CONFIG_PATH || defaultRegistryPath),
    workspaceRoot,
    authDisabled,
    adminUsername: env.PLATFORM_ADMIN_USERNAME || '',
    adminPasswordHash: env.PLATFORM_ADMIN_PASSWORD_HASH || '',
    sessionSecret: env.PLATFORM_SESSION_SECRET || '',
    internalAuthPrivateKey: env.PLATFORM_INTERNAL_AUTH_PRIVATE_KEY || (isProduction ? '' : localInternalPrivateKey),
    internalAuthPublicKey: env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY || (isProduction ? '' : localInternalPublicKey),
    mongoUri: env.PLATFORM_MONGODB_URI || '',
    metricsToken: env.PLATFORM_METRICS_TOKEN || '',
    sessionTtlHours: parseInteger(env.PLATFORM_SESSION_TTL_HOURS, 12, { min: 1, max: 168 }),
    serviceTimeoutMs: parseInteger(env.PLATFORM_SERVICE_TIMEOUT_MS, 8000, { min: 1000, max: 30000 }),
    backupRoot: path.resolve(env.PLATFORM_BACKUP_DIR || path.join(workspaceRoot, 'backups')),
    backupOperationsEnabled: parseBoolean(env.PLATFORM_BACKUP_ENABLED, true),
    restoreOperationsEnabled: parseBoolean(env.PLATFORM_RESTORE_ENABLED, true),
    preRestoreBackupEnabled: parseBoolean(env.PLATFORM_RESTORE_PRE_BACKUP, true),
    backupCommand: env.PLATFORM_BACKUP_COMMAND || '',
    restoreCommand: env.PLATFORM_RESTORE_COMMAND || '',
    restoreConfirmText: env.PLATFORM_RESTORE_CONFIRM_TEXT || 'RESTORE ALL DATA',
  };

  if (!config.authDisabled) {
    const missing = [];
    if (!config.adminUsername) missing.push('PLATFORM_ADMIN_USERNAME');
    if (!config.adminPasswordHash.startsWith('scrypt$') || isTemplatePlaceholder(config.adminPasswordHash.split('$')[1])) {
      missing.push('PLATFORM_ADMIN_PASSWORD_HASH');
    }
    if (config.sessionSecret.length < 32 || isTemplatePlaceholder(config.sessionSecret)) missing.push('PLATFORM_SESSION_SECRET');
    if (!validEd25519Key(config.internalAuthPrivateKey, 'private')) missing.push('PLATFORM_INTERNAL_AUTH_PRIVATE_KEY');
    if (!validEd25519Key(config.internalAuthPublicKey, 'public')) missing.push('PLATFORM_INTERNAL_AUTH_PUBLIC_KEY');
    if (
      validEd25519Key(config.internalAuthPrivateKey, 'private')
      && validEd25519Key(config.internalAuthPublicKey, 'public')
      && !matchingEd25519KeyPair(config.internalAuthPrivateKey, config.internalAuthPublicKey)
    ) missing.push('PLATFORM_INTERNAL_AUTH_KEY_PAIR_MISMATCH');
    if (!config.publicOrigin) missing.push('PLATFORM_PUBLIC_ORIGIN');
    if (!config.mongoUri) missing.push('PLATFORM_MONGODB_URI');
    if (config.metricsToken.length < 32 || isTemplatePlaceholder(config.metricsToken)) missing.push('PLATFORM_METRICS_TOKEN');
    if (config.isProduction && !config.publicOrigin.startsWith('https://')) missing.push('PLATFORM_PUBLIC_ORIGIN_HTTPS');

    if (missing.length > 0) {
      throw new Error(`管理门户鉴权配置不完整：${missing.join(', ')}`);
    }
  }

  return config;
}

export { isTemplatePlaceholder, parseBoolean, parseInteger, parseOrigin, parseTrustProxy };
