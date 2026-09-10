import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { createMemoryReleaseStore } from './release-store.js';

export const RELEASE_TARGETS = new Set(['platform', 'backup', 'core', 'exam', 'notification', 'campus', 'iot', 'mongodb', 'all']);
const BUILD_TARGETS = [...RELEASE_TARGETS].filter((target) => target !== 'all');
const BUILD_CALLBACK_STATES = new Set(['queued', 'building', 'succeeded', 'failed', 'cancelled']);
const ACTIVE_BUILD_STATES = new Set(['queued', 'building']);
const TERMINAL_BUILD_STATES = new Set(['succeeded', 'failed', 'cancelled']);
const RELEASE_ARTIFACTS_FILE = 'release-artifacts.tsv';
const WORKFLOW_DISPATCH_MATCH_BEFORE_MS = 30 * 1000;
const WORKFLOW_DISPATCH_MATCH_AFTER_MS = 10 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/i;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const ANDROID_TAG_PATTERN = /^android-v(\d+)\.(\d+)\.(\d+)$/;
const ANDROID_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function shortRevision(value) {
  const revision = String(value || '');
  return revision ? revision.slice(0, 12) : '';
}

function workflowConclusionStatus(run) {
  const status = String(run?.status || '').toLowerCase();
  const conclusion = String(run?.conclusion || '').toLowerCase();
  if (status !== 'completed') return status === 'queued' ? 'queued' : 'building';
  if (conclusion === 'success') return 'succeeded';
  if (['cancelled', 'canceled'].includes(conclusion)) return 'cancelled';
  return 'failed';
}

function validTimestamp(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortTimestamp(value) {
  return validTimestamp(value) || 0;
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
  return values.includes('all') ? [...BUILD_TARGETS] : values;
}

function mapWorkflowRun(run) {
  return {
    id: String(run.id),
    name: run.name || run.display_title || '构建任务',
    event: run.event || '',
    status: run.status || 'unknown',
    conclusion: run.conclusion || null,
    branch: run.head_branch || '',
    headSha: run.head_sha || '',
    revision: shortRevision(run.head_sha),
    createdAt: run.created_at || null,
    startedAt: run.run_started_at || run.created_at || null,
    updatedAt: run.updated_at || null,
    completedAt: run.conclusion ? (run.updated_at || null) : null,
    url: run.html_url || null,
    actor: run.actor?.login || null,
  };
}

function mapObservedBuild(run, config) {
  return {
    id: `github-${run.id}`,
    environment: config.releaseEnvironment || 'production',
    source: 'github',
    observedOnly: true,
    status: workflowConclusionStatus(run),
    repository: config.githubRepository,
    workflow: config.githubWorkflow,
    ref: run.branch || '',
    revision: run.headSha || run.revision || '',
    targets: [],
    artifacts: [],
    requestedBy: run.actor || 'github-actions',
    workflowRun: {
      id: String(run.id),
      attempt: 1,
      url: run.url || '',
      actor: run.actor || '',
      event: run.event || '',
    },
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    timeline: [],
  };
}

function stateLabel(status) {
  return {
    queued: '已排队',
    building: '构建中',
    succeeded: '成功',
    failed: '失败',
    cancelled: '已取消',
  }[status] || status;
}

function releaseEvent(status, detail = '') {
  return { status, detail: stringValue(detail, 300), occurredAt: nowIso() };
}

function parseAndroidVersion(versionName) {
  const match = ANDROID_VERSION_PATTERN.exec(String(versionName || '').trim());
  if (!match) {
    throw new ReleaseOperationError(400, 'INVALID_ANDROID_VERSION', 'Android 版本号必须是 x.y.z 格式。');
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 999 || patch > 999) {
    throw new ReleaseOperationError(400, 'INVALID_ANDROID_VERSION', 'Android 版本号的次版本和补丁号不能超过 999。');
  }
  return {
    versionName: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
    versionCode: major * 1_000_000 + minor * 1_000 + patch,
  };
}

function androidVersionFromTag(tagName) {
  const match = ANDROID_TAG_PATTERN.exec(String(tagName || ''));
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  return {
    versionName: `${major}.${minor}.${patch}`,
    versionCode: major * 1_000_000 + minor * 1_000 + patch,
  };
}

function androidAssetSha256(asset) {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(String(asset?.digest || '').trim());
  return match ? match[1].toLowerCase() : null;
}

function mapAndroidDraft(release) {
  const version = androidVersionFromTag(release.tag_name);
  if (!version) return null;
  return {
    id: String(release.id),
    versionName: version.versionName,
    versionCode: version.versionCode,
    tag: String(release.tag_name),
    notes: String(release.body || '').trim(),
    createdAt: release.created_at || null,
    updatedAt: release.updated_at || null,
    targetCommitish: release.target_commitish || null,
  };
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
  if (!BUILD_TARGETS.includes(component) || !DIGEST_PATTERN.test(digest)) {
    throw new ReleaseOperationError(400, 'INVALID_RELEASE_ARTIFACT', '构建产物信息无效。');
  }
  const repository = String(config.releaseAllowedImageRepository || '').replace(/[:/@]+$/, '');
  const expectedReference = `${repository}@${digest}`;
  if (!repository || reference !== expectedReference || !image.startsWith(`${repository}:`) || !shaTag.startsWith(`${repository}:`)) {
    throw new ReleaseOperationError(400, 'UNTRUSTED_RELEASE_ARTIFACT', '构建产物不属于允许的镜像仓库。');
  }
  return { component, image, shaTag, digest, reference };
}

function parseReleaseArtifactsTsv(source, config) {
  return String(source || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [component, image, digest, reference, shaTag] = line.split('\t');
      return validateArtifact({ component, image, digest, reference, shaTag }, config);
    });
}

