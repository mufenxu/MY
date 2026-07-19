import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chmod, mkdir, open, readFile, rename, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMPONENTS = {
  platform: { service: 'platform-api', envKey: 'PLATFORM_API_IMAGE' },
  backup: { service: 'backup-runner', envKey: 'BACKUP_RUNNER_IMAGE' },
  core: { service: 'core-api', envKey: 'CORE_API_IMAGE' },
  exam: { service: 'exam-api', envKey: 'EXAM_API_IMAGE' },
  notification: { service: 'notification-service', envKey: 'NOTIFICATION_SERVICE_IMAGE' },
  campus: { service: 'campus-service', envKey: 'CAMPUS_SERVICE_IMAGE' },
  iot: { service: 'iot-service', envKey: 'IOT_SERVICE_IMAGE' },
  mongodb: { service: 'mongodb', envKey: 'MONGODB_IMAGE' },
};
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_LOG_CHARS = 24_000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

function safeEqual(left, right) {
  const actual = Buffer.from(String(left || ''));
  const expected = Buffer.from(String(right || ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function truncate(value, maximum = MAX_LOG_CHARS) {
  const text = String(value || '');
  return text.length > maximum ? text.slice(-maximum) : text;
}

function parseJsonRows(value) {
  const source = String(value || '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return source.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
}

export function parseDockerTemplateRows(value, fields) {
  return String(value || '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const columns = line.split('\t');
    if (columns.length !== fields.length) throw new Error('Docker inspect returned an unexpected field count.');
    return Object.fromEntries(fields.map((field, index) => [field, JSON.parse(columns[index])]));
  });
}

export function parseEnvSource(source) {
  const values = new Map();
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

export function updateEnvSource(source, updates) {
  const pending = new Map(Object.entries(updates));
  const newline = String(source).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(source || '').split(/\r?\n/).map((rawLine) => {
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) return rawLine;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  return lines.join(newline);
}

export function validateWorkspaceMount(container, workspaceRoot) {
  const expected = path.posix.resolve(workspaceRoot);
  const mount = (container?.Mounts || []).find((item) => item.Destination === expected);
  if (!mount || path.posix.resolve(mount.Source) !== expected) {
    throw new Error(`Expected identical host/container workspace path: ${expected}`);
  }
  return expected;
}

export function normalizeComponents(values) {
  const components = [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
  if (!components.length || components.some((component) => !COMPONENTS[component])) {
    throw new RunnerError(400, 'INVALID_COMPONENTS', '部署组件无效。');
  }
  return components;
}

export function validateRunnerArtifact(value, config) {
  const component = String(value?.component || '').trim().toLowerCase();
  const digest = String(value?.digest || '').trim().toLowerCase();
  const reference = String(value?.reference || '').trim();
  const repository = config.allowedImageRepository;
  if (!COMPONENTS[component] || !DIGEST_PATTERN.test(digest) || reference !== `${repository}@${digest}`) {
    throw new RunnerError(400, 'INVALID_ARTIFACT', '部署产物必须是允许仓库中的不可变 Digest。');
  }
  return {
    component,
    digest,
    reference,
    image: String(value.image || '').trim(),
    shaTag: String(value.shaTag || '').trim(),
  };
}

export function loadRunnerConfig(env = process.env) {
  const workspaceRoot = path.resolve(env.DEPLOY_RUNNER_WORKSPACE_ROOT || process.cwd());
  return {
    host: String(env.DEPLOY_RUNNER_HOST || '127.0.0.1'),
    port: parseInteger(env.DEPLOY_RUNNER_PORT, 22104, 1, 65535),
    token: String(env.DEPLOY_RUNNER_TOKEN || ''),
    callbackUrl: String(env.DEPLOY_RUNNER_CALLBACK_URL || ''),
    callbackToken: String(env.DEPLOY_RUNNER_CALLBACK_TOKEN || ''),
    allowedImageRepository: String(env.DEPLOY_RUNNER_ALLOWED_IMAGE_REPOSITORY || '').trim().replace(/[:/@]+$/, ''),
    workspaceRoot,
    composeFile: path.resolve(workspaceRoot, env.DEPLOY_RUNNER_COMPOSE_FILE || 'infra/docker/compose.yml'),
    envFile: path.resolve(workspaceRoot, env.DEPLOY_RUNNER_ENV_FILE || '.env'),
    stateDir: path.resolve(env.DEPLOY_RUNNER_STATE_DIR || path.join(workspaceRoot, '.deployment-runner')),
    enabled: parseBoolean(env.DEPLOY_RUNNER_ENABLED, false),
    expectSelfMount: parseBoolean(env.DEPLOY_RUNNER_EXPECT_SELF_MOUNT, false),
    allowMongoDb: parseBoolean(env.DEPLOY_RUNNER_ALLOW_MONGODB, false),
    minimumFreeBytes: parseInteger(env.DEPLOY_RUNNER_MINIMUM_FREE_BYTES, 2 * 1024 * 1024 * 1024, 128 * 1024 * 1024, Number.MAX_SAFE_INTEGER),
    commandTimeoutMs: parseInteger(env.DEPLOY_RUNNER_COMMAND_TIMEOUT_MS, 10 * 60 * 1000, 10_000, 30 * 60 * 1000),
    waitTimeoutSeconds: parseInteger(env.DEPLOY_RUNNER_WAIT_TIMEOUT_SECONDS, 240, 30, 900),
    smokeUrls: String(env.DEPLOY_RUNNER_SMOKE_URLS || 'http://127.0.0.1:22100/api/readyz')
      .split(',').map((value) => value.trim()).filter(Boolean),
  };
}

export class RunnerError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'RunnerError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function atomicWrite(filename, content, mode = 0o600) {
  const directory = path.dirname(filename);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(filename)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: 'utf8', mode });
  await chmod(temporary, mode);
  await rename(temporary, filename);
}

function commandResult(command, args, { cwd, timeoutMs, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout = truncate(stdout + chunk.toString()); });
    child.stderr?.on('data', (chunk) => { stderr = truncate(stderr + chunk.toString()); });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr, code });
      const error = new Error(`${command} exited with ${code ?? signal}: ${stderr || stdout}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      return reject(error);
    });
  });
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RunnerError(413, 'REQUEST_TOO_LARGE', '请求体过大。');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RunnerError(400, 'INVALID_JSON', '请求体不是有效 JSON。');
  }
}

function sendJson(res, status, body) {
  const content = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(content);
}

export function createDeploymentRunner({
  config = loadRunnerConfig(),
  spawnImpl = spawn,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const jobs = new Map();
  const queue = [];
  const jobsPath = path.join(config.stateDir, 'jobs.json');
  const lockPath = path.join(config.stateDir, 'deployment.lock');
  let processing = false;

  function validateConfig() {
    const issues = [];
    if (config.token.length < 32) issues.push('DEPLOY_RUNNER_TOKEN must contain at least 32 characters');
    if (config.callbackToken.length < 32) issues.push('DEPLOY_RUNNER_CALLBACK_TOKEN must contain at least 32 characters');
    if (!/^https?:\/\//.test(config.callbackUrl)) issues.push('DEPLOY_RUNNER_CALLBACK_URL must be an HTTP(S) URL');
    if (!/^[a-z0-9][a-z0-9._/-]+$/i.test(config.allowedImageRepository)) issues.push('DEPLOY_RUNNER_ALLOWED_IMAGE_REPOSITORY is invalid');
    return issues;
  }

  async function persistJobs() {
    const rows = [...jobs.values()]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 100);
    await atomicWrite(jobsPath, `${JSON.stringify(rows, null, 2)}\n`);
  }

  async function initialize() {
    await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
    await chmod(config.stateDir, 0o700);
    try {
      const rows = JSON.parse(await readFile(jobsPath, 'utf8'));
      for (const row of Array.isArray(rows) ? rows : []) {
        if (['queued', 'running'].includes(row.status)) {
          row.status = 'failed';
          row.error = '部署执行器重启，未完成任务已终止。';
          row.completedAt = now().toISOString();
        }
        jobs.set(row.id, row);
      }
      await persistJobs();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      if (lock?.pid) {
        try {
          process.kill(lock.pid, 0);
          throw new Error(`deployment lock is held by pid ${lock.pid}`);
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
      await unlink(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async function runDocker(args, timeoutMs = config.commandTimeoutMs) {
    return commandResult('docker', args, { cwd: config.workspaceRoot, timeoutMs, spawnImpl });
  }

  function composeArgs(...args) {
    return ['compose', '--env-file', config.envFile, '-f', config.composeFile, ...args];
  }

  async function inspectRuntime() {
    const envSource = await readFile(config.envFile, 'utf8');
    const envValues = parseEnvSource(envSource);
    const { stdout } = await runDocker(composeArgs('ps', '--all', '--format', 'json'), 30_000);
    const rows = parseJsonRows(stdout);
    const containerIds = rows.map((row) => row.ID).filter(Boolean);
    const containerDetails = containerIds.length
      ? parseDockerTemplateRows((await runDocker([
        'inspect', '--format', '{{json .Id}}\t{{json .Image}}\t{{json .State}}', ...containerIds,
      ], 30_000)).stdout, ['Id', 'Image', 'State'])
      : [];
    const containers = new Map(containerDetails.map((item) => [item.Id, item]));
    const imageIds = [...new Set(containerDetails.map((item) => item.Image).filter(Boolean))];
    const imageDetails = imageIds.length
      ? parseDockerTemplateRows((await runDocker([
        'image', 'inspect', '--format', '{{json .Id}}\t{{json .RepoDigests}}\t{{json .Config.Labels}}', ...imageIds,
      ], 30_000)).stdout, ['Id', 'RepoDigests', 'Labels'])
      : [];
    const images = new Map(imageDetails.map((item) => [item.Id, item]));
    const byService = new Map(rows.map((row) => [row.Service, row]));
    const components = Object.entries(COMPONENTS).map(([component, definition]) => {
      const row = byService.get(definition.service);
      const container = row?.ID ? containers.get(row.ID) : null;
      const image = container?.Image ? images.get(container.Image) : null;
      const configuredImage = envValues.get(definition.envKey) || '';
      const trustedRepoDigest = (image?.RepoDigests || []).find((value) => value.startsWith(`${config.allowedImageRepository}@sha256:`)) || '';
      const digest = trustedRepoDigest.split('@')[1] || '';
      const labels = image?.Labels || {};
      const configuredDigest = configuredImage.split('@')[1] || '';
      return {
        component,
        service: definition.service,
        configuredImage,
        containerImage: row?.Image || '',
        imageId: container?.Image || '',
        digest,
        reference: trustedRepoDigest,
        revision: String(labels['org.opencontainers.image.revision'] || '').slice(0, 40),
        state: row?.State || (row ? 'unknown' : 'missing'),
        health: row?.Health || container?.State?.Health?.Status || (container?.State?.Running ? 'running' : 'unknown'),
        startedAt: container?.State?.StartedAt || null,
        inSync: DIGEST_PATTERN.test(configuredDigest) ? configuredDigest === digest : null,
      };
    });
    return { components, observedAt: now().toISOString() };
  }

  async function preflight({ components, action = 'deploy' }) {
    const normalized = normalizeComponents(components);
    const checks = [];
    const configIssues = validateConfig();
    checks.push({
      id: 'runner_configuration',
      label: '执行器配置',
      status: config.enabled && !configIssues.length ? 'passed' : 'blocked',
      detail: !config.enabled ? 'DEPLOY_RUNNER_ENABLED 未启用' : configIssues.join('；') || '配置完整',
    });
    try {
      const version = await runDocker(['version', '--format', '{{.Server.Version}}'], 15_000);
      checks.push({ id: 'docker_engine', label: 'Docker Engine', status: 'passed', detail: version.stdout.trim() });
    } catch (error) {
      checks.push({ id: 'docker_engine', label: 'Docker Engine', status: 'blocked', detail: truncate(error.message, 240) });
    }
    try {
      await runDocker(composeArgs('config', '--quiet'), 30_000);
      checks.push({ id: 'compose_configuration', label: 'Compose 配置', status: 'passed', detail: '配置有效' });
    } catch (error) {
      checks.push({ id: 'compose_configuration', label: 'Compose 配置', status: 'blocked', detail: truncate(error.message, 240) });
    }
    if (config.expectSelfMount) {
      try {
        const containerId = String(process.env.HOSTNAME || '').trim();
        if (!containerId) throw new Error('Container identity is unavailable.');
        const [self] = JSON.parse((await runDocker(['inspect', containerId], 15_000)).stdout);
        validateWorkspaceMount(self, config.workspaceRoot);
        checks.push({ id: 'workspace_mount', label: '工作区路径', status: 'passed', detail: config.workspaceRoot });
      } catch (error) {
        checks.push({ id: 'workspace_mount', label: '工作区路径', status: 'blocked', detail: truncate(error.message, 240) });
      }
    }
    try {
      const capacity = await statfs(config.workspaceRoot);
      const freeBytes = Number(capacity.bavail) * Number(capacity.bsize);
      checks.push({
        id: 'disk_capacity',
        label: '磁盘可用空间',
        status: freeBytes >= config.minimumFreeBytes ? 'passed' : 'blocked',
        detail: `${(freeBytes / 1073741824).toFixed(1)} GB 可用`,
      });
    } catch (error) {
      checks.push({ id: 'disk_capacity', label: '磁盘可用空间', status: 'blocked', detail: truncate(error.message, 240) });
    }
    if (normalized.includes('mongodb')) {
      checks.push({
        id: 'mongodb_policy',
        label: 'MongoDB 发布策略',
        status: config.allowMongoDb ? 'passed' : 'blocked',
        detail: config.allowMongoDb ? '执行器允许维护窗口内更新' : 'DEPLOY_RUNNER_ALLOW_MONGODB 未启用',
      });
    }
    try {
      const runtime = await inspectRuntime();
      for (const component of normalized) {
        const current = runtime.components.find((item) => item.component === component);
        const safeRollback = Boolean(current?.reference && DIGEST_PATTERN.test(current.digest));
        checks.push({
          id: `rollback_point_${component}`,
          label: `${component} 回滚点`,
          status: safeRollback ? 'passed' : action === 'rollback' ? 'warning' : 'blocked',
          detail: safeRollback ? current.reference : '当前运行镜像没有可信 Digest',
        });
      }
    } catch (error) {
      checks.push({ id: 'runtime_inventory', label: '运行状态', status: 'blocked', detail: truncate(error.message, 240) });
    }
    return { ok: checks.every((check) => check.status !== 'blocked'), checks, checkedAt: now().toISOString() };
  }

  async function callback(job, { attempts = 8 } = {}) {
    const payload = {
      type: 'deployment',
      deploymentId: job.id,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      preflight: job.preflight,
      runtime: job.runtime,
      rollback: job.rollback,
      error: job.error,
    };
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetchImpl(config.callbackUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.callbackToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`callback returned HTTP ${response.status}`);
        clearTimeout(timer);
        return true;
      } catch (error) {
        lastError = error;
        clearTimeout(timer);
        if (attempt + 1 < attempts) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * (2 ** attempt), 15_000)));
        }
      }
    }
    job.callbackError = truncate(lastError?.message || 'callback failed', 300);
    await persistJobs();
    return false;
  }

  async function waitForSmoke(url) {
    let lastError = '';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) return;
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        clearTimeout(timer);
        lastError = error.message;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error(`smoke check failed for ${url}: ${lastError}`);
  }

  async function updateImages(updates) {
    const source = await readFile(config.envFile, 'utf8');
    const target = updateEnvSource(source, updates);
    const currentStat = await stat(config.envFile);
    await atomicWrite(config.envFile, target, currentStat.mode & 0o777);
  }

  async function acquireLock(job) {
    const handle = await open(lockPath, 'wx', 0o600).catch((error) => {
      if (error.code === 'EEXIST') throw new RunnerError(409, 'DEPLOYMENT_LOCKED', '另一个部署任务持有执行锁。');
      throw error;
    });
    await handle.writeFile(JSON.stringify({ pid: process.pid, deploymentId: job.id, acquiredAt: now().toISOString() }));
    await handle.close();
  }

  async function releaseLock() {
    await unlink(lockPath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async function applyJob(job) {
    await acquireLock(job);
    try {
      job.status = 'running';
      job.startedAt = now().toISOString();
      job.preflight = await preflight({ components: job.components, action: job.action });
      if (!job.preflight.ok) throw new Error('部署执行器预检未通过。');
      const before = await inspectRuntime();
      job.previousImages = Object.fromEntries(job.components.map((component) => {
        const runtime = before.components.find((item) => item.component === component);
        if (!runtime?.reference) throw new Error(`${component} 缺少不可变回滚点。`);
        return [COMPONENTS[component].envKey, runtime.reference];
      }));
      await persistJobs();
      await callback(job, { attempts: 2 });

      const updates = Object.fromEntries(job.artifacts.map((artifact) => [COMPONENTS[artifact.component].envKey, artifact.reference]));
      const services = job.components.map((component) => COMPONENTS[component].service);
      await updateImages(updates);
      const pull = await runDocker(composeArgs('pull', ...services));
      job.log = truncate(`${job.log || ''}\n${pull.stdout}\n${pull.stderr}`);
      const up = await runDocker(composeArgs(
        'up', '-d', '--no-build', '--force-recreate', '--wait', '--wait-timeout', String(config.waitTimeoutSeconds), ...services,
      ));
      job.log = truncate(`${job.log}\n${up.stdout}\n${up.stderr}`);
      for (const url of config.smokeUrls) await waitForSmoke(url);
      job.runtime = await inspectRuntime();
      const unhealthy = job.components.filter((component) => {
        const runtime = job.runtime.components.find((item) => item.component === component);
        return !runtime?.inSync || ['exited', 'dead', 'missing'].includes(runtime.state) || ['unhealthy'].includes(runtime.health);
      });
      if (unhealthy.length) throw new Error(`部署后状态不一致：${unhealthy.join(', ')}`);
      job.status = 'succeeded';
      job.completedAt = now().toISOString();
      await persistJobs();
      await callback(job);
    } catch (error) {
      job.error = truncate(error.message, 2000);
      try {
        if (job.previousImages && Object.keys(job.previousImages).length) {
          await updateImages(job.previousImages);
          const services = job.components.map((component) => COMPONENTS[component].service);
          await runDocker(composeArgs(
            'up', '-d', '--no-build', '--force-recreate', '--wait', '--wait-timeout', String(config.waitTimeoutSeconds), ...services,
          ));
          for (const url of config.smokeUrls) await waitForSmoke(url);
          job.runtime = await inspectRuntime();
          job.rollback = { succeeded: true, completedAt: now().toISOString(), references: job.previousImages };
          job.status = 'rolled_back';
        } else {
          job.status = 'failed';
        }
      } catch (rollbackError) {
        job.status = 'failed';
        job.rollback = { succeeded: false, error: truncate(rollbackError.message, 1000), completedAt: now().toISOString() };
      }
      job.completedAt = now().toISOString();
      await persistJobs();
      await callback(job);
    } finally {
      await releaseLock();
    }
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        const id = queue.shift();
        const job = jobs.get(id);
        if (job?.status === 'queued') await applyJob(job);
      }
    } finally {
      processing = false;
    }
  }

  async function submit(input) {
    if (!config.enabled) throw new RunnerError(403, 'DEPLOYMENT_DISABLED', '部署执行器未启用。');
    const id = String(input?.id || '').trim();
    if (!ID_PATTERN.test(id)) throw new RunnerError(400, 'INVALID_DEPLOYMENT_ID', '部署任务 ID 无效。');
    const components = normalizeComponents(input.components);
    if (components.includes('mongodb') && (!config.allowMongoDb || !input.maintenanceApproved)) {
      throw new RunnerError(409, 'MONGODB_MAINTENANCE_REQUIRED', 'MongoDB 更新需要启用维护策略并明确确认维护操作。');
    }
    const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : []).map((item) => validateRunnerArtifact(item, config));
    if (artifacts.length !== components.length || components.some((component) => !artifacts.some((item) => item.component === component))) {
      throw new RunnerError(400, 'INCOMPLETE_DEPLOYMENT_ARTIFACTS', '部署任务缺少组件产物。');
    }
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({
      action: input.action === 'rollback' ? 'rollback' : 'deploy',
      environment: String(input.environment || 'production'),
      buildId: String(input.buildId || ''),
      components,
      artifacts: artifacts.map((artifact) => ({ component: artifact.component, reference: artifact.reference })),
    })).digest('hex');
    const existing = jobs.get(id);
    if (existing) {
      if (existing.requestHash === requestHash) return existing;
      throw new RunnerError(409, 'DEPLOYMENT_ID_CONFLICT', '部署任务 ID 已被其他请求使用。');
    }
    const job = {
      id,
      action: input.action === 'rollback' ? 'rollback' : 'deploy',
      environment: String(input.environment || 'production').slice(0, 32),
      buildId: String(input.buildId || '').slice(0, 128),
      revision: String(input.revision || '').slice(0, 40),
      components,
      artifacts,
      requestedBy: String(input.requestedBy || 'system').slice(0, 100),
      status: 'queued',
      createdAt: now().toISOString(),
      startedAt: null,
      completedAt: null,
      preflight: null,
      runtime: null,
      rollback: null,
      error: '',
      callbackError: '',
      log: '',
      requestHash,
    };
    jobs.set(id, job);
    queue.push(id);
    await persistJobs();
    queueMicrotask(() => processQueue().catch((error) => console.error('deployment queue failed', error)));
    return job;
  }

  function publicJob(job) {
    if (!job) return null;
    const { log, previousImages, requestHash, ...value } = job;
    return { ...value, log: truncate(log, 4000) };
  }

  async function handle(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, { status: 'ok' });
      }
      if (!safeEqual(req.headers.authorization, `Bearer ${config.token}`)) {
        return sendJson(res, 401, { error: '部署执行器凭据无效。', code: 'UNAUTHORIZED' });
      }
      if (req.method === 'GET' && url.pathname === '/status') {
        const runtime = await inspectRuntime();
        return sendJson(res, 200, {
          enabled: config.enabled,
          busy: processing,
          ...runtime,
          jobs: [...jobs.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 20).map(publicJob),
        });
      }
      if (req.method === 'POST' && url.pathname === '/preflight') {
        return sendJson(res, 200, await preflight(await readRequestBody(req)));
      }
      if (req.method === 'POST' && url.pathname === '/deployments') {
        const job = await submit(await readRequestBody(req));
        return sendJson(res, 202, { id: job.id, status: job.status });
      }
      const match = url.pathname.match(/^\/deployments\/([A-Za-z0-9._:-]+)$/);
      if (req.method === 'GET' && match) {
        const job = jobs.get(match[1]);
        return job ? sendJson(res, 200, { job: publicJob(job) }) : sendJson(res, 404, { error: '部署任务不存在。', code: 'NOT_FOUND' });
      }
      return sendJson(res, 404, { error: '接口不存在。', code: 'NOT_FOUND' });
    } catch (error) {
      const status = error instanceof RunnerError ? error.status : 500;
      console.error(`[deployment-runner] ${error.code || 'INTERNAL_ERROR'}: ${truncate(error.message, 1000)}`);
      return sendJson(res, status, {
        error: error instanceof RunnerError ? error.message : '部署执行器内部错误。',
        code: error instanceof RunnerError ? error.code : 'INTERNAL_ERROR',
        details: error instanceof RunnerError ? error.details : null,
      });
    }
  }

  return {
    config,
    handle,
    initialize,
    inspectRuntime,
    preflight,
    submit,
    createServer() {
      return createServer(handle);
    },
  };
}

async function main() {
  const config = loadRunnerConfig();
  const runner = createDeploymentRunner({ config });
  const issues = runner.config.enabled ? [] : ['DEPLOY_RUNNER_ENABLED is false'];
  if (config.token.length < 32) issues.push('DEPLOY_RUNNER_TOKEN must contain at least 32 characters');
  if (config.callbackToken.length < 32) issues.push('DEPLOY_RUNNER_CALLBACK_TOKEN must contain at least 32 characters');
  if (!config.callbackUrl) issues.push('DEPLOY_RUNNER_CALLBACK_URL is required');
  if (!config.allowedImageRepository) issues.push('DEPLOY_RUNNER_ALLOWED_IMAGE_REPOSITORY is required');
  if (issues.length) throw new Error(issues.join('\n'));
  await runner.initialize();
  const server = runner.createServer();
  server.listen(config.port, config.host, () => {
    console.log(`部署执行器已启动：http://${config.host}:${config.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
