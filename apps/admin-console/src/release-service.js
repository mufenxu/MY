import crypto from 'node:crypto';
import { createMemoryReleaseStore } from './release-store.js';

export const RELEASE_TARGETS = new Set(['platform', 'backup', 'core', 'exam', 'notification', 'campus', 'iot', 'mongodb', 'all']);
const DEPLOYABLE_TARGETS = [...RELEASE_TARGETS].filter((target) => target !== 'all');
const BUILD_CALLBACK_STATES = new Set(['queued', 'building', 'succeeded', 'failed', 'cancelled']);
const DEPLOYMENT_CALLBACK_STATES = new Set(['queued', 'running', 'succeeded', 'failed', 'rolled_back']);
const ACTIVE_BUILD_STATES = new Set(['queued', 'building']);
const ACTIVE_DEPLOYMENT_STATES = new Set(['queued', 'running']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/i;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const COMPONENT_SERVICE_IDS = {
  platform: 'platform-api',
  backup: 'backup-runner',
  core: 'core-api',
  exam: 'exam-api',
  notification: 'notification-service',
  campus: 'campus-service',
  iot: 'iot-service',
  mongodb: 'mongodb',
};

function shortRevision(value) {
  const revision = String(value || '');
  return revision ? revision.slice(0, 12) : '';
}

function stringValue(value, maximum = 512) {
  return String(value || '').trim().slice(0, maximum);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTargets(targets, { allowAll = true } = {}) {
  const values = [...new Set((Array.isArray(targets) ? targets : [targets])
    .map((target) => String(target || '').trim().toLowerCase())
    .filter(Boolean))];
  if (!values.length || values.some((target) => !RELEASE_TARGETS.has(target) || (!allowAll && target === 'all'))) {
    throw new ReleaseOperationError(400, 'INVALID_RELEASE_TARGET', '发布目标无效。');
  }
  return values.includes('all') ? [...DEPLOYABLE_TARGETS] : values;
}

function mapWorkflowRun(run) {
  return {
    id: String(run.id),
    name: run.name || run.display_title || '构建任务',
    event: run.event || '',
    status: run.status || 'unknown',
    conclusion: run.conclusion || null,
    branch: run.head_branch || '',
    revision: shortRevision(run.head_sha),
    createdAt: run.created_at || null,
    updatedAt: run.updated_at || null,
    url: run.html_url || null,
    actor: run.actor?.login || null,
  };
}

function stateLabel(status) {
  return {
    queued: '已排队',
    building: '构建中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
    running: '执行中',
    rolled_back: '已自动回滚',
  }[status] || status;
}

function releaseEvent(status, detail = '') {
  return { status, detail: stringValue(detail, 300), occurredAt: nowIso() };
}

function artifactReferences(artifacts) {
  return (artifacts || []).map((artifact) => `${artifact.component}:${artifact.reference}`).sort();
}

function validateArtifact(value, config) {
  const component = stringValue(value?.component, 32).toLowerCase();
  const image = stringValue(value?.image);
  const shaTag = stringValue(value?.shaTag);
  const digest = stringValue(value?.digest, 80).toLowerCase();
  const reference = stringValue(value?.reference);
  if (!DEPLOYABLE_TARGETS.includes(component) || !DIGEST_PATTERN.test(digest)) {
    throw new ReleaseOperationError(400, 'INVALID_RELEASE_ARTIFACT', '构建产物信息无效。');
  }
  const repository = String(config.releaseAllowedImageRepository || '').replace(/[:/@]+$/, '');
  const expectedReference = `${repository}@${digest}`;
  if (!repository || reference !== expectedReference || !image.startsWith(`${repository}:`) || !shaTag.startsWith(`${repository}:`)) {
    throw new ReleaseOperationError(400, 'UNTRUSTED_RELEASE_ARTIFACT', '构建产物不属于允许的镜像仓库。');
  }
  return { component, image, shaTag, digest, reference };
}

function mapRuntimeComponents(componentImages, runtimeStatus) {
  const runtimeComponents = new Map((runtimeStatus?.components || []).map((item) => [item.component, item]));
  return componentImages.map((component) => {
    const runtime = runtimeComponents.get(component.id) || null;
    const observed = typeof runtime?.observed === 'boolean'
      ? runtime.observed
      : Boolean(runtime && runtime.state !== 'missing');
    return {
      ...component,
      serviceId: COMPONENT_SERVICE_IDS[component.id],
      desiredImage: runtime?.configuredImage || component.image,
      runtime,
      observed,
      inSync: runtime?.inSync ?? null,
    };
  });
}

export class ReleaseOperationError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ReleaseOperationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createReleaseService({
  config,
  fetchImpl = fetch,
  store = createMemoryReleaseStore(),
  backupManager = null,
  operationsStore = null,
  notifier = null,
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const githubConfigured = Boolean(config.githubRepository && config.githubToken);
  const deployRunnerConfigured = Boolean(config.deployHookUrl && config.deployHookToken);
  const callbackConfigured = Boolean(config.releaseCallbackToken);
  const artifactRepositoryConfigured = Boolean(config.releaseAllowedImageRepository);
  const componentImages = Object.entries(config.releaseImages || {}).map(([id, image]) => ({
    id,
    image: String(image || ''),
    configured: Boolean(image),
  }));

  async function githubRequest(resource, options = {}) {
    if (!githubConfigured) {
      throw new ReleaseOperationError(503, 'GITHUB_NOT_CONFIGURED', 'GitHub 发布集成尚未配置。');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(`https://api.github.com${resource}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'MY-Platform-Release-Center/2.0',
          ...options.headers,
        },
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new ReleaseOperationError(
          response.status >= 500 ? 502 : response.status,
          'GITHUB_REQUEST_FAILED',
          detail.message || `GitHub 请求失败（HTTP ${response.status}）。`,
        );
      }
      if (response.status === 204) return null;
      return response.json();
    } catch (error) {
      if (error instanceof ReleaseOperationError) throw error;
      throw new ReleaseOperationError(
        error?.name === 'AbortError' ? 504 : 502,
        error?.name === 'AbortError' ? 'GITHUB_TIMEOUT' : 'GITHUB_UNAVAILABLE',
        error?.name === 'AbortError' ? 'GitHub 请求超时。' : 'GitHub 发布集成暂不可用。',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function runnerRequest(resource, { method = 'GET', body, timeoutMs = 10000 } = {}) {
    if (!deployRunnerConfigured) {
      throw new ReleaseOperationError(503, 'DEPLOY_RUNNER_NOT_CONFIGURED', '服务器部署执行器未配置。');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(resource, config.deployHookUrl), {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.deployHookToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ReleaseOperationError(
          response.status >= 500 ? 502 : response.status,
          data.code || 'DEPLOY_RUNNER_FAILED',
          data.error || `部署执行器返回 HTTP ${response.status}。`,
          data.details || null,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof ReleaseOperationError) throw error;
      throw new ReleaseOperationError(
        error?.name === 'AbortError' ? 504 : 502,
        error?.name === 'AbortError' ? 'DEPLOY_RUNNER_TIMEOUT' : 'DEPLOY_RUNNER_UNAVAILABLE',
        error?.name === 'AbortError' ? '部署执行器请求超时。' : '部署执行器暂不可用。',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadGitHubRuns() {
    if (!githubConfigured) return { runs: [], issue: '' };
    try {
      const [owner, repository] = config.githubRepository.split('/');
      const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/runs?per_page=10`);
      return { runs: (data.workflow_runs || []).map(mapWorkflowRun), issue: '' };
    } catch (error) {
      return { runs: [], issue: error.message };
    }
  }

  async function loadRuntimeStatus() {
    if (!deployRunnerConfigured) return { status: null, issue: '' };
    try {
      return { status: await runnerRequest('/status'), issue: '' };
    } catch (error) {
      return { status: null, issue: error.message };
    }
  }

  function capabilityReasons(hasRollbackCandidate) {
    const build = [];
    const deploy = [];
    if (!config.releaseActionsEnabled) {
      build.push('生产发布总开关未启用');
      deploy.push('生产发布总开关未启用');
    }
    if (!githubConfigured) build.push('GitHub Token 或仓库未配置');
    if (!callbackConfigured) {
      build.push('发布回调令牌未配置');
      deploy.push('发布回调令牌未配置');
    }
    if (!artifactRepositoryConfigured) {
      build.push('允许的镜像仓库未配置');
      deploy.push('允许的镜像仓库未配置');
    }
    if (!deployRunnerConfigured) deploy.push('内网部署执行器未配置');
    return { build, deploy, rollback: [...deploy, ...(!hasRollbackCandidate ? ['暂无成功部署可供回滚'] : [])] };
  }

  async function getSummary() {
    const [{ runs, issue: githubIssue }, { status: runtimeStatus, issue: runtimeIssue }, builds, storedDeployments] = await Promise.all([
      loadGitHubRuns(),
      loadRuntimeStatus(),
      store.listBuilds({ limit: 20 }),
      store.listDeployments({ limit: 20 }),
    ]);
    const runnerJobs = new Map((runtimeStatus?.jobs || []).map((job) => [job.id, job]));
    const deployments = await Promise.all(storedDeployments.map(async (deployment) => {
      const runnerJob = runnerJobs.get(deployment.id);
      if (!runnerJob || runnerJob.status === deployment.status || ['succeeded', 'failed', 'rolled_back'].includes(deployment.status)) return deployment;
      return store.updateDeployment(deployment.id, {
        status: runnerJob.status,
        startedAt: runnerJob.startedAt || deployment.startedAt,
        completedAt: runnerJob.completedAt || deployment.completedAt,
        preflight: runnerJob.preflight || deployment.preflight,
        runtime: runnerJob.runtime || deployment.runtime,
        rollback: runnerJob.rollback || deployment.rollback,
        error: runnerJob.error || deployment.error,
      }, releaseEvent(runnerJob.status, '从部署执行器状态自动对账'));
    }));
    const hasRollbackCandidate = deployments.some((item) => item.status === 'succeeded');
    const reasons = capabilityReasons(hasRollbackCandidate);
    if (deployRunnerConfigured && runtimeIssue) {
      reasons.deploy.push(runtimeIssue);
      reasons.rollback.push(runtimeIssue);
    }
    const completedBuilds = builds.filter((item) => ['succeeded', 'failed', 'cancelled'].includes(item.status));
    const successfulBuilds = completedBuilds.filter((item) => item.status === 'succeeded').length;
    const components = mapRuntimeComponents(componentImages, runtimeStatus);
    const driftCount = components.filter((item) => item.inSync === false).length;
    const latestBuild = builds.find((item) => item.status === 'succeeded' && item.artifacts?.length);
    const runtimeDigests = new Map(components.map((item) => [item.id, item.runtime?.digest || '']));
    const availableUpdateComponents = (latestBuild?.artifacts || [])
      .filter((artifact) => runtimeDigests.get(artifact.component) && runtimeDigests.get(artifact.component) !== artifact.digest)
      .map((artifact) => artifact.component);
    return {
      capabilities: {
        githubConfigured,
        deployRunnerConfigured,
        deployRunnerHealthy: Boolean(runtimeStatus),
        callbackConfigured,
        canBuild: reasons.build.length === 0,
        canDeploy: reasons.deploy.length === 0,
        canRollback: reasons.rollback.length === 0,
        reasons,
        issue: githubIssue || runtimeIssue,
      },
      environment: config.releaseEnvironment || 'production',
      repository: config.githubRepository || null,
      workflow: config.githubWorkflow || null,
      ref: config.githubRef || null,
      revision: config.releaseRevision || null,
      deployedAt: config.releaseDeployedAt || null,
      components,
      runtime: runtimeStatus,
      builds,
      deployments,
      runs,
      metrics: {
        configuredComponents: components.filter((item) => item.configured).length,
        observedComponents: components.filter((item) => item.observed).length,
        driftCount,
        availableUpdates: availableUpdateComponents.length,
        availableUpdateComponents,
        latestBuildId: latestBuild?.id || null,
        latestRevision: latestBuild?.revision || null,
        successfulBuilds,
        completedBuilds: completedBuilds.length,
        activeOperations: builds.filter((item) => ACTIVE_BUILD_STATES.has(item.status)).length
          + deployments.filter((item) => ACTIVE_DEPLOYMENT_STATES.has(item.status)).length,
      },
    };
  }

  async function dispatchBuild({ targets, requestedBy = 'system' }) {
    if (!config.releaseActionsEnabled) {
      throw new ReleaseOperationError(403, 'RELEASE_ACTIONS_DISABLED', '生产发布操作未启用。');
    }
    const reasons = capabilityReasons(true).build;
    if (reasons.length) {
      throw new ReleaseOperationError(403, 'RELEASE_BUILD_DISABLED', reasons.join('；'));
    }
    const normalized = normalizeTargets(targets);
    const id = idFactory();
    const build = await store.createBuild({
      id,
      environment: config.releaseEnvironment || 'production',
      source: 'manual',
      status: 'queued',
      repository: config.githubRepository,
      workflow: config.githubWorkflow,
      ref: config.githubRef,
      targets: normalized,
      requestedBy,
      timeline: [releaseEvent('queued', '管理员已提交构建任务')],
    });
    try {
      const [owner, repository] = config.githubRepository.split('/');
      await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/dispatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: config.githubRef,
          inputs: {
            targets: normalized.join(','),
            push_sha_tags: 'true',
            release_id: id,
          },
        }),
      });
      return build;
    } catch (error) {
      await store.updateBuild(id, { status: 'failed', error: error.message, completedAt: nowIso() }, releaseEvent('failed', error.message));
      throw error;
    }
  }

  async function recordSystemAudit(action, targetId, outcome, details) {
    await operationsStore?.addAudit?.({
      actor: 'release-system',
      action,
      outcome,
      targetType: 'release',
      targetId,
      details,
    }).catch(() => {});
  }

  async function acceptBuildCallback(payload) {
    const id = stringValue(payload.releaseId, 128);
    const status = stringValue(payload.status, 32).toLowerCase();
    if (!ID_PATTERN.test(id) || !BUILD_CALLBACK_STATES.has(status)) {
      throw new ReleaseOperationError(400, 'INVALID_RELEASE_CALLBACK', '构建回调数据无效。');
    }
    const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts.map((item) => validateArtifact(item, config)) : [];
    let build = await store.getBuild(id);
    const callbackTargets = Array.isArray(payload.targets) ? payload.targets.filter(Boolean) : [];
    const rawTargets = callbackTargets.length ? callbackTargets : build?.targets?.length ? build.targets : artifacts.map((item) => item.component);
    const targets = rawTargets.length ? normalizeTargets(rawTargets, { allowAll: false }) : [];
    const revision = stringValue(payload.revision, 64).toLowerCase();
    if (status === 'succeeded') {
      if (!REVISION_PATTERN.test(revision) || artifacts.length !== targets.length || targets.some((target) => !artifacts.some((item) => item.component === target))) {
        throw new ReleaseOperationError(400, 'INCOMPLETE_RELEASE_ARTIFACTS', '成功构建必须包含所有目标的不可变镜像产物。');
      }
    }
    const timestamp = nowIso();
    const incomingRunId = stringValue(payload.runId, 64);
    const incomingAttempt = Number(payload.runAttempt) || 1;
    if (build?.workflowRun?.id && incomingRunId && build.workflowRun.id !== incomingRunId) {
      throw new ReleaseOperationError(409, 'RELEASE_CALLBACK_CONFLICT', '构建回调与现有 GitHub 运行不匹配。');
    }
    if (build?.status === 'succeeded') {
      const identical = status === 'succeeded'
        && build.revision === revision
        && JSON.stringify(artifactReferences(build.artifacts)) === JSON.stringify(artifactReferences(artifacts));
      if (identical) return build;
      throw new ReleaseOperationError(409, 'RELEASE_ALREADY_FINALIZED', '成功构建记录不能被后续回调覆盖。');
    }
    if (['failed', 'cancelled'].includes(build?.status) && !['failed', 'cancelled'].includes(status)) {
      const previousAttempt = Number(build.workflowRun?.attempt) || 1;
      if (incomingAttempt <= previousAttempt) {
        throw new ReleaseOperationError(409, 'RELEASE_CALLBACK_OUT_OF_ORDER', '旧的构建回调不能恢复已经终止的构建。');
      }
    }
    if (build?.status === 'building' && status === 'queued') {
      throw new ReleaseOperationError(409, 'RELEASE_CALLBACK_OUT_OF_ORDER', '构建状态不能回退到排队。');
    }
    if (!build) {
      build = await store.createBuild({
        id,
        environment: config.releaseEnvironment || 'production',
        source: payload.event === 'workflow_dispatch' ? 'manual' : 'push',
        status,
        repository: stringValue(payload.repository, 200) || config.githubRepository,
        workflow: stringValue(payload.workflow, 200) || config.githubWorkflow,
        ref: stringValue(payload.ref, 200),
        requestedBy: stringValue(payload.actor, 100) || 'github-actions',
        createdAt: payload.createdAt || timestamp,
      });
    }
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(status);
    const patch = {
      status,
      targets,
      artifacts,
      revision,
      error: stringValue(payload.error, 1000),
      startedAt: build.startedAt || payload.startedAt || (status === 'building' ? timestamp : null),
      completedAt: terminal ? (payload.completedAt || timestamp) : null,
      workflowRun: {
        id: incomingRunId,
        attempt: incomingAttempt,
        url: stringValue(payload.url),
        actor: stringValue(payload.actor, 100),
        event: stringValue(payload.event, 50),
      },
    };
    const updated = await store.updateBuild(id, patch, releaseEvent(status, payload.error || `GitHub Actions ${stateLabel(status)}`));
    if (terminal) {
      await recordSystemAudit(`release.build_${status}`, id, status === 'succeeded' ? 'success' : 'failure', { revision, targets });
      await notifier?.sendRelease?.({ kind: 'build', status, build: updated }).catch(() => {});
    }
    return updated;
  }

  async function acceptDeploymentCallback(payload) {
    const id = stringValue(payload.deploymentId, 128);
    const status = stringValue(payload.status, 32).toLowerCase();
    if (!ID_PATTERN.test(id) || !DEPLOYMENT_CALLBACK_STATES.has(status)) {
      throw new ReleaseOperationError(400, 'INVALID_DEPLOYMENT_CALLBACK', '部署回调数据无效。');
    }
    const deployment = await store.getDeployment(id);
    if (!deployment) throw new ReleaseOperationError(404, 'DEPLOYMENT_NOT_FOUND', '部署记录不存在。');
    if (['succeeded', 'failed', 'rolled_back'].includes(deployment.status)) {
      if (deployment.status === status) return deployment;
      throw new ReleaseOperationError(409, 'DEPLOYMENT_ALREADY_FINALIZED', '部署终态不能被后续回调覆盖。');
    }
    if (deployment.status === 'running' && status === 'queued') {
      throw new ReleaseOperationError(409, 'DEPLOYMENT_CALLBACK_OUT_OF_ORDER', '部署状态不能回退到排队。');
    }
    const timestamp = nowIso();
    const terminal = ['succeeded', 'failed', 'rolled_back'].includes(status);
    const updated = await store.updateDeployment(id, {
      status,
      startedAt: deployment.startedAt || payload.startedAt || (status === 'running' ? timestamp : null),
      completedAt: terminal ? (payload.completedAt || timestamp) : null,
      runtime: payload.runtime && typeof payload.runtime === 'object' ? payload.runtime : deployment.runtime,
      preflight: payload.preflight && typeof payload.preflight === 'object' ? payload.preflight : deployment.preflight,
      rollback: payload.rollback && typeof payload.rollback === 'object' ? payload.rollback : deployment.rollback,
      error: stringValue(payload.error, 2000),
    }, releaseEvent(status, payload.error || `部署执行器${stateLabel(status)}`));
    if (terminal) {
      await recordSystemAudit(`release.${deployment.action}_${status}`, id, status === 'succeeded' ? 'success' : 'failure', {
        components: deployment.components,
        buildId: deployment.buildId,
      });
      await notifier?.sendRelease?.({ kind: deployment.action, status, deployment: updated }).catch(() => {});
    }
    return updated;
  }

  async function acceptCallback(payload) {
    if (payload?.type === 'build') return acceptBuildCallback(payload);
    if (payload?.type === 'deployment') return acceptDeploymentCallback(payload);
    throw new ReleaseOperationError(400, 'INVALID_RELEASE_CALLBACK', '未知的发布回调类型。');
  }

  async function getPreflight({ components, action = 'deploy', maintenanceApproved = false } = {}) {
    const normalized = normalizeTargets(components, { allowAll: false });
    const checks = [];
    if (deployRunnerConfigured) {
      const runner = await runnerRequest('/preflight', {
        method: 'POST',
        body: { components: normalized, action },
        timeoutMs: 15000,
      });
      checks.push(...(Array.isArray(runner.checks) ? runner.checks : []));
    } else {
      checks.push({ id: 'deploy_runner', label: '部署执行器', status: 'blocked', detail: '未配置' });
    }

    if (action !== 'rollback') {
      const incidents = await operationsStore?.listIncidents?.({ status: 'open,acknowledged', limit: 100 }).catch(() => []) || [];
      const critical = incidents.filter((incident) => incident.severity === 'critical');
      checks.push({
        id: 'critical_incidents',
        label: '严重事件',
        status: critical.length ? 'blocked' : 'passed',
        detail: critical.length ? `存在 ${critical.length} 个未关闭的严重事件` : '无未关闭严重事件',
      });
    }

    if (normalized.includes('mongodb')) {
      const backupStatus = await backupManager?.getStatus?.().catch(() => null);
      const latestBackup = (backupStatus?.backups || []).find((backup) => backup.restorable && backup.createdAt);
      const ageHours = latestBackup ? (Date.now() - Date.parse(latestBackup.createdAt)) / 3600000 : Number.POSITIVE_INFINITY;
      const backupReady = Number.isFinite(ageHours) && ageHours <= (config.backupRpoHours || 26);
      checks.push({
        id: 'mongodb_backup',
        label: 'MongoDB 最近备份',
        status: backupReady ? 'passed' : 'blocked',
        detail: backupReady ? `${ageHours.toFixed(1)} 小时前` : '没有满足 RPO 的可恢复备份',
      });
      const settings = await operationsStore?.getSettings?.({ maintenanceWindows: [] }).catch(() => ({ maintenanceWindows: [] })) || { maintenanceWindows: [] };
      const now = Date.now();
      const maintenanceActive = (settings.maintenanceWindows || []).some((window) => (
        ['all', 'mongodb'].includes(window.serviceId)
        && Date.parse(window.startsAt) <= now
        && Date.parse(window.endsAt) > now
      ));
      checks.push({
        id: 'mongodb_maintenance',
        label: 'MongoDB 维护窗口',
        status: maintenanceActive && maintenanceApproved ? 'passed' : 'blocked',
        detail: !maintenanceActive ? '当前没有生效的 MongoDB 维护窗口' : maintenanceApproved ? '已确认维护操作' : '需要管理员确认维护操作',
      });
    }
    return { ok: checks.every((check) => check.status !== 'blocked'), checks, checkedAt: nowIso() };
  }

  async function previousArtifacts(components) {
    const deployments = await store.listDeployments({ status: 'succeeded', limit: 100 });
    return components.map((component) => {
      const deployment = deployments.find((item) => item.artifacts.some((artifact) => artifact.component === component));
      return deployment?.artifacts.find((artifact) => artifact.component === component) || null;
    }).filter(Boolean);
  }

  async function dispatchDeployment({
    action,
    buildId,
    sourceDeploymentId,
    components,
    requestedBy = 'system',
    maintenanceApproved = false,
  }) {
    if (!['deploy', 'rollback'].includes(action)) {
      throw new ReleaseOperationError(400, 'INVALID_DEPLOYMENT_REQUEST', '部署请求无效。');
    }
    const reasons = capabilityReasons(true).deploy;
    if (reasons.length) throw new ReleaseOperationError(403, 'DEPLOY_ACTIONS_DISABLED', reasons.join('；'));
    const normalized = normalizeTargets(components, { allowAll: false });
    let sourceBuild = null;
    let sourceDeployment = null;
    let artifacts = [];
    if (action === 'deploy') {
      sourceBuild = await store.getBuild(buildId);
      if (!sourceBuild || sourceBuild.status !== 'succeeded') {
        throw new ReleaseOperationError(409, 'BUILD_NOT_DEPLOYABLE', '只能部署已经成功完成的构建。');
      }
      artifacts = normalized.map((component) => sourceBuild.artifacts.find((artifact) => artifact.component === component)).filter(Boolean);
    } else {
      sourceDeployment = await store.getDeployment(sourceDeploymentId);
      if (!sourceDeployment || sourceDeployment.status !== 'succeeded') {
        throw new ReleaseOperationError(409, 'ROLLBACK_TARGET_INVALID', '只能选择历史成功部署作为回滚目标。');
      }
      artifacts = normalized.map((component) => sourceDeployment.artifacts.find((artifact) => artifact.component === component)).filter(Boolean);
      sourceBuild = sourceDeployment.buildId ? await store.getBuild(sourceDeployment.buildId) : null;
    }
    if (artifacts.length !== normalized.length) {
      throw new ReleaseOperationError(409, 'RELEASE_ARTIFACT_MISSING', '所选版本不包含全部目标组件。');
    }
    artifacts = artifacts.map((artifact) => validateArtifact(artifact, config));
    const preflight = await getPreflight({ components: normalized, action, maintenanceApproved });
    if (!preflight.ok) {
      throw new ReleaseOperationError(409, 'RELEASE_PREFLIGHT_FAILED', '发布前检查未通过。', preflight);
    }
    const id = idFactory();
    const deployment = await store.createDeployment({
      id,
      environment: config.releaseEnvironment || 'production',
      action,
      status: 'queued',
      buildId: sourceBuild?.id || null,
      sourceDeploymentId: sourceDeployment?.id || null,
      components: normalized,
      artifacts,
      previousArtifacts: await previousArtifacts(normalized),
      requestedBy,
      preflight,
      timeline: [releaseEvent('queued', action === 'rollback' ? '管理员已提交回滚' : '管理员已提交部署')],
    });
    try {
      const response = await runnerRequest('/deployments', {
        method: 'POST',
        body: {
          id,
          action,
          environment: deployment.environment,
          components: normalized,
          artifacts,
          previousArtifacts: deployment.previousArtifacts,
          buildId: deployment.buildId,
          revision: sourceBuild?.revision || '',
          requestedBy,
          maintenanceApproved: Boolean(maintenanceApproved),
        },
        timeoutMs: 15000,
      });
      return await store.updateDeployment(id, {
        status: response.status || 'queued',
        runtime: response.runtime || null,
      }, releaseEvent(response.status || 'queued', '部署执行器已接受任务'));
    } catch (error) {
      if (error instanceof ReleaseOperationError && error.code === 'DEPLOY_RUNNER_TIMEOUT') {
        try {
          const recovered = await runnerRequest(`/deployments/${encodeURIComponent(id)}`, { timeoutMs: 8000 });
          if (recovered.job) {
            return await store.updateDeployment(id, {
              status: recovered.job.status || 'queued',
              runtime: recovered.job.runtime || null,
            }, releaseEvent(recovered.job.status || 'queued', '提交超时后已从执行器恢复任务'));
          }
        } catch {
          // Preserve the original timeout when the recovery probe cannot find the job.
        }
      }
      await store.updateDeployment(id, { status: 'failed', error: error.message, completedAt: nowIso() }, releaseEvent('failed', error.message));
      throw error;
    }
  }

  return {
    acceptCallback,
    dispatchBuild,
    dispatchDeployment,
    getPreflight,
    getSummary,
  };
}
