import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { BackupStorageError, createBackupStorageService } from '../src/backupStorage.js';

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function configuredStorage(t, overrides = {}) {
  const stateRoot = await mkdtemp(join(tmpdir(), 'my-backup-storage-'));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const storage = createBackupStorageService({
    statePath: join(stateRoot, 'offsite.json'),
    encryptionKey: crypto.randomBytes(32).toString('base64url'),
    ...overrides,
  });
  await storage.configure({
    enabled: true,
    provider: 'r2',
    accountId: '0123456789abcdef',
    bucket: 'my-platform-backups',
    prefix: 'production',
    accessKeyId: 'r2-access-key-id',
    secretAccessKey: 'r2-secret-access-key',
    localRetentionDays: 14,
    remoteRetentionDays: 90,
  });
  return storage;
}

test('backup storage encrypts credentials and exposes only masked configuration', async (t) => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'my-backup-storage-'));
  const statePath = join(stateRoot, 'offsite.json');
  t.after(() => rm(stateRoot, { recursive: true, force: true }));

  const storage = createBackupStorageService({
    statePath,
    encryptionKey: crypto.randomBytes(32).toString('base64url'),
  });
  const configured = await storage.configure({
    enabled: true,
    provider: 'r2',
    accountId: '0123456789abcdef',
    bucket: 'my-platform-backups',
    prefix: 'production',
    accessKeyId: 'r2-access-key-id',
    secretAccessKey: 'r2-secret-access-key',
    localRetentionDays: 14,
    remoteRetentionDays: 90,
  });

  assert.equal(configured.endpoint, 'https://0123456789abcdef.r2.cloudflarestorage.com');
  assert.equal(configured.region, 'auto');
  assert.equal(configured.accessKeyIdMasked, '************y-id');
  assert.equal(configured.secretConfigured, true);
  assert.equal(configured.encryptionReady, true);
  assert.equal('accessKeyId' in configured, false);
  assert.equal('secretAccessKey' in configured, false);

  const persisted = await readFile(statePath, 'utf8');
  assert.doesNotMatch(persisted, /r2-access-key-id|r2-secret-access-key/);

  const runtime = await storage.getRuntimeConfig();
  assert.equal(runtime.accessKeyId, 'r2-access-key-id');
  assert.equal(runtime.secretAccessKey, 'r2-secret-access-key');
});

test('AWS S3 uses the SDK default endpoint when no custom endpoint is configured', async (t) => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'my-backup-storage-'));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));

  const storage = createBackupStorageService({
    statePath: join(stateRoot, 'offsite.json'),
    encryptionKey: crypto.randomBytes(32).toString('base64url'),
  });
  const configured = await storage.configure({
    enabled: true,
    provider: 'aws-s3',
    region: 'ap-east-1',
    bucket: 'my-platform-backups',
    accessKeyId: 'aws-access-key-id',
    secretAccessKey: 'aws-secret-access-key',
  });

  assert.equal(configured.configured, true);
  assert.equal(configured.endpoint, '');
  assert.equal(configured.region, 'ap-east-1');
});

test('switching providers does not inherit another provider endpoint', async (t) => {
  const storage = await configuredStorage(t);

  const configured = await storage.configure({
    enabled: true,
    provider: 'aws-s3',
    region: 'ap-southeast-1',
    bucket: 'aws-backups',
    accessKeyId: 'new-aws-access-key',
    secretAccessKey: 'new-aws-secret-key',
  });

  assert.equal(configured.endpoint, '');
  const runtime = await storage.getRuntimeConfig();
  assert.equal(runtime.accessKeyId, 'new-aws-access-key');
  assert.equal(runtime.secretAccessKey, 'new-aws-secret-key');
});

