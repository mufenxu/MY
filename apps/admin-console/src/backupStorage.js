import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const PROVIDERS = new Set(['r2', 'aws-s3', 'minio', 'b2']);
const DEFAULT_PREFIX = 'my-platform/backups';
const BACKUP_OBJECT_PATTERN = /^[A-Za-z0-9_.-]+\.tar\.gz$/;

export class BackupStorageError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BackupStorageError';
    this.status = status;
    this.code = code;
  }
}

function decodeEncryptionKey(value) {
  const key = Buffer.from(String(value || ''), 'base64url');
  if (key.length !== 32) {
    throw new BackupStorageError(503, 'BACKUP_STORAGE_KEY_INVALID', '备份存储加密密钥未配置或长度无效。');
  }
  return key;
}

function clampDays(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(3650, Math.max(1, parsed)) : fallback;
}

function normalizePrefix(value) {
  return String(value || DEFAULT_PREFIX).trim().replace(/^\/+|\/+$/g, '') || DEFAULT_PREFIX;
}

function normalizeEndpoint(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BackupStorageError(400, 'BACKUP_STORAGE_ENDPOINT_INVALID', '对象存储 endpoint 无效。');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new BackupStorageError(400, 'BACKUP_STORAGE_ENDPOINT_INVALID', '对象存储 endpoint 无效。');
  }
  return parsed.toString().replace(/\/$/, '');
}

function isConfigComplete(config) {
  return Boolean(
    config
    && (config.provider === 'aws-s3' || config.endpoint)
    && config.bucket
    && config.accessKeyId
    && config.secretAccessKey
  );
}

function normalizeConfig(input, current = null) {
  const provider = PROVIDERS.has(String(input.provider || current?.provider || ''))
    ? String(input.provider || current?.provider)
    : 'r2';
  const providerConfig = current?.provider === provider ? current : null;
  const accountId = String(input.accountId ?? providerConfig?.accountId ?? '').trim();
  const endpoint = provider === 'r2'
    ? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
    : normalizeEndpoint(input.endpoint ?? providerConfig?.endpoint ?? '');
  const region = String(input.region ?? providerConfig?.region ?? (provider === 'r2' ? 'auto' : 'us-east-1')).trim()
    || (provider === 'r2' ? 'auto' : 'us-east-1');
  const accessKeyId = String(input.accessKeyId || providerConfig?.accessKeyId || '').trim();
  const secretAccessKey = String(input.secretAccessKey || providerConfig?.secretAccessKey || '').trim();
  const enabled = input.enabled === undefined ? Boolean(current?.enabled) : Boolean(input.enabled);
  const bucket = String(input.bucket ?? providerConfig?.bucket ?? '').trim();

  if (enabled && provider === 'r2' && !accountId) {
    throw new BackupStorageError(400, 'BACKUP_STORAGE_ACCOUNT_REQUIRED', 'Cloudflare Account ID 不能为空。');
  }
  if (enabled && !isConfigComplete({ provider, endpoint, bucket, accessKeyId, secretAccessKey })) {
    throw new BackupStorageError(400, 'BACKUP_STORAGE_CONFIG_INCOMPLETE', '对象存储连接信息不完整。');
  }

  return {
    enabled,
    provider,
    accountId,
    endpoint,
    region,
    bucket,
    prefix: normalizePrefix(input.prefix ?? current?.prefix),
    forcePathStyle: input.forcePathStyle === undefined
      ? (providerConfig?.forcePathStyle ?? provider === 'minio')
      : Boolean(input.forcePathStyle),
    accessKeyId,
    secretAccessKey,
    localRetentionDays: clampDays(input.localRetentionDays, current?.localRetentionDays || 30),
    remoteRetentionDays: clampDays(input.remoteRetentionDays, current?.remoteRetentionDays || 90),
  };
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 4) return '*'.repeat(text.length);
  return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
}

