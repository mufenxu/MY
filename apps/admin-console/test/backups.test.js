import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import http from 'node:http';
import { PassThrough, Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupOperationError, createBackupManager, createBackupRunnerClient } from '../src/backups.js';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function createBackupFixture(root, name = '2026-07-17T12-00-00-000Z') {
  const directory = join(root, name);
  const archive = Buffer.from('mongodb archive');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'mongodb.archive.gz'), archive);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({
    formatVersion: 2,
    createdAt: '2026-07-17T12:00:00.000Z',
    mongoArchive: 'mongodb.archive.gz',
    mongoSha256: sha256(archive),
    oplog: true,
    includes: ['platform_app', 'core_app', 'exam_app', 'campus_app', 'iot_app', 'core_uploads'],
  }));
  return directory;
}

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function fakeSpawnFactory({ stdout = '', stderr = '', exitCode = 0 } = {}) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', exitCode);
    });
    return child;
  };
  return { calls, spawnImpl };
}

function hangingSpawnFactory() {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options, signals: [] });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal) => {
      calls.at(-1).signals.push(signal);
      queueMicrotask(() => child.emit('close', null));
      return true;
    };
    return child;
  };
  return { calls, spawnImpl };
}

async function withHttpServer(handler, callback) {
  const server = http.createServer(handler);
  server.keepAliveTimeout = 50;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}/`);
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('backup status lists restorable manifest directories', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await createBackupFixture(backupRoot);

  const manager = createBackupManager({
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const status = await manager.getStatus();
  assert.equal(status.backups.length, 1);
  assert.equal(status.backups[0].restorable, true);
  assert.deepEqual(status.backups[0].includes.slice(0, 2), ['platform_app', 'core_app']);
});

test('backup status hides in-progress work directories', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await createBackupFixture(backupRoot, '2026-07-17T12-00-00-000Z');
  await mkdir(join(backupRoot, '2026-07-17T12-05-00-000Z.in-progress'), { recursive: true });

  const manager = createBackupManager({
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const status = await manager.getStatus();
  assert.deepEqual(status.backups.map((backup) => backup.name), ['2026-07-17T12-00-00-000Z']);
});

test('backup archives can be downloaded, deleted, and uploaded again', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const backupName = '2026-07-18T12-06-48-304Z';
  await createBackupFixture(backupRoot, backupName);

  const manager = createBackupManager({
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const download = await manager.downloadBackup({ backupName });
  assert.equal(download.filename, `${backupName}.tar.gz`);
  assert.equal(download.contentType, 'application/gzip');
  const archive = await collectStream(download.stream);
  assert.ok(archive.length > 0);

  await manager.deleteBackup({ backupName });
  const afterDelete = await manager.getStatus();
  assert.deepEqual(afterDelete.backups.map((backup) => backup.name), []);

  const upload = await manager.uploadBackup({
    filename: `${backupName}.tar.gz`,
    stream: Readable.from(archive),
  });
  assert.equal(upload.backup.name, backupName);
  assert.equal(upload.backup.restorable, true);

  const afterUpload = await manager.getStatus();
  assert.deepEqual(afterUpload.backups.map((backup) => backup.name), [backupName]);
});

test('remote backups are imported through the existing archive validation path', async (t) => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-target-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  const backupName = '2026-08-07T05-00-00-000Z';
  t.after(() => rm(sourceRoot, { recursive: true, force: true }));
  t.after(() => rm(targetRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await createBackupFixture(sourceRoot, backupName);

  const source = createBackupManager({
    config: { backupRoot: sourceRoot, workspaceRoot, backupOperationsEnabled: true, restoreOperationsEnabled: false },
  });
  const archive = await collectStream((await source.downloadBackup({ backupName })).stream);
  const target = createBackupManager({
    offsiteStorage: {
      downloadBackup: async ({ key }) => {
        assert.equal(key, `production/${backupName}.tar.gz`);
        return { filename: `${backupName}.tar.gz`, stream: Readable.from(archive) };
      },
    },
    config: { backupRoot: targetRoot, workspaceRoot, backupOperationsEnabled: true, restoreOperationsEnabled: false },
  });

  const imported = await target.importOffsiteBackup({ key: `production/${backupName}.tar.gz` });
  assert.equal(imported.backup.name, backupName);
  assert.equal(imported.backup.restorable, true);
  assert.deepEqual((await target.getStatus()).backups.map((backup) => backup.name), [backupName]);
});

test('local backups can be manually synchronized to offsite storage', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  const backupName = '2026-08-07T05-30-00-000Z';
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await createBackupFixture(backupRoot, backupName);
  let archiveSize = 0;
  const manager = createBackupManager({
    offsiteStorage: {
      uploadBackup: async ({ backupName: syncedName, bodyFactory }) => {
        assert.equal(syncedName, backupName);
        archiveSize = (await collectStream(bodyFactory())).length;
        return { key: `production/${backupName}.tar.gz` };
      },
    },
    config: { backupRoot, workspaceRoot, backupOperationsEnabled: true, restoreOperationsEnabled: false },
  });

  const result = await manager.syncOffsiteBackup({ backupName });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.key, `production/${backupName}.tar.gz`);
  assert.ok(archiveSize > 0);
});

test('backup uploads enforce the compressed stream limit without trusting content-length', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const backupName = '2026-07-18T12-06-48-304Z';
  await createBackupFixture(backupRoot, backupName);
  const source = createBackupManager({
    config: { backupRoot, workspaceRoot, backupOperationsEnabled: true, restoreOperationsEnabled: true },
  });
  const download = await source.downloadBackup({ backupName });
  const archive = await collectStream(download.stream);
  await source.deleteBackup({ backupName });

  const limited = createBackupManager({
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupUploadMaxBytes: archive.length - 1,
    },
  });
  await assert.rejects(
    limited.uploadBackup({ filename: `${backupName}.tar.gz`, stream: Readable.from(archive) }),
    (error) => error instanceof BackupOperationError
      && error.status === 413
      && error.code === 'BACKUP_UPLOAD_TOO_LARGE',
  );
});

test('backup command starts a tracked job', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const fake = fakeSpawnFactory({ stdout: `${join(backupRoot, 'done')}\n` });
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  await writeFile(join(workspaceRoot, 'restore.js'), '');

  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const job = await manager.startBackup({ requestedBy: 'admin' });
  await new Promise((resolve) => setImmediate(resolve));
  const finished = manager.getJob(job.id);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.result.backupName, 'done');
  assert.equal(fake.calls[0].options.env.BACKUP_DIR, backupRoot);
});

test('successful backup jobs stream archives to offsite storage with configured local retention', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  const backupName = '2026-08-07T03-00-00-000Z';
  const directory = await createBackupFixture(backupRoot, backupName);
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  const fake = fakeSpawnFactory({ stdout: `${directory}\n` });
  let uploadedArchive = Buffer.alloc(0);

  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    offsiteStorage: {
      getRetentionPolicy: async () => ({ localRetentionDays: 14, remoteRetentionDays: 90 }),
      uploadBackup: async ({ backupName: uploadedName, bodyFactory }) => {
        assert.equal(uploadedName, backupName);
        uploadedArchive = await collectStream(bodyFactory());
        return { key: `production/${backupName}.tar.gz`, uploadedAt: '2026-08-07T03:01:00.000Z' };
      },
    },
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: false,
      backupCommand: 'node backup.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const job = await manager.startBackup({ requestedBy: 'system:scheduler' });
  for (let attempt = 0; attempt < 20 && manager.getJob(job.id).status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const finished = manager.getJob(job.id);

  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.result.offsite.status, 'succeeded');
  assert.equal(finished.result.offsite.key, `production/${backupName}.tar.gz`);
  assert.ok(uploadedArchive.length > 0);
  assert.equal(fake.calls[0].options.env.BACKUP_RETENTION_DAYS, '14');
});

test('offsite upload failures preserve a successful local backup job', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  const backupName = '2026-08-07T04-00-00-000Z';
  const directory = await createBackupFixture(backupRoot, backupName);
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  const fake = fakeSpawnFactory({ stdout: `${directory}\n` });
  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    offsiteStorage: {
      getPublicConfig: async () => ({ enabled: true }),
      uploadBackup: async () => {
        const error = new Error('object storage unavailable');
        error.code = 'BACKUP_STORAGE_UPLOAD_FAILED';
        throw error;
      },
    },
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: false,
      backupCommand: 'node backup.js',
    },
  });

  const job = await manager.startBackup({ requestedBy: 'admin' });
  for (let attempt = 0; attempt < 20 && manager.getJob(job.id).status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const finished = manager.getJob(job.id);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.result.backupName, backupName);
  assert.equal(finished.result.offsite.status, 'failed');
  assert.equal((await manager.getStatus()).backups[0].restorable, true);
});

test('failed backup jobs include stderr details', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const fake = fakeSpawnFactory({ stderr: 'mongodump failed loudly\n', exitCode: 1 });
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  await writeFile(join(workspaceRoot, 'restore.js'), '');

  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const job = await manager.startBackup({ requestedBy: 'admin' });
  await new Promise((resolve) => setImmediate(resolve));
  const finished = manager.getJob(job.id);
  assert.equal(finished.status, 'failed');
  assert.match(finished.error, /备份命令退出码 1/);
  assert.match(finished.error, /mongodump failed loudly/);
});

test('backup commands time out instead of staying running forever', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const fake = hangingSpawnFactory();
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  await writeFile(join(workspaceRoot, 'restore.js'), '');

  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
      backupCommandTimeoutMs: 5,
    },
  });

  const job = await manager.startBackup({ requestedBy: 'admin' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const finished = manager.getJob(job.id);
  assert.equal(finished.status, 'failed');
  assert.match(finished.error, /超时/);
  assert.deepEqual(fake.calls[0].signals, ['SIGTERM']);
});

test('restore verifies checksum and appends destructive restore arguments', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const directory = await createBackupFixture(backupRoot);
  const fake = fakeSpawnFactory();
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  await writeFile(join(workspaceRoot, 'restore.js'), '');

  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  const job = await manager.startRestore({ backupName: '2026-07-17T12-00-00-000Z', requestedBy: 'admin' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.getJob(job.id).status, 'succeeded');
  assert.deepEqual(fake.calls[1].args.slice(-2), [directory, '--confirm-drop']);
});

test('restore rejects unsafe backup names before spawning a command', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const fake = fakeSpawnFactory();
  await writeFile(join(workspaceRoot, 'backup.js'), '');
  await writeFile(join(workspaceRoot, 'restore.js'), '');

  const manager = createBackupManager({
    spawnImpl: fake.spawnImpl,
    config: {
      backupRoot,
      workspaceRoot,
      backupOperationsEnabled: true,
      restoreOperationsEnabled: true,
      backupCommand: 'node backup.js',
      restoreCommand: 'node restore.js',
      restoreConfirmText: 'RESTORE ALL DATA',
    },
  });

  await assert.rejects(
    () => manager.startRestore({ backupName: '../not-allowed', requestedBy: 'admin' }),
    /备份名称无效/,
  );
  assert.equal(fake.calls.length, 0);
});

test('runner client sends bearer token and proxies backup jobs', async () => {
  const token = 't'.repeat(32);
  const seen = [];

  await withHttpServer(async (req, res) => {
    seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'unauthorized', code: 'NOPE' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({ capabilities: { canBackup: true, canRestore: true }, backups: [], jobs: [] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/backups/run') {
      res.writeHead(202);
      res.end(JSON.stringify({ job: { id: 'remote-1', status: 'running', type: 'backup' } }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  }, async (origin) => {
    const client = createBackupRunnerClient({
      config: {
        backupRunnerUrl: origin,
        backupRunnerToken: token,
        backupRunnerTimeoutMs: 1000,
        restoreConfirmText: 'RESTORE ALL DATA',
      },
    });

    const status = await client.getStatus();
    assert.equal(status.capabilities.canBackup, true);
    const job = await client.startBackup({ requestedBy: 'admin' });
    assert.equal(job.id, 'remote-1');
  });

  assert.deepEqual(seen.map((request) => request.authorization), [`Bearer ${token}`, `Bearer ${token}`]);
});

test('runner client proxies offsite configuration and recovery operations', async () => {
  const token = 'o'.repeat(32);
  const seen = [];
  await withHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    seen.push({ method: req.method, url: req.url, body });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'GET' && req.url === '/offsite/config') {
      res.end(JSON.stringify({ config: { configured: true, provider: 'r2' } }));
      return;
    }
    if (req.method === 'PUT' && req.url === '/offsite/config') {
      res.end(JSON.stringify({ config: { configured: true, bucket: body.bucket } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/offsite/test') {
      res.end(JSON.stringify({ config: { healthy: true } }));
      return;
    }
    if (req.method === 'GET' && req.url === '/offsite/backups') {
      res.end(JSON.stringify({ backups: [{ key: 'production/remote.tar.gz' }] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/offsite/backups/import') {
      res.end(JSON.stringify({ backup: { name: body.key.split('/').at(-1).replace('.tar.gz', '') } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/offsite/backups/sync') {
      res.end(JSON.stringify({ sync: { status: 'succeeded', backupName: body.backupName } }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  }, async (origin) => {
    const client = createBackupRunnerClient({
      config: { backupRunnerUrl: origin, backupRunnerToken: token, backupRunnerTimeoutMs: 1000 },
    });
    assert.equal((await client.getOffsiteConfig()).provider, 'r2');
    assert.equal((await client.configureOffsite({ bucket: 'backups' })).bucket, 'backups');
    assert.equal((await client.testOffsiteConnection()).healthy, true);
    assert.equal((await client.listOffsiteBackups())[0].key, 'production/remote.tar.gz');
    assert.equal((await client.importOffsiteBackup({ key: 'production/remote.tar.gz' })).backup.name, 'remote');
    assert.equal((await client.syncOffsiteBackup({ backupName: 'local' })).status, 'succeeded');
  });

  assert.deepEqual(seen.map((request) => `${request.method} ${request.url}`), [
    'GET /offsite/config',
    'PUT /offsite/config',
    'POST /offsite/test',
    'GET /offsite/backups',
    'POST /offsite/backups/import',
    'POST /offsite/backups/sync',
  ]);
});

test('runner client recovers a backup job after the start request times out', async () => {
  const token = 't'.repeat(32);
  let jobs = [];

  await withHttpServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'unauthorized', code: 'NOPE' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/backups/run') {
      jobs = [{
        id: 'remote-timeout-1',
        type: 'backup',
        status: 'running',
        requestedBy: 'admin',
        createdAt: new Date().toISOString(),
      }];
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(202);
        res.end(JSON.stringify({ job: jobs[0] }));
      }, 100);
      return;
    }
    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify({ capabilities: { canBackup: true, canRestore: true }, backups: [], jobs }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  }, async (origin) => {
    const client = createBackupRunnerClient({
      config: {
        backupRunnerUrl: origin,
        backupRunnerToken: token,
        backupRunnerTimeoutMs: 20,
        restoreConfirmText: 'RESTORE ALL DATA',
      },
    });

    const job = await client.startBackup({ requestedBy: 'admin' });
    assert.equal(job.id, 'remote-timeout-1');
    assert.equal(job.status, 'running');
  });
});