function extractZipTextEntry(buffer, filename) {
  const archive = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let endOfCentralDirectory = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65557); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) return '';
  const entries = archive.readUInt16LE(endOfCentralDirectory + 10);
  let cursor = archive.readUInt32LE(endOfCentralDirectory + 16);
  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) return '';
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const entryName = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const matches = entryName === filename || entryName.endsWith(`/${filename}`);
    if (matches) {
      if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) return '';
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed.toString('utf8');
      if (method === 8) return inflateRawSync(compressed).toString('utf8');
      return '';
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return '';
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
  operationsStore = null,
  notifier = null,
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const githubConfigured = Boolean(config.githubRepository && config.githubToken);
  let androidReleaseCache = null;
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

  async function githubRequestBuffer(resource, options = {}) {
    if (!githubConfigured) {
      throw new ReleaseOperationError(503, 'GITHUB_NOT_CONFIGURED', 'GitHub 发布集成尚未配置。');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const url = String(resource).startsWith('http') ? String(resource) : `https://api.github.com${resource}`;
      const response = await fetchImpl(url, {
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
      return Buffer.from(await response.arrayBuffer());
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

  async function loadGitHubRuns() {
    if (!githubConfigured) return { runs: [], issue: '' };
    try {
      const [owner, repository] = config.githubRepository.split('/');
      const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/runs?per_page=30`);
      return { runs: (data.workflow_runs || []).map(mapWorkflowRun), issue: '' };
    } catch (error) {
      return { runs: [], issue: error.message };
    }
  }

  async function loadGitHubRunArtifacts(runId) {
    if (!githubConfigured || !runId) return [];
    try {
      const [owner, repository] = config.githubRepository.split('/');
      const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${encodeURIComponent(runId)}/artifacts?per_page=100`);
      const manifest = (data.artifacts || [])
        .filter((artifact) => !artifact.expired)
        .find((artifact) => String(artifact.name || '').startsWith('release-artifacts') && artifact.archive_download_url);
      if (!manifest) return [];
      const archive = await githubRequestBuffer(manifest.archive_download_url);
      const tsv = extractZipTextEntry(archive, RELEASE_ARTIFACTS_FILE);
      return tsv ? parseReleaseArtifactsTsv(tsv, config) : [];
    } catch {
      return [];
    }
  }

  async function loadAndroidGitHubReleases() {
    const [owner, repository] = config.githubRepository.split('/');
    const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases?per_page=100`);
    return Array.isArray(data) ? data : [];
  }

  async function getAndroidReleases() {
    if (androidReleaseCache && Date.now() - androidReleaseCache.cachedAt < 60_000) {
      return androidReleaseCache.data;
    }
    const releases = await loadAndroidGitHubReleases();
    const downloadBase = String(config.androidReleaseDownloadBaseUrl || 'https://7n.pxyb.cn').replace(/\/$/, '');
    const published = releases
      .filter((release) => !release.draft && androidVersionFromTag(release.tag_name))
      .map((release) => {
        const version = androidVersionFromTag(release.tag_name);
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const apkAsset = assets.find((asset) => /^my-control-.*\.apk$/i.test(String(asset.name || '')));
        const sha256 = apkAsset ? androidAssetSha256(apkAsset) : null;
        return {
          id: String(release.id),
          versionName: version.versionName,
          versionCode: version.versionCode,
          tag: String(release.tag_name),
          apkUrl: apkAsset ? `${downloadBase}/android/my-control-${version.versionName}.apk` : null,
          fallbackApkUrl: apkAsset?.browser_download_url || null,
          sha256,
          apkSize: Number(apkAsset?.size) || 0,
          releaseUrl: release.html_url || null,
          publishedAt: release.published_at || null,
          notes: String(release.body || '').trim(),
          installable: Boolean(apkAsset && sha256),
        };
      });
    const drafts = releases
      .filter((release) => release.draft)
      .map(mapAndroidDraft)
      .filter(Boolean);
    const data = {
      draft: drafts[0] || null,
      releases: published.sort((left, right) => right.versionCode - left.versionCode),
      latest: published[0] || null,
      refreshedAt: nowIso(),
    };
    androidReleaseCache = { cachedAt: Date.now(), data };
    return data;
  }

  async function saveAndroidReleaseDraft({ versionName, notes } = {}) {
    const version = parseAndroidVersion(versionName);
    const releaseNotes = String(notes || '').trim();
    if (!releaseNotes) {
      throw new ReleaseOperationError(400, 'INVALID_ANDROID_NOTES', '请填写下一次 Android 发布说明。');
    }
    if (releaseNotes.length > 20_000) {
      throw new ReleaseOperationError(400, 'INVALID_ANDROID_NOTES', 'Android 发布说明不能超过 20000 字符。');
    }

    const releases = await loadAndroidGitHubReleases();
    const drafts = releases
      .filter((release) => release.draft)
      .map(mapAndroidDraft)
      .filter(Boolean);
    if (drafts.length > 1) {
      throw new ReleaseOperationError(409, 'MULTIPLE_ANDROID_DRAFTS', '当前存在多个 Android 待发布草稿，请先在 GitHub 清理后再保存。');
    }
    const latest = releases
      .filter((release) => !release.draft)
      .map((release) => androidVersionFromTag(release.tag_name))
      .filter(Boolean)
      .sort((left, right) => right.versionCode - left.versionCode)[0];
    if (latest && version.versionCode <= latest.versionCode) {
      throw new ReleaseOperationError(400, 'INVALID_ANDROID_VERSION', `下一个 Android 版本必须大于 ${latest.versionName}。`);
    }

    const tag = `android-v${version.versionName}`;
    const body = {
      tag_name: tag,
      target_commitish: config.githubRef,
      name: `MY Control v${version.versionName}`,
      body: releaseNotes,
      draft: true,
    };
    const [owner, repository] = config.githubRepository.split('/');
    const saved = drafts[0]
      ? await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases/${encodeURIComponent(drafts[0].id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      : await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const mapped = mapAndroidDraft(saved);
    if (!mapped) throw new ReleaseOperationError(502, 'INVALID_ANDROID_DRAFT_RESPONSE', 'GitHub 返回的 Android 草稿数据无效。');
    androidReleaseCache = null;
    return mapped;
  }

  async function dispatchAndroidBuild({ requestedBy: _requestedBy = 'system' } = {}) {
    if (!config.releaseActionsEnabled) {
      throw new ReleaseOperationError(403, 'RELEASE_ACTIONS_DISABLED', 'Android 构建操作未启用。');
    }
    if (!githubConfigured) {
      throw new ReleaseOperationError(403, 'ANDROID_BUILD_DISABLED', 'GitHub Token 或仓库未配置。');
    }
    const workflow = String(config.androidReleaseWorkflow || 'android-release.yml');
    const [owner, repository] = config.githubRepository.split('/');
    await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: config.githubRef, inputs: {} }),
    });
    androidReleaseCache = null;
    return { dispatched: true, workflow, ref: config.githubRef };
  }

  function capabilityReasons() {
    const build = [];
    if (!config.releaseActionsEnabled) build.push('镜像构建操作未启用');
    if (!githubConfigured) build.push('GitHub Token 或仓库未配置');
    if (!callbackConfigured) build.push('发布回调令牌未配置');
    if (!artifactRepositoryConfigured) build.push('允许的镜像仓库未配置');
    return { build };
  }

  async function getSummary() {
    const [{ runs, issue: githubIssue }, storedBuilds] = await Promise.all([
      loadGitHubRuns(),
      store.listBuilds({ limit: 20 }),
    ]);
    const githubRuns = new Map(runs.map((run) => [String(run.id), run]));
    const usedInferredRunIds = new Set(storedBuilds.map((build) => String(build.workflowRun?.id || '')).filter(Boolean));
    const findInferredRun = (build) => {
      if (build.workflowRun?.id || build.source !== 'manual') return null;
      const buildCreatedAt = validTimestamp(build.createdAt);
      if (!buildCreatedAt) return null;
      const candidates = runs
        .filter((run) => !usedInferredRunIds.has(String(run.id)))
        .filter((run) => run.event === 'workflow_dispatch')
        .filter((run) => !build.ref || !run.branch || run.branch === build.ref)
        .map((run) => ({ run, createdAt: validTimestamp(run.createdAt) }))
        .filter(({ createdAt }) => createdAt !== null)
        .filter(({ createdAt }) => (
          createdAt >= buildCreatedAt - WORKFLOW_DISPATCH_MATCH_BEFORE_MS
          && createdAt <= buildCreatedAt + WORKFLOW_DISPATCH_MATCH_AFTER_MS
        ))
        .sort((left, right) => Math.abs(left.createdAt - buildCreatedAt) - Math.abs(right.createdAt - buildCreatedAt));
      const inferred = candidates[0]?.run || null;
      if (inferred) usedInferredRunIds.add(String(inferred.id));
      return inferred;
    };
    const reconciledBuilds = await Promise.all(storedBuilds.map(async (build) => {
      const run = githubRuns.get(String(build.workflowRun?.id || '')) || findInferredRun(build);
      if (!run) return build;
      const reconciledStatus = workflowConclusionStatus(run);
      const canFinalizeFromRun = reconciledStatus !== 'succeeded' || (build.artifacts || []).length > 0;
      const status = TERMINAL_BUILD_STATES.has(build.status)
        ? build.status
        : canFinalizeFromRun ? reconciledStatus : 'succeeded';
      const reconciled = {
        ...build,
        status,
        revision: build.revision || run.headSha || run.revision,
        startedAt: build.startedAt || run.startedAt || build.createdAt,
        updatedAt: run.updatedAt || build.updatedAt,
        completedAt: build.completedAt || (TERMINAL_BUILD_STATES.has(status) ? run.completedAt : null),
        workflowRun: {
          id: String(run.id),
          attempt: Number(build.workflowRun?.attempt) || 1,
          url: run.url || build.workflowRun?.url || '',
          actor: build.workflowRun?.actor || run.actor || '',
          event: build.workflowRun?.event || run.event || '',
        },
      };
      if (status === 'succeeded' && !(reconciled.artifacts || []).length) {
        const artifacts = await loadGitHubRunArtifacts(run.id);
        const targets = (reconciled.targets || []).length ? reconciled.targets : artifacts.map((artifact) => artifact.component);
        const hasAllTargets = targets.length > 0
          && artifacts.length === targets.length
          && targets.every((target) => artifacts.some((artifact) => artifact.component === target));
        const revision = stringValue(reconciled.revision || run.headSha, 64).toLowerCase();
        if (hasAllTargets && REVISION_PATTERN.test(revision)) {
          return store.updateBuild(reconciled.id, {
            status: 'succeeded',
            targets,
            artifacts,
            revision,
            startedAt: reconciled.startedAt,
            updatedAt: run.updatedAt || reconciled.updatedAt,
            completedAt: reconciled.completedAt || run.completedAt,
            workflowRun: reconciled.workflowRun,
          }, releaseEvent('succeeded', '从 GitHub Actions 产物清单恢复构建产物'));
        }
        return {
          ...reconciled,
          artifactSyncStatus: 'missing',
        };
      }
      return reconciled;
    }));
    const buildRunIds = new Set(reconciledBuilds.map((build) => String(build.workflowRun?.id || '')).filter(Boolean));
    const observedBuilds = runs
      .filter((run) => !buildRunIds.has(String(run.id)))
      .map((run) => mapObservedBuild(run, config));
    const builds = [...reconciledBuilds, ...observedBuilds]
      .sort((left, right) => sortTimestamp(right.createdAt || right.startedAt || right.updatedAt) - sortTimestamp(left.createdAt || left.startedAt || left.updatedAt))
      .slice(0, 30);
    const reasons = capabilityReasons();
    const completedBuilds = builds.filter((item) => ['succeeded', 'failed', 'cancelled'].includes(item.status));
    const successfulBuilds = completedBuilds.filter((item) => item.status === 'succeeded').length;
    const latestBuild = builds.find((item) => item.status === 'succeeded' && item.artifacts?.length);
    return {
      capabilities: {
        githubConfigured,
        callbackConfigured,
        canBuild: reasons.build.length === 0,
        reasons,
        issue: githubIssue,
      },
      environment: config.releaseEnvironment || 'production',
      repository: config.githubRepository || null,
      workflow: config.githubWorkflow || null,
      ref: config.githubRef || null,
      revision: config.releaseRevision || null,
      imageBuiltAt: config.releaseDeployedAt || null,
      refreshedAt: nowIso(),
      components: componentImages,
      builds,
      runs,
      metrics: {
        configuredComponents: componentImages.filter((item) => item.configured).length,
        latestBuildId: latestBuild?.id || null,
        latestRevision: latestBuild?.revision || null,
        successfulBuilds,
        completedBuilds: completedBuilds.length,
        activeOperations: builds.filter((item) => ACTIVE_BUILD_STATES.has(item.status)).length,
      },
    };
  }

  async function dispatchBuild({ targets, requestedBy = 'system' }) {
    if (!config.releaseActionsEnabled) {
      throw new ReleaseOperationError(403, 'RELEASE_ACTIONS_DISABLED', '镜像构建操作未启用。');
    }
    const reasons = capabilityReasons().build;
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

  async function acceptCallback(payload) {
    if (payload?.type === 'build') return acceptBuildCallback(payload);
    throw new ReleaseOperationError(400, 'INVALID_RELEASE_CALLBACK', '未知的发布回调类型。');
  }

  return {
    acceptCallback,
    dispatchBuild,
    dispatchAndroidBuild,
    getSummary,
    getAndroidReleases,
    saveAndroidReleaseDraft,
  };
}