test('backup storage retries streaming uploads and removes only expired managed objects', async (t) => {
  const commands = [];
  const bodies = [];
  let uploadAttempts = 0;
  const now = new Date('2026-08-07T03:00:00.000Z');
  const storage = await configuredStorage(t, {
    now: () => now,
    sleep: async () => {},
    clientFactory: () => ({
      async send(command) {
        commands.push(command);
        if (command.constructor.name === 'ListObjectsV2Command') {
          return {
            Contents: [
              { Key: 'production/2026-04-01T00-00-00-000Z.tar.gz', LastModified: new Date('2026-04-01T00:00:00.000Z') },
              { Key: 'other/do-not-delete.tar.gz', LastModified: new Date('2026-01-01T00:00:00.000Z') },
            ],
            IsTruncated: false,
          };
        }
        return {};
      },
    }),
    uploadFactory: ({ params }) => ({
      async done() {
        uploadAttempts += 1;
        bodies.push(await collectStream(params.Body));
        if (uploadAttempts < 3) throw new Error('temporary upload failure');
        return { ETag: 'etag-1' };
      },
    }),
  });

  const result = await storage.uploadBackup({
    backupName: '2026-08-07T03-00-00-000Z',
    bodyFactory: () => Readable.from('archive-body'),
  });

  assert.equal(uploadAttempts, 3);
  assert.deepEqual(bodies, ['archive-body', 'archive-body', 'archive-body']);
  assert.equal(result.key, 'production/2026-08-07T03-00-00-000Z.tar.gz');
  assert.equal(commands.filter((command) => command.constructor.name === 'DeleteObjectCommand').length, 1);
  assert.equal(commands.find((command) => command.constructor.name === 'DeleteObjectCommand').input.Key, 'production/2026-04-01T00-00-00-000Z.tar.gz');

  const status = await storage.getPublicConfig();
  assert.equal(status.healthy, true);
  assert.equal(status.lastBackupAt, now.toISOString());
  assert.equal(status.lastError, '');
});

test('backup storage lists and downloads only managed backup objects', async (t) => {
  const commands = [];
  const storage = await configuredStorage(t, {
    clientFactory: () => ({
      async send(command) {
        commands.push(command);
        if (command.constructor.name === 'ListObjectsV2Command') {
          return {
            Contents: [
              {
                Key: 'production/2026-08-07T03-00-00-000Z.tar.gz',
                LastModified: new Date('2026-08-07T03:00:00.000Z'),
                Size: 4096,
                ETag: 'etag-remote',
              },
              { Key: 'production/nested/not-a-backup.tar.gz', LastModified: new Date() },
              { Key: 'another-prefix/backup.tar.gz', LastModified: new Date() },
            ],
            IsTruncated: false,
          };
        }
        if (command.constructor.name === 'GetObjectCommand') {
          return { Body: Readable.from('remote-archive'), ContentLength: 14, ETag: 'etag-remote' };
        }
        return {};
      },
    }),
  });

  const backups = await storage.listBackups();
  assert.deepEqual(backups, [{
    key: 'production/2026-08-07T03-00-00-000Z.tar.gz',
    name: '2026-08-07T03-00-00-000Z',
    createdAt: '2026-08-07T03:00:00.000Z',
    sizeBytes: 4096,
    eTag: 'etag-remote',
  }]);

  const download = await storage.downloadBackup({ key: backups[0].key });
  assert.equal(await collectStream(download.stream), 'remote-archive');
  assert.equal(download.filename, '2026-08-07T03-00-00-000Z.tar.gz');

  await assert.rejects(
    storage.downloadBackup({ key: 'another-prefix/backup.tar.gz' }),
    (error) => error instanceof BackupStorageError && error.code === 'BACKUP_STORAGE_OBJECT_INVALID',
  );
  assert.equal(commands.filter((command) => command.constructor.name === 'GetObjectCommand').length, 1);
});

test('backup storage connection checks permissions without replacing saved credentials', async (t) => {
  const commands = [];
  let healthcheckRead = false;
  const storage = await configuredStorage(t, {
    now: () => new Date('2026-08-07T06:00:00.000Z'),
    clientFactory: () => ({
      async send(command) {
        commands.push(command);
        if (command.constructor.name === 'ListObjectsV2Command') return { Contents: [], IsTruncated: false };
        if (command.constructor.name === 'GetObjectCommand') {
          return {
            Body: Readable.from((async function* healthcheckBody() {
              yield 'ok';
              healthcheckRead = true;
            })()),
          };
        }
        return {};
      },
    }),
  });
  await storage.configure({ bucket: 'renamed-backup-bucket' });

  const checked = await storage.testConnection();
  assert.equal(checked.healthy, true);
  assert.equal(checked.bucket, 'renamed-backup-bucket');
  assert.equal(healthcheckRead, true);
  assert.deepEqual(
    commands.map((command) => command.constructor.name),
    ['ListObjectsV2Command', 'PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand'],
  );

  const runtime = await storage.getRuntimeConfig();
  assert.equal(runtime.accessKeyId, 'r2-access-key-id');
  assert.equal(runtime.secretAccessKey, 'r2-secret-access-key');
});
