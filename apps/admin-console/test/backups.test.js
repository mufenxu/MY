import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackupManager } from '../src/backups.js';

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

test('backup command starts a tracked job', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const fake = fakeSpawnFactory({ stdout: `${join(backupRoot, 'done')}\n` });

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

test('restore verifies checksum and appends destructive restore arguments', async (t) => {
  const backupRoot = await mkdtemp(join(tmpdir(), 'my-platform-backups-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'my-platform-workspace-'));
  t.after(() => rm(backupRoot, { recursive: true, force: true }));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const directory = await createBackupFixture(backupRoot);
  const fake = fakeSpawnFactory();

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
