import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { isPasswordHash } from './auth.js';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const defaultRegistryPath = path.resolve(__dirname, '..', '..', '..', 'config', 'platform.services.local.json');
const localInternalKeyPair = crypto.generateKeyPairSync('ed25519');
const localAuthEncryptionKey = crypto.randomBytes(32).toString('base64url');
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

function parseHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return '';
  }
}

function parseRole(value, fallback = 'super_admin') {
  const role = String(value || fallback).trim().toLowerCase();
  return ['viewer', 'operator', 'super_admin'].includes(role) ? role : fallback;
}

function parseRepository(value) {
  const repository = String(value || '').trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ? repository : '';
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

function validBase64UrlKey(value, bytes = 32) {
  try {
    return Buffer.from(String(value || ''), 'base64url').length === bytes && !isTemplatePlaceholder(value);
  } catch {
    return false;
  }
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
    adminRole: parseRole(env.PLATFORM_ADMIN_ROLE),
    adminTotpSecret: String(env.PLATFORM_ADMIN_TOTP_SECRET || '').replace(/[\s=-]/g, '').toUpperCase(),
    sessionSecret: env.PLATFORM_SESSION_SECRET || '',
    authEncryptionKey: env.PLATFORM_AUTH_ENCRYPTION_KEY || (isProduction ? '' : localAuthEncryptionKey),
    internalAuthPrivateKey: env.PLATFORM_INTERNAL_AUTH_PRIVATE_KEY || (isProduction ? '' : localInternalPrivateKey),
    internalAuthPublicKey: env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY || (isProduction ? '' : localInternalPublicKey),
    mongoUri: env.PLATFORM_MONGODB_URI || '',
    metricsToken: env.PLATFORM_METRICS_TOKEN || '',
    blackboxIngestToken: env.PLATFORM_BLACKBOX_INGEST_TOKEN || '',
    sessionTtlHours: parseInteger(env.PLATFORM_SESSION_TTL_HOURS, 12, { min: 1, max: 168 }),
    sessionIdleMinutes: parseInteger(env.PLATFORM_SESSION_IDLE_MINUTES, 30, { min: 5, max: 240 }),
    requireMfa: parseBoolean(env.PLATFORM_REQUIRE_MFA, isProduction),
    loginWindowMinutes: parseInteger(env.PLATFORM_LOGIN_WINDOW_MINUTES, 15, { min: 1, max: 60 }),
    loginMaxAttempts: parseInteger(env.PLATFORM_LOGIN_MAX_ATTEMPTS, 10, { min: 3, max: 100 }),
    loginChallengeThreshold: parseInteger(env.PLATFORM_LOGIN_CHALLENGE_THRESHOLD, 3, { min: 2, max: 20 }),
    loginBackoffBaseMs: parseInteger(env.PLATFORM_LOGIN_BACKOFF_BASE_MS, 1000, { min: 250, max: 10000 }),
    loginBackoffMaxMs: parseInteger(env.PLATFORM_LOGIN_BACKOFF_MAX_MS, 15 * 60 * 1000, { min: 10_000, max: 60 * 60 * 1000 }),
    turnstileSiteKey: String(env.PLATFORM_TURNSTILE_SITE_KEY || '').trim(),
    turnstileSecretKey: String(env.PLATFORM_TURNSTILE_SECRET_KEY || '').trim(),
    webauthnRpName: String(env.PLATFORM_WEBAUTHN_RP_NAME || 'MY Platform').trim().slice(0, 64),
    webauthnRpId: String(env.PLATFORM_WEBAUTHN_RP_ID || '').trim().toLowerCase(),
    serviceTimeoutMs: parseInteger(env.PLATFORM_SERVICE_TIMEOUT_MS, 8000, { min: 1000, max: 30000 }),
    monitorIntervalMs: parseInteger(env.PLATFORM_MONITOR_INTERVAL_MS, 30000, { min: 10000, max: 300000 }),
    statusRetentionDays: parseInteger(env.PLATFORM_STATUS_RETENTION_DAYS, 30, { min: 1, max: 365 }),
    auditRetentionDays: parseInteger(env.PLATFORM_AUDIT_RETENTION_DAYS, 180, { min: 30, max: 730 }),
    configurationTwoPersonApproval: parseBoolean(env.PLATFORM_CONFIG_TWO_PERSON_APPROVAL, isProduction),
    incidentFailureThreshold: parseInteger(env.PLATFORM_INCIDENT_FAILURE_THRESHOLD, 2, { min: 1, max: 10 }),
    incidentRecoveryThreshold: parseInteger(env.PLATFORM_INCIDENT_RECOVERY_THRESHOLD, 2, { min: 1, max: 10 }),
    serviceLatencyThresholdMs: parseInteger(env.PLATFORM_SERVICE_LATENCY_THRESHOLD_MS, 2000, { min: 100, max: 30000 }),
    proxyP95ThresholdMs: parseInteger(env.PLATFORM_PROXY_P95_THRESHOLD_MS, 2000, { min: 100, max: 120000 }),
    proxyErrorRatePercent: parseInteger(env.PLATFORM_PROXY_ERROR_RATE_PERCENT, 1, { min: 1, max: 100 }),
    proxyAlertMinimumRequests: parseInteger(env.PLATFORM_PROXY_ALERT_MINIMUM_REQUESTS, 20, { min: 5, max: 10000 }),
    diskUsageThresholdPercent: parseInteger(env.PLATFORM_DISK_USAGE_THRESHOLD_PERCENT, 80, { min: 50, max: 99 }),
    notificationServiceUrl: parseHttpUrl(env.NOTIFICATION_SERVICE_URL),
    notificationApiKey: env.PLATFORM_NOTIFICATION_API_KEY || env.NOTIFY_API_KEY || '',
    incidentNotificationsEnabled: parseBoolean(env.PLATFORM_INCIDENT_NOTIFICATIONS_ENABLED, true),
    backupRoot: path.resolve(env.PLATFORM_BACKUP_DIR || path.join(workspaceRoot, 'backups')),
    backupOperationsEnabled: parseBoolean(env.PLATFORM_BACKUP_ENABLED, true),
    restoreOperationsEnabled: parseBoolean(env.PLATFORM_RESTORE_ENABLED, true),
    preRestoreBackupEnabled: parseBoolean(env.PLATFORM_RESTORE_PRE_BACKUP, true),
    backupCommand: env.PLATFORM_BACKUP_COMMAND || '',
    restoreCommand: env.PLATFORM_RESTORE_COMMAND || '',
    restoreConfirmText: env.PLATFORM_RESTORE_CONFIRM_TEXT || 'RESTORE ALL DATA',
    backupCommandTimeoutMs: parseInteger(env.PLATFORM_BACKUP_COMMAND_TIMEOUT_MS, 30 * 60 * 1000, { min: 60 * 1000, max: 6 * 60 * 60 * 1000 }),
    backupTransferTimeoutMs: parseInteger(env.PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS, 10 * 60 * 1000, { min: 60 * 1000, max: 10 * 60 * 1000 }),
    backupUploadMaxBytes: parseInteger(env.PLATFORM_BACKUP_UPLOAD_MAX_BYTES, 5 * 1024 * 1024 * 1024, { min: 1024 * 1024, max: 5 * 1024 * 1024 * 1024 }),
    backupRunnerUrl: parseHttpUrl(env.PLATFORM_BACKUP_RUNNER_URL),
    backupRunnerToken: env.PLATFORM_BACKUP_RUNNER_TOKEN || '',
    backupRunnerTimeoutMs: parseInteger(env.PLATFORM_BACKUP_RUNNER_TIMEOUT_MS, 8000, { min: 1000, max: 60000 }),
    backupRpoHours: parseInteger(env.PLATFORM_BACKUP_RPO_HOURS, 26, { min: 1, max: 720 }),
    restoreDrillMaxAgeDays: parseInteger(env.PLATFORM_RESTORE_DRILL_MAX_AGE_DAYS, 90, { min: 1, max: 365 }),
    restoreRtoMinutes: parseInteger(env.PLATFORM_RESTORE_RTO_MINUTES, 30, { min: 1, max: 24 * 60 }),
    backupScheduleEnabled: parseBoolean(env.PLATFORM_BACKUP_SCHEDULE_ENABLED, false),
    backupScheduleTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(env.PLATFORM_BACKUP_SCHEDULE_TIME || '02:30'))
      ? String(env.PLATFORM_BACKUP_SCHEDULE_TIME || '02:30')
      : '02:30',
    offsiteBackupStatusUrl: parseHttpUrl(env.PLATFORM_OFFSITE_BACKUP_STATUS_URL),
    offsiteBackupStatusToken: env.PLATFORM_OFFSITE_BACKUP_STATUS_TOKEN || '',
    githubRepository: parseRepository(env.PLATFORM_GITHUB_REPOSITORY || 'mufenxu/MY'),
    githubToken: env.PLATFORM_GITHUB_TOKEN || '',
    githubWorkflow: String(env.PLATFORM_GITHUB_WORKFLOW || 'aliyun-acr.yml').trim(),
    githubRef: String(env.PLATFORM_GITHUB_REF || 'main').trim(),
    releaseActionsEnabled: parseBoolean(env.PLATFORM_RELEASE_ACTIONS_ENABLED, false),
    releaseEnvironment: String(env.PLATFORM_RELEASE_ENVIRONMENT || 'production').trim().slice(0, 32),
    releaseCallbackToken: env.PLATFORM_RELEASE_CALLBACK_TOKEN || '',
    releaseAllowedImageRepository: String(env.PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY || '').trim().replace(/[:/@]+$/, ''),
    deployHookUrl: parseHttpUrl(env.PLATFORM_DEPLOY_HOOK_URL),
    deployHookToken: env.PLATFORM_DEPLOY_HOOK_TOKEN || '',
    releaseRevision: String(env.PLATFORM_RELEASE_REVISION || env.GITHUB_SHA || '').trim().slice(0, 64),
    releaseDeployedAt: String(env.PLATFORM_RELEASE_DEPLOYED_AT || '').trim(),
    releaseImages: {
      platform: env.PLATFORM_API_IMAGE || '',
      backup: env.BACKUP_RUNNER_IMAGE || '',
      core: env.CORE_API_IMAGE || '',
      exam: env.EXAM_API_IMAGE || '',
      notification: env.NOTIFICATION_SERVICE_IMAGE || '',
      campus: env.CAMPUS_SERVICE_IMAGE || '',
      iot: env.IOT_SERVICE_IMAGE || '',
      mongodb: env.MONGODB_IMAGE || '',
    },
  };

  if (!config.authDisabled) {
    const missing = [];
    if (!config.adminUsername) missing.push('PLATFORM_ADMIN_USERNAME');
    if (!isPasswordHash(config.adminPasswordHash) || isTemplatePlaceholder(config.adminPasswordHash.split('$').at(-2))) {
      missing.push('PLATFORM_ADMIN_PASSWORD_HASH');
    }
    if (config.sessionSecret.length < 32 || isTemplatePlaceholder(config.sessionSecret)) missing.push('PLATFORM_SESSION_SECRET');
    if (!validBase64UrlKey(config.authEncryptionKey)) missing.push('PLATFORM_AUTH_ENCRYPTION_KEY');
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
    if (config.blackboxIngestToken && (config.blackboxIngestToken.length < 32 || isTemplatePlaceholder(config.blackboxIngestToken))) {
      missing.push('PLATFORM_BLACKBOX_INGEST_TOKEN');
    }
    if (config.backupRunnerUrl && (config.backupRunnerToken.length < 32 || isTemplatePlaceholder(config.backupRunnerToken))) {
      missing.push('PLATFORM_BACKUP_RUNNER_TOKEN');
    }
    if (config.notificationServiceUrl && (config.notificationApiKey.length < 32 || isTemplatePlaceholder(config.notificationApiKey))) {
      missing.push('PLATFORM_NOTIFICATION_API_KEY');
    }
    if (config.adminTotpSecret && !/^[A-Z2-7]{16,128}$/.test(config.adminTotpSecret)) {
      missing.push('PLATFORM_ADMIN_TOTP_SECRET');
    }
    if (Boolean(config.turnstileSiteKey) !== Boolean(config.turnstileSecretKey)) {
      missing.push('PLATFORM_TURNSTILE_SITE_KEY_AND_SECRET_KEY');
    }
    if (config.releaseActionsEnabled && (!config.githubToken || !config.githubRepository)) {
      missing.push('PLATFORM_GITHUB_TOKEN');
    }
    if (config.releaseActionsEnabled && (config.releaseCallbackToken.length < 32 || isTemplatePlaceholder(config.releaseCallbackToken))) {
      missing.push('PLATFORM_RELEASE_CALLBACK_TOKEN');
    }
    if (config.releaseActionsEnabled && !/^[a-z0-9][a-z0-9._/-]+$/i.test(config.releaseAllowedImageRepository)) {
      missing.push('PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY');
    }
    if (config.deployHookUrl && (config.deployHookToken.length < 32 || isTemplatePlaceholder(config.deployHookToken))) {
      missing.push('PLATFORM_DEPLOY_HOOK_TOKEN');
    }
    if (config.isProduction && !config.publicOrigin.startsWith('https://')) missing.push('PLATFORM_PUBLIC_ORIGIN_HTTPS');
    const publicHostname = config.publicOrigin ? new URL(config.publicOrigin).hostname : '';
    if (!config.webauthnRpId) config.webauthnRpId = publicHostname;
    if (config.webauthnRpId && publicHostname !== config.webauthnRpId && !publicHostname.endsWith(`.${config.webauthnRpId}`)) {
      missing.push('PLATFORM_WEBAUTHN_RP_ID');
    }

    if (missing.length > 0) {
      throw new Error(`管理门户鉴权配置不完整：${missing.join(', ')}`);
    }
  }

  return config;
}

export { isTemplatePlaceholder, parseBoolean, parseHttpUrl, parseInteger, parseOrigin, parseRepository, parseRole, parseTrustProxy };
