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
