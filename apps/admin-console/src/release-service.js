const RELEASE_TARGETS = new Set(['platform', 'backup', 'core', 'exam', 'notification', 'campus', 'iot', 'mongodb', 'all']);

function shortRevision(value) {
  const revision = String(value || '');
  return revision ? revision.slice(0, 12) : '';
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

export class ReleaseOperationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createReleaseService({ config, fetchImpl = fetch } = {}) {
  const githubConfigured = Boolean(config.githubRepository && config.githubToken);
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
          'User-Agent': 'MY-Platform-Release-Center/1.0',
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

  async function getSummary() {
    let runs = [];
    let issue = '';
    if (githubConfigured) {
      try {
        const [owner, repository] = config.githubRepository.split('/');
        const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/runs?per_page=10`);
        runs = (data.workflow_runs || []).map(mapWorkflowRun);
      } catch (error) {
        issue = error.message;
      }
    }

    return {
      capabilities: {
        githubConfigured,
        canBuild: Boolean(githubConfigured && config.releaseActionsEnabled),
        canDeploy: Boolean(config.releaseActionsEnabled && config.deployHookUrl && config.deployHookToken),
        canRollback: Boolean(config.releaseActionsEnabled && config.deployHookUrl && config.deployHookToken),
        issue,
      },
      repository: config.githubRepository || null,
      workflow: config.githubWorkflow || null,
      ref: config.githubRef || null,
      revision: config.releaseRevision || null,
      deployedAt: config.releaseDeployedAt || null,
      components: componentImages,
      runs,
    };
  }

  async function dispatchBuild({ targets }) {
    if (!config.releaseActionsEnabled) {
      throw new ReleaseOperationError(403, 'RELEASE_ACTIONS_DISABLED', '生产发布操作未启用。');
    }
    const normalized = [...new Set((Array.isArray(targets) ? targets : [targets])
      .map((target) => String(target || '').trim())
      .filter(Boolean))];
    if (!normalized.length || normalized.some((target) => !RELEASE_TARGETS.has(target))) {
      throw new ReleaseOperationError(400, 'INVALID_RELEASE_TARGET', '发布目标无效。');
    }
    const [owner, repository] = config.githubRepository.split('/');
    await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: config.githubRef,
        inputs: { targets: normalized.join(','), push_sha_tags: 'true' },
      }),
    });
    return { accepted: true, targets: normalized, ref: config.githubRef };
  }

  async function dispatchDeployment({ action, component, image, requestedBy }) {
    if (!config.releaseActionsEnabled || !config.deployHookUrl || !config.deployHookToken) {
      throw new ReleaseOperationError(403, 'DEPLOY_ACTIONS_DISABLED', '服务器部署执行器未配置，操作保持只读。');
    }
    if (!['deploy', 'rollback'].includes(action) || !RELEASE_TARGETS.has(component) || component === 'all') {
      throw new ReleaseOperationError(400, 'INVALID_DEPLOYMENT_REQUEST', '部署请求无效。');
    }
    const imageValue = String(image || '').trim();
    if (!imageValue || imageValue.length > 512 || /[\s;&|`$<>]/.test(imageValue)) {
      throw new ReleaseOperationError(400, 'INVALID_IMAGE_REFERENCE', '镜像引用无效。');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(new URL('/deployments', config.deployHookUrl), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.deployHookToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, component, image: imageValue, requestedBy }),
      });
      if (!response.ok) {
        throw new ReleaseOperationError(502, 'DEPLOY_HOOK_FAILED', `部署执行器返回 HTTP ${response.status}。`);
      }
      return response.json().catch(() => ({ accepted: true }));
    } catch (error) {
      if (error instanceof ReleaseOperationError) throw error;
      throw new ReleaseOperationError(
        error?.name === 'AbortError' ? 504 : 502,
        error?.name === 'AbortError' ? 'DEPLOY_HOOK_TIMEOUT' : 'DEPLOY_HOOK_UNAVAILABLE',
        error?.name === 'AbortError' ? '部署执行器请求超时。' : '部署执行器暂不可用。',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return { dispatchBuild, dispatchDeployment, getSummary };
}
