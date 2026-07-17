import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  mkdir,
  readdir,
  readFile,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

const MAX_LOG_CHARS = 12_000;
const BACKUP_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

export class BackupOperationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BackupOperationError';
    this.status = status;
    this.code = code;
  }
}

function appendLog(job, streamName, chunk) {
  const text = chunk.toString('utf8');
  const key = streamName === 'stderr' ? 'stderr' : 'stdout';
  job[key] = `${job[key]}${text}`.slice(-MAX_LOG_CHARS);
}

function parseCommandLine(value) {
  const parts = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = pattern.exec(String(value || '')))) {
    parts.push(match[1] ?? match[2] ?? match[0]);
  }
  return parts;
}

function parseCommandSpec(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  if (raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== 'string')) {
      throw new Error('command array must contain strings');
    }
    return { command: parsed[0], args: parsed.slice(1), custom: true };
  }

  const parts = parseCommandLine(raw);
  if (parts.length === 0) return fallback;
  return { command: parts[0], args: parts.slice(1), custom: true };
}

function fillPlaceholders(value, variables) {
  return String(value)
    .replaceAll('{backupDirectory}', variables.backupDirectory || '')
    .replaceAll('{confirmDrop}', variables.confirmDrop || '--confirm-drop');
}

function commandWithVariables(spec, variables, { appendRestoreArgs = false } = {}) {
  const args = spec.args.map((arg) => fillPlaceholders(arg, variables));
  const command = fillPlaceholders(spec.command, variables);
  const hasBackupDirectoryPlaceholder = spec.args.some((arg) => String(arg).includes('{backupDirectory}'))
    || String(spec.command).includes('{backupDirectory}');
  if (appendRestoreArgs && !hasBackupDirectoryPlaceholder) {
    args.push(variables.backupDirectory, variables.confirmDrop || '--confirm-drop');
  }
  return { command, args };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function serializeJob(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    backupName: job.backupName,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    requestedBy: job.requestedBy,
    exitCode: job.exitCode,
    error: job.error,
    stdout: job.stdout,
    stderr: job.stderr,
    result: job.result,
  };
}

function backupNameFromDirectory(directory) {
  return path.basename(directory);
}

function isSafeBackupName(name) {
  return BACKUP_NAME_PATTERN.test(String(name || ''))
    && path.basename(String(name || '')) === String(name || '');
}

async function readManifest(directory) {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const archiveName = manifest.mongoArchive || 'mongodb.archive.gz';
  if (path.basename(archiveName) !== archiveName) {
    throw new Error('manifest archive path must be a file name');
  }
  const archivePath = path.join(directory, archiveName);
  const archiveExists = await exists(archivePath);
  const archiveStats = archiveExists ? await stat(archivePath) : null;

  return {
    name: backupNameFromDirectory(directory),
    directory,
    formatVersion: manifest.formatVersion,
    createdAt: manifest.createdAt,
    includes: Array.isArray(manifest.includes) ? manifest.includes : [],
    applicationsStopped: Array.isArray(manifest.applicationsStopped) ? manifest.applicationsStopped : [],
    mongoArchive: archiveName,
    mongoSha256: manifest.mongoSha256 || '',
    oplog: Boolean(manifest.oplog),
    sizeBytes: archiveStats?.size || 0,
    restorable: Boolean(archiveExists && manifest.mongoSha256),
  };
}

async function listBackupManifests(backupRoot) {
  let entries;
  try {
    entries = await readdir(backupRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeBackupName(entry.name)) continue;
    const directory = path.join(backupRoot, entry.name);
    try {
      backups.push(await readManifest(directory));
    } catch {
      backups.push({
        name: entry.name,
        directory,
        createdAt: null,
        includes: [],
        applicationsStopped: [],
        sizeBytes: 0,
        restorable: false,
        invalid: true,
      });
    }
  }

  backups.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    return rightTime - leftTime || right.name.localeCompare(left.name);
  });
  return backups;
}

