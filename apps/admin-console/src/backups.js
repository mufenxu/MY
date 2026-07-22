import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { createBackupArchiveStream, extractBackupArchive } from './backupArchives.js';

const MAX_LOG_CHARS = 12_000;
const BACKUP_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const IN_PROGRESS_SUFFIX = '.in-progress';
const DEFAULT_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export class BackupOperationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BackupOperationError';
    this.status = status;
    this.code = code;
  }
}

function fallbackRemoteStatus(config, issue) {
  return {
    capabilities: {
      canBackup: false,
      canRestore: false,
      backupRoot: 'remote-runner',
      restoreConfirmText: config.restoreConfirmText || 'RESTORE ALL DATA',
      issues: [issue],
    },
    backups: [],
    jobs: [],
  };
}

function isNodeStream(value) {
  return value && typeof value.pipe === 'function';
}

async function requestRunnerResponse(config, resource, {
  method = 'GET',
  body,
  headers = {},
  timeoutMs,
} = {}) {
  if (!config.backupRunnerToken) {
    throw new BackupOperationError(503, 'BACKUP_RUNNER_TOKEN_MISSING', '备份执行器令牌未配置。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? config.backupRunnerTimeoutMs ?? 8000);
  try {
    const response = await fetch(new URL(resource, config.backupRunnerUrl), {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.backupRunnerToken}`,
        ...headers,
      },
      body,
      ...(isNodeStream(body) ? { duplex: 'half' } : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new BackupOperationError(
        response.status,
        data.code || 'BACKUP_RUNNER_ERROR',
        data.error || `备份执行器请求失败（HTTP ${response.status}）。`,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof BackupOperationError) throw error;
    const isAbort = error.name === 'AbortError';
    throw new BackupOperationError(
      isAbort ? 504 : 502,
      isAbort ? 'BACKUP_RUNNER_TIMEOUT' : 'BACKUP_RUNNER_UNAVAILABLE',
      isAbort ? '备份执行器请求超时。' : `备份执行器不可用：${error.message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function requestRunner(config, resource, { method = 'GET', body, timeoutMs } = {}) {
  const response = await requestRunnerResponse(config, resource, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return response.json().catch(() => ({}));
}

function jobTime(job) {
  return Date.parse(job?.createdAt || job?.startedAt || job?.finishedAt || '') || 0;
}

function findStartedRunnerJob(status, { type, requestedBy, backupName, startedAfter }) {
  const cutoff = startedAfter - 30_000;
  const jobs = Array.isArray(status?.jobs) ? status.jobs : [];
  return jobs
    .filter((job) => job?.type === type)
    .filter((job) => ['running', 'succeeded', 'failed'].includes(job.status))
    .filter((job) => jobTime(job) >= cutoff)
    .filter((job) => !requestedBy || !job.requestedBy || job.requestedBy === requestedBy)
    .filter((job) => !backupName || job.backupName === backupName)
    .sort((left, right) => jobTime(right) - jobTime(left))[0] || null;
}

async function recoverStartedRunnerJob(config, criteria, originalError) {
  if (!(originalError instanceof BackupOperationError) || originalError.code !== 'BACKUP_RUNNER_TIMEOUT') {
    throw originalError;
  }

  try {
    const status = await requestRunner(config, '/status');
    const job = findStartedRunnerJob(status, criteria);
    if (job) return job;
  } catch {
    // Preserve the original start failure; the status probe is best-effort.
  }
  throw originalError;
}

export function createBackupRunnerClient({ config } = {}) {
  return {
    async getStatus() {
      try {
        return await requestRunner(config, '/status');
      } catch (error) {
        if (error instanceof BackupOperationError) {
          return fallbackRemoteStatus(config, error.message);
        }
        throw error;
      }
    },
    async startBackup({ requestedBy } = {}) {
      const startedAfter = Date.now();
      try {
        const data = await requestRunner(config, '/backups/run', {
          method: 'POST',
          body: { requestedBy },
        });
        return data.job;
      } catch (error) {
        return recoverStartedRunnerJob(config, { type: 'backup', requestedBy, startedAfter }, error);
      }
    },
    async startRestore({ backupName, requestedBy } = {}) {
      const startedAfter = Date.now();
      try {
        const data = await requestRunner(config, '/backups/restore', {
          method: 'POST',
          body: { backupName, requestedBy },
        });
        return data.job;
      } catch (error) {
        return recoverStartedRunnerJob(config, { type: 'restore', backupName, requestedBy, startedAfter }, error);
      }
    },
    async getJob(id) {
      const data = await requestRunner(config, `/backups/jobs/${encodeURIComponent(id)}`);
      return data.job;
    },
    async downloadBackup({ backupName } = {}) {
      const response = await requestRunnerResponse(config, `/backups/${encodeURIComponent(backupName)}/download`, {
        timeoutMs: config.backupTransferTimeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS,
        headers: { Accept: 'application/gzip' },
      });
      return {
        filename: `${backupName}.tar.gz`,
        contentType: response.headers.get('content-type') || 'application/gzip',
        stream: Readable.fromWeb(response.body),
      };
    },
    async deleteBackup({ backupName } = {}) {
      const data = await requestRunner(config, `/backups/${encodeURIComponent(backupName)}`, {
        method: 'DELETE',
      });
      return data;
    },
    async uploadBackup({ filename, stream, contentType } = {}) {
      const response = await requestRunnerResponse(
        config,
        `/backups/upload?filename=${encodeURIComponent(filename || '')}`,
        {
          method: 'POST',
          body: stream,
          timeoutMs: config.backupTransferTimeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS,
          headers: {
            Accept: 'application/json',
            'Content-Type': contentType || 'application/gzip',
          },
        },
      );
      return response.json().catch(() => ({}));
    },
  };
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

function commandScriptTarget(spec) {
  if (!spec) return '';
  const commandName = path.basename(String(spec.command || '')).toLowerCase();
  const runsNode = ['node', 'node.exe'].includes(commandName) || path.resolve(spec.command) === process.execPath;
  if (!runsNode) return '';
  return spec.args.find((arg) => !String(arg).startsWith('-')) || '';
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandScriptAvailable(spec, workspaceRoot) {
  const target = commandScriptTarget(spec);
  if (!target) return true;
  return exists(path.isAbsolute(target) ? target : path.resolve(workspaceRoot, target));
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

function isVisibleBackupDirectory(name) {
  return isSafeBackupName(name) && !String(name || '').endsWith(IN_PROGRESS_SUFFIX);
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
    if (!entry.isDirectory() || !isVisibleBackupDirectory(entry.name)) continue;
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
    let backupSpec = null;
    let restoreSpec = null;

    try {
      backupSpec = parseCommandSpec(config.backupCommand, backupScriptAvailable
        ? { command: process.execPath, args: [backupScript] }
        : null);
    } catch {
      backupCommandValid = false;
    }
    try {
      restoreSpec = parseCommandSpec(config.restoreCommand, restoreScriptAvailable
        ? { command: process.execPath, args: [restoreScript] }
        : null);
    } catch {
      restoreCommandValid = false;
    }
    if (backupCommandValid && !await commandScriptAvailable(backupSpec, config.workspaceRoot)) {
      backupCommandValid = false;
    }
    if (restoreCommandValid && !await commandScriptAvailable(restoreSpec, config.workspaceRoot)) {
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
    const stderrStart = job.stderr.length;
    const commandTimeoutMs = Number.isFinite(Number(options.timeoutMs ?? config.backupCommandTimeoutMs))
      ? Number(options.timeoutMs ?? config.backupCommandTimeoutMs)
      : DEFAULT_COMMAND_TIMEOUT_MS;
    return new Promise((resolve) => {
      let child;
      let settled = false;
      let timeout = null;
      let killTimer = null;
      let timeoutError = null;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (killTimer) clearTimeout(killTimer);
        resolve({
          ...result,
          stdout: job.stdout.slice(stdoutStart),
          stderr: job.stderr.slice(stderrStart),
        });
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

      if (commandTimeoutMs > 0) {
        timeout = setTimeout(() => {
          const seconds = Math.round(commandTimeoutMs / 1000);
          timeoutError = new Error(`${options.label || '任务'}命令执行超时（超过 ${seconds} 秒）。`);
          job.stderr = `${job.stderr}\n${timeoutError.message}\n`.slice(-MAX_LOG_CHARS);
          child.kill?.('SIGTERM');
          killTimer = setTimeout(() => child.kill?.('SIGKILL'), 5000);
        }, commandTimeoutMs);
      }

      child.stdout?.on('data', (chunk) => appendLog(job, 'stdout', chunk));
      child.stderr?.on('data', (chunk) => appendLog(job, 'stderr', chunk));
      child.once('error', (error) => settle({ code: null, error }));
      child.once('close', (code) => settle({ code, error: timeoutError }));
    });
  }

  function failureMessage(step, result) {
    const details = [
      result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : '',
      result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
    ].filter(Boolean).join('\n\n');
    return details
      ? `${step.label}命令退出码 ${result.code}\n\n${details}`
      : `${step.label}命令退出码 ${result.code}`;
  }

  async function runJobSteps(job, steps) {
    for (const step of steps) {
      const result = await runCommand(job, step.spec, step.variables, { ...step.options, label: step.label });
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
        job.error = failureMessage(step, result);
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

  function resolveBackupPath(backupName) {
    if (!isVisibleBackupDirectory(backupName)) {
      throw new BackupOperationError(400, 'INVALID_BACKUP_NAME', '备份名称无效。');
    }
    const directory = path.resolve(backupRoot, backupName);
    if (!directory.startsWith(`${backupRoot}${path.sep}`)) {
      throw new BackupOperationError(400, 'INVALID_BACKUP_NAME', '备份名称无效。');
    }
    return directory;
  }

  async function resolveBackupDirectory(backupName) {
    const directory = resolveBackupPath(backupName);
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

  async function downloadBackup({ backupName } = {}) {
    const directory = await resolveBackupDirectory(backupName);
    return {
      filename: `${backupName}.tar.gz`,
      contentType: 'application/gzip',
      stream: createBackupArchiveStream(directory, backupName),
    };
  }

  async function deleteBackup({ backupName } = {}) {
    if (activeJob()) {
      throw new BackupOperationError(409, 'BACKUP_JOB_RUNNING', '已有备份或恢复任务正在执行。');
    }
    const directory = resolveBackupPath(backupName);
    const stats = await stat(directory).catch((error) => {
      if (error.code === 'ENOENT') {
        throw new BackupOperationError(404, 'BACKUP_NOT_FOUND', '备份不存在。');
      }
      throw error;
    });
    if (!stats.isDirectory()) throw new BackupOperationError(404, 'BACKUP_NOT_FOUND', '备份不存在。');
    await rm(directory, { recursive: true, force: true });
    return { backupName };
  }

  async function uploadBackup({ filename, stream } = {}) {
    if (activeJob()) {
      throw new BackupOperationError(409, 'BACKUP_JOB_RUNNING', '已有备份或恢复任务正在执行。');
    }
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const workDirectory = path.join(backupRoot, `.upload-${crypto.randomUUID()}.in-progress`);
    let completed = false;
    try {
      const extracted = await extractBackupArchive({
        source: stream,
        targetDirectory: workDirectory,
        fallbackName: filename,
        backupNameAllowed: isVisibleBackupDirectory,
        maxExtractedBytes: config.backupUploadMaxBytes || DEFAULT_UPLOAD_MAX_BYTES,
        maxSourceBytes: config.backupUploadMaxBytes || DEFAULT_UPLOAD_MAX_BYTES,
      });
      const targetDirectory = resolveBackupPath(extracted.backupName);
      if (await exists(targetDirectory)) {
        throw new BackupOperationError(409, 'BACKUP_ALREADY_EXISTS', '同名备份已存在，请先删除后再上传。');
      }
      const manifest = await readManifest(workDirectory).catch(() => null);
      if (!manifest?.restorable) {
        throw new BackupOperationError(400, 'BACKUP_UPLOAD_INVALID', '上传的备份包不完整或清单无效。');
      }
      const archivePath = path.join(workDirectory, manifest.mongoArchive);
      if (await sha256(archivePath) !== manifest.mongoSha256) {
        throw new BackupOperationError(400, 'BACKUP_CHECKSUM_MISMATCH', '上传的备份校验失败。');
      }
      await rename(workDirectory, targetDirectory);
      completed = true;
      return { backup: await readManifest(targetDirectory) };
    } catch (error) {
      if (error?.code === 'BACKUP_UPLOAD_TOO_LARGE') {
        throw new BackupOperationError(413, 'BACKUP_UPLOAD_TOO_LARGE', 'The backup archive exceeds the configured upload limit.');
      }
      throw error;
    } finally {
      if (!completed) await rm(workDirectory, { recursive: true, force: true });
    }
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
    downloadBackup,
    deleteBackup,
    uploadBackup,
  };
}