function publicConfig(config, status = {}) {
  if (!config) {
    return {
      configured: false,
      enabled: false,
      provider: 'r2',
      prefix: DEFAULT_PREFIX,
      localRetentionDays: 30,
      remoteRetentionDays: 90,
      healthy: null,
      encryptionReady: true,
    };
  }
  return {
    configured: isConfigComplete(config),
    enabled: Boolean(config.enabled),
    provider: config.provider,
    accountId: config.accountId,
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    prefix: config.prefix,
    forcePathStyle: Boolean(config.forcePathStyle),
    accessKeyIdMasked: maskSecret(config.accessKeyId),
    secretConfigured: Boolean(config.secretAccessKey),
    localRetentionDays: config.localRetentionDays,
    remoteRetentionDays: config.remoteRetentionDays,
    healthy: status.healthy ?? null,
    lastCheckedAt: status.lastCheckedAt || null,
    lastBackupAt: status.lastBackupAt || null,
    lastError: status.lastError || '',
    encryptionReady: true,
  };
}

function encryptState(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function decryptState(envelope, key) {
  if (Number(envelope?.version) !== 1) throw new Error('Unsupported backup storage state version.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function createBackupStorageService({
  statePath,
  encryptionKey,
  now = () => new Date(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  clientFactory = (config) => new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region,
    forcePathStyle: Boolean(config.forcePathStyle),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }),
  uploadFactory = ({ client, params }) => new Upload({
    client,
    params,
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  }),
} = {}) {
  const key = decodeEncryptionKey(encryptionKey);
  const resolvedStatePath = path.resolve(statePath || path.join(process.cwd(), 'data', 'backup-storage.json'));

  async function readState() {
    try {
      return decryptState(JSON.parse(await readFile(resolvedStatePath, 'utf8')), key);
    } catch (error) {
      if (error.code === 'ENOENT') return { config: null, status: {} };
      throw new BackupStorageError(500, 'BACKUP_STORAGE_STATE_INVALID', '备份存储配置无法读取。');
    }
  }

  async function writeState(state) {
    await mkdir(path.dirname(resolvedStatePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${resolvedStatePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(encryptState(state, key))}\n`, { mode: 0o600 });
    await rename(temporaryPath, resolvedStatePath);
  }

  function requireEnabledConfig(config) {
    if (!config?.enabled) {
      throw new BackupStorageError(409, 'BACKUP_STORAGE_DISABLED', '异地备份尚未启用。');
    }
    return config;
  }

  function objectKey(config, backupName) {
    const name = String(backupName || '');
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw new BackupStorageError(400, 'BACKUP_NAME_INVALID', '备份名称无效。');
    }
    return `${config.prefix}/${name}.tar.gz`;
  }

  function managedObjectName(config, keyValue) {
    const keyValueText = String(keyValue || '');
    const prefix = `${config.prefix}/`;
    if (!keyValueText.startsWith(prefix)) return '';
    const name = keyValueText.slice(prefix.length);
    return BACKUP_OBJECT_PATTERN.test(name) && !name.includes('/') ? name : '';
  }

  async function listObjects(config, client) {
    const objects = [];
    let continuationToken;
    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: `${config.prefix}/`,
        ContinuationToken: continuationToken,
      }));
      for (const object of response.Contents || []) {
        if (managedObjectName(config, object.Key)) objects.push(object);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }

  async function cleanupExpired(config, client) {
    const cutoff = now().getTime() - config.remoteRetentionDays * 86400000;
    const objects = await listObjects(config, client);
    const expired = objects.filter((object) => {
      const modifiedAt = new Date(object.LastModified || 0).getTime();
      return Number.isFinite(modifiedAt) && modifiedAt > 0 && modifiedAt < cutoff;
    });
    for (const object of expired) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: object.Key }));
    }
    return expired.length;
  }

  async function updateStatus(patch) {
    const state = await readState();
    state.status = { ...(state.status || {}), ...patch };
    await writeState(state);
    return state.status;
  }

  return {
    async configure(input) {
      const state = await readState();
      state.config = normalizeConfig(input || {}, state.config);
      await writeState(state);
      return publicConfig(state.config, state.status);
    },
    async getPublicConfig() {
      const state = await readState();
      return publicConfig(state.config, state.status);
    },
    async getRuntimeConfig() {
      return (await readState()).config;
    },
    async getRetentionPolicy() {
      const config = (await readState()).config;
      return {
        localRetentionDays: config?.localRetentionDays || 30,
        remoteRetentionDays: config?.remoteRetentionDays || 90,
      };
    },
    async testConnection() {
      const state = await readState();
      const config = requireEnabledConfig(state.config);
      const client = clientFactory(config);
      const probeKey = `${config.prefix}/.healthcheck-${crypto.randomUUID()}`;
      let probeCreated = false;
      try {
        await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: `${config.prefix}/`, MaxKeys: 1 }));
        await client.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: probeKey,
          Body: Buffer.from('backup-storage-healthcheck'),
          ContentType: 'application/octet-stream',
        }));
        probeCreated = true;
        const downloaded = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: probeKey }));
        if (!downloaded.Body) throw new Error('Healthcheck object could not be read.');
        if (typeof downloaded.Body.transformToByteArray === 'function') {
          await downloaded.Body.transformToByteArray();
        } else if (typeof downloaded.Body[Symbol.asyncIterator] === 'function') {
          for await (const chunk of downloaded.Body) void chunk;
        } else {
          throw new Error('Healthcheck object body could not be consumed.');
        }
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: probeKey }));
        probeCreated = false;
        const checkedAt = now().toISOString();
        await updateStatus({ healthy: true, lastCheckedAt: checkedAt, lastError: '' });
        return this.getPublicConfig();
      } catch (error) {
        if (probeCreated) {
          await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: probeKey })).catch(() => {});
        }
        await updateStatus({
          healthy: false,
          lastCheckedAt: now().toISOString(),
          lastError: String(error.message || error).slice(0, 200),
        });
        throw new BackupStorageError(502, 'BACKUP_STORAGE_CONNECTION_FAILED', '对象存储连接测试失败。');
      }
    },
    async uploadBackup({ backupName, bodyFactory }) {
      const state = await readState();
      const config = requireEnabledConfig(state.config);
      if (typeof bodyFactory !== 'function') {
        throw new BackupStorageError(400, 'BACKUP_BODY_REQUIRED', '备份上传流不可用。');
      }
      const client = clientFactory(config);
      const keyValue = objectKey(config, backupName);
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const upload = uploadFactory({
            client,
            params: {
              Bucket: config.bucket,
              Key: keyValue,
              Body: bodyFactory(),
              ContentType: 'application/gzip',
              Metadata: { backup: String(backupName) },
            },
          });
          const result = await upload.done();
          const completedAt = now().toISOString();
          const deletedObjects = await cleanupExpired(config, client);
          await updateStatus({
            healthy: true,
            lastCheckedAt: completedAt,
            lastBackupAt: completedAt,
            lastError: '',
          });
          return { key: keyValue, eTag: result.ETag || '', deletedObjects, uploadedAt: completedAt };
        } catch (error) {
          lastError = error;
          if (attempt < 3) await sleep(250 * (2 ** (attempt - 1)));
        }
      }
      const failedAt = now().toISOString();
      await updateStatus({
        healthy: false,
        lastCheckedAt: failedAt,
        lastError: String(lastError?.message || lastError || 'upload failed').slice(0, 200),
      });
      throw new BackupStorageError(502, 'BACKUP_STORAGE_UPLOAD_FAILED', '异地备份上传失败。');
    },
    async listBackups() {
      const config = requireEnabledConfig((await readState()).config);
      const objects = await listObjects(config, clientFactory(config));
      return objects
        .map((object) => {
          const filename = managedObjectName(config, object.Key);
          return {
            key: object.Key,
            name: filename.replace(/\.tar\.gz$/i, ''),
            createdAt: object.LastModified ? new Date(object.LastModified).toISOString() : null,
            sizeBytes: Number(object.Size) || 0,
            eTag: String(object.ETag || ''),
          };
        })
        .sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''));
    },
    async downloadBackup({ key: objectKeyValue }) {
      const config = requireEnabledConfig((await readState()).config);
      const filename = managedObjectName(config, objectKeyValue);
      if (!filename) {
        throw new BackupStorageError(400, 'BACKUP_STORAGE_OBJECT_INVALID', '远端备份对象无效。');
      }
      const response = await clientFactory(config).send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKeyValue,
      }));
      if (!response.Body) {
        throw new BackupStorageError(502, 'BACKUP_STORAGE_DOWNLOAD_FAILED', '远端备份内容为空。');
      }
      return {
        filename,
        contentType: response.ContentType || 'application/gzip',
        contentLength: Number(response.ContentLength) || null,
        eTag: String(response.ETag || ''),
        stream: response.Body,
      };
    },
  };
}