export function createBackupManager({
  config,
  spawnImpl = spawn,
  env = process.env,
  idFactory = () => crypto.randomUUID(),
  now = () => new Date(),
} = {}) {
  const jobs = new Map();
  const backupRoot = path.resolve(config.backupRoot);
  const backupScript = path.join(config.workspaceRoot, 'scripts', 'backup-mongodb.mjs');
  const restoreScript = path.join(config.workspaceRoot, 'scripts', 'restore-mongodb.mjs');
  const preRestoreBackupEnabled = config.preRestoreBackupEnabled !== false;

  function recentJobs() {
    return [...jobs.values()]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 8)
      .map(serializeJob);
  }

  function activeJob() {
    return [...jobs.values()].find((job) => job.status === 'running');
  }

  async function capabilities() {
    const backupScriptAvailable = await exists(backupScript);
    const restoreScriptAvailable = await exists(restoreScript);
    let backupCommandValid = true;
    let restoreCommandValid = true;

    try {
      parseCommandSpec(config.backupCommand, backupScriptAvailable
        ? { command: process.execPath, args: [backupScript] }
        : null);
    } catch {
      backupCommandValid = false;
    }
    try {
      parseCommandSpec(config.restoreCommand, restoreScriptAvailable
        ? { command: process.execPath, args: [restoreScript] }
        : null);
    } catch {
      restoreCommandValid = false;
    }

    const canBackup = Boolean(config.backupOperationsEnabled && backupCommandValid && (config.backupCommand || backupScriptAvailable));
    const restoreCommandAvailable = Boolean(restoreCommandValid && (config.restoreCommand || restoreScriptAvailable));
    const preRestoreBackupReady = !preRestoreBackupEnabled || canBackup;
    const canRestore = Boolean(config.restoreOperationsEnabled && restoreCommandAvailable && preRestoreBackupReady);
    const issues = [];
    if (!canBackup) issues.push('备份执行器不可用');
    if (!restoreCommandAvailable || !config.restoreOperationsEnabled) issues.push('恢复执行器不可用');
    if (preRestoreBackupEnabled && !canBackup) issues.push('恢复前自动备份不可用');

    return {
      canBackup,
      canRestore,
      backupRoot,
      restoreConfirmText: config.restoreConfirmText,
      issues,
    };
  }

  async function getStatus() {
    return {
      capabilities: await capabilities(),
      backups: await listBackupManifests(backupRoot),
      jobs: recentJobs(),
    };
  }

  function createJob(type, { requestedBy, backupName } = {}) {
    const job = {
      id: idFactory(),
      type,
      status: 'running',
      backupName,
      createdAt: now().toISOString(),
      startedAt: now().toISOString(),
      finishedAt: null,
      requestedBy,
      exitCode: null,
      error: '',
      stdout: '',
      stderr: '',
      result: null,
    };
    jobs.set(job.id, job);
    return job;
  }

  function parseBackupResult(stdout) {
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const backupDirectory = lines.at(-1) || '';
    return backupDirectory ? { backupDirectory, backupName: path.basename(backupDirectory) } : null;
  }

  function runCommand(job, spec, variables, options = {}) {
    const commandSpec = commandWithVariables(spec, variables, options);
    const stdoutStart = job.stdout.length;
    return new Promise((resolve) => {
      let child;
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve({ ...result, stdout: job.stdout.slice(stdoutStart) });
      };

      try {
        child = spawnImpl(commandSpec.command, commandSpec.args, {
          cwd: config.workspaceRoot,
          env: { ...env, BACKUP_DIR: backupRoot },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (error) {
        settle({ code: null, error });
        return;
      }

      child.stdout?.on('data', (chunk) => appendLog(job, 'stdout', chunk));
      child.stderr?.on('data', (chunk) => appendLog(job, 'stderr', chunk));
      child.once('error', (error) => settle({ code: null, error }));
      child.once('close', (code) => settle({ code, error: null }));
    });
  }

  async function runJobSteps(job, steps) {
    for (const step of steps) {
      const result = await runCommand(job, step.spec, step.variables, step.options);
      job.exitCode = result.code;
      if (result.error) {
        job.status = 'failed';
        job.finishedAt = now().toISOString();
        job.error = result.error.message;
        return;
      }
      if (result.code !== 0) {
        job.status = 'failed';
        job.finishedAt = now().toISOString();
        job.error = `${step.label}命令退出码 ${result.code}`;
        return;
      }
      if (step.captureBackupResult) {
        const backupResult = parseBackupResult(result.stdout);
        if (backupResult) {
          job.result = step.resultKey === 'preRestoreBackup'
            ? { ...(job.result || {}), preRestoreBackup: backupResult }
            : { ...(job.result || {}), ...backupResult };
        }
      }
    }

    job.status = 'succeeded';
    job.finishedAt = now().toISOString();
  }

  function startJobSteps(job, steps) {
    runJobSteps(job, steps).catch((error) => {
      job.status = 'failed';
      job.finishedAt = now().toISOString();
      job.error = error.message;
    });
  }

  async function startBackup({ requestedBy } = {}) {
    const caps = await capabilities();
    if (!caps.canBackup) {
      throw new BackupOperationError(503, 'BACKUP_EXECUTOR_UNAVAILABLE', '备份执行器不可用。');
    }
    if (activeJob()) {
      throw new BackupOperationError(409, 'BACKUP_JOB_RUNNING', '已有备份或恢复任务正在执行。');
    }

    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const spec = parseCommandSpec(config.backupCommand, { command: process.execPath, args: [backupScript] });
    const job = createJob('backup', { requestedBy });
    startJobSteps(job, [{
      label: '备份',
      spec,
      variables: {},
      options: {},
      captureBackupResult: true,
    }]);
    return serializeJob(job);
  }

  async function resolveBackupDirectory(backupName) {
    if (!isSafeBackupName(backupName)) {
      throw new BackupOperationError(400, 'INVALID_BACKUP_NAME', '备份名称无效。');
    }
    const directory = path.resolve(backupRoot, backupName);
    if (!directory.startsWith(`${backupRoot}${path.sep}`)) {
      throw new BackupOperationError(400, 'INVALID_BACKUP_NAME', '备份名称无效。');
    }
    const manifest = await readManifest(directory).catch(() => null);
    if (!manifest?.restorable) {
      throw new BackupOperationError(400, 'BACKUP_NOT_RESTORABLE', '备份包不完整或清单无效。');
    }
    const archivePath = path.join(directory, manifest.mongoArchive);
    if (await sha256(archivePath) !== manifest.mongoSha256) {
      throw new BackupOperationError(400, 'BACKUP_CHECKSUM_MISMATCH', '备份校验失败。');
    }
    return directory;
  }

  async function startRestore({ backupName, requestedBy } = {}) {
    const caps = await capabilities();
    if (!caps.canRestore) {
      throw new BackupOperationError(503, 'RESTORE_EXECUTOR_UNAVAILABLE', '恢复执行器不可用。');
    }
    if (activeJob()) {
      throw new BackupOperationError(409, 'BACKUP_JOB_RUNNING', '已有备份或恢复任务正在执行。');
    }

    const backupDirectory = await resolveBackupDirectory(backupName);
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const backupSpec = parseCommandSpec(config.backupCommand, { command: process.execPath, args: [backupScript] });
    const restoreSpec = parseCommandSpec(config.restoreCommand, { command: process.execPath, args: [restoreScript] });
    const job = createJob('restore', { requestedBy, backupName });
    const steps = [];
    if (preRestoreBackupEnabled) {
      steps.push({
        label: '恢复前备份',
        spec: backupSpec,
        variables: {},
        options: {},
        captureBackupResult: true,
        resultKey: 'preRestoreBackup',
      });
    }
    steps.push({
      label: '恢复',
      spec: restoreSpec,
      variables: { backupDirectory, confirmDrop: '--confirm-drop' },
      options: { appendRestoreArgs: true },
    });
    startJobSteps(job, steps);
    return serializeJob(job);
  }

  function getJob(id) {
    const job = jobs.get(id);
    if (!job) throw new BackupOperationError(404, 'BACKUP_JOB_NOT_FOUND', '任务不存在。');
    return serializeJob(job);
  }

  return {
    getStatus,
    startBackup,
    startRestore,
    getJob,
  };
}
