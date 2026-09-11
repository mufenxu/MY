// 阿里云容器镜像服务（个人版实例）管理。
// 个人版没有公开 OpenAPI，这里使用 Docker Registry V2 协议：
//   - 列举：GET  /v2/<namespace>/<name>/tags/list
//   - 删除：DELETE /v2/<namespace>/<name>/manifests/<digest>（只能按 digest，按 tag 会返回 400）
//   - 鉴权：realm 返回的 token 端点，scope 必须是 repository:<namespace>/<name>:*（pull,push,delete 会被降级）

const MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
].join(', ');

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const REVISION_SUFFIX_PATTERN = /-(?:latest-)?([0-9a-f]{12})$/i;
const INTERNAL_IMAGE_CACHE_TAG = '__ACR_BUILD_SERVICE_INTERNAL_IMAGE_CACHE';
const TAG_PAGE_SIZE = 100;
const MAX_TAG_PAGES = 40;
const MAX_BATCH_TAGS = 60;
const BATCH_CONCURRENCY = 4;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const COMMIT_PAGE_SIZE = 100;
const COMMIT_MAX_PAGES = 20;
const COMMIT_CACHE_TTL_MS = 10 * 60 * 1000;
const TOKEN_MIN_TTL_MS = 30 * 1000;
const TOKEN_MAX_TTL_MS = 15 * 60 * 1000;

export class AcrOperationError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AcrOperationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function parseRegistryTarget(value) {
  const text = String(value || '').trim().replace(/^https?:\/\//, '').replace(/[:/]+$/, '');
  if (!text) return null;
  const [host, ...rest] = text.split('/');
  if (!host || !host.includes('.') || rest.length < 2) return null;
  return { host, path: rest.join('/'), namespace: rest.slice(0, -1).join('/') };
}

export function parseImageReference(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const separator = text.lastIndexOf('@');
  if (separator > 0) {
    const digest = text.slice(separator + 1).toLowerCase();
    if (DIGEST_PATTERN.test(digest)) return { repository: text.slice(0, separator), reference: digest, digest: true };
  }
  const slash = text.lastIndexOf('/');
  const colon = text.lastIndexOf(':');
  if (colon > slash) return { repository: text.slice(0, colon), reference: text.slice(colon + 1), digest: false };
  return { repository: text, reference: '', digest: false };
}

export function tagRevision(tag) {
  const match = REVISION_SUFFIX_PATTERN.exec(String(tag || ''));
  return match ? match[1].toLowerCase() : null;
}

export function tagPrefix(tag) {
  const text = String(tag || '');
  return REVISION_SUFFIX_PATTERN.test(text) ? text.replace(REVISION_SUFFIX_PATTERN, '') : null;
}

function protectionReason(tag, configuredTags) {
  if (tag === INTERNAL_IMAGE_CACHE_TAG) return 'internal';
  if (configuredTags.has(tag)) return 'configured';
  if (tag === 'latest' || tag.endsWith('-latest')) return 'production';
  return null;
}

export function isProtectedTagName(tag, configuredTags = new Set()) {
  return Boolean(protectionReason(String(tag || ''), configuredTags));
}

export function classifyTags(tags, configuredTags = new Set()) {
  const protectedTags = [];
  const groups = new Map();
  const others = [];
  for (const tag of tags) {
    const reason = protectionReason(tag, configuredTags);
    if (reason) {
      protectedTags.push({ tag, reason });
      continue;
    }
    const prefix = tagPrefix(tag);
    if (!prefix) {
      others.push(tag);
      continue;
    }
    const list = groups.get(prefix);
    if (list) list.push(tag);
    else groups.set(prefix, [tag]);
  }
  return { protectedTags, groups, others };
}

export function canDeleteActions(actions) {
  return actions.includes('*') || actions.includes('delete');
}

export function decodeTokenClaims(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function tokenActions(claims) {
  const access = claims?.access;
  if (!Array.isArray(access)) return [];
  return [...new Set(access.flatMap((entry) => (Array.isArray(entry?.actions) ? entry.actions : [])))];
}

function tokenTtlMs(token, nowMillis) {
  const claims = decodeTokenClaims(token);
  const expiresAt = Number(claims?.exp) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return 5 * 60 * 1000;
  return Math.min(Math.max(expiresAt - nowMillis - TOKEN_MIN_TTL_MS, TOKEN_MIN_TTL_MS), TOKEN_MAX_TTL_MS);
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function sortByCreatedAtDescending(left, right) {
  if (left.createdAt === right.createdAt) return left.tag.localeCompare(right.tag);
  if (!left.createdAt) return 1;
  if (!right.createdAt) return -1;
  return right.createdAt.localeCompare(left.createdAt);
}

function normalizeTagList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const list = [];
  for (const item of value) {
    const tag = String(item || '').trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    list.push(tag);
  }
  return list;
}

export function createAcrService({
  config = {},
  fetchImpl = fetch,
  now = () => Date.now(),
  logger = console,
}) {
  const repository = String(config.releaseAllowedImageRepository || '').trim();
  const target = parseRegistryTarget(repository);
  const username = String(config.acrUsername || '').trim();
  const password = String(config.acrPassword || '');
  const credentialsConfigured = Boolean(username && password);

  const configuredTags = new Set();
  const pinnedDigests = new Set();
  for (const value of Object.values(config.releaseImages || {})) {
    const reference = parseImageReference(value);
    if (!reference || reference.repository !== repository) continue;
    if (reference.digest) pinnedDigests.add(reference.reference);
    else if (reference.reference) configuredTags.add(reference.reference);
  }

  let tokenState = { token: null, actions: [], expiresAt: 0 };
  let commitState = { available: false, complete: false, map: new Map(), fetchedAt: 0 };

  function requireTarget() {
    if (!target) {
      throw new AcrOperationError(503, 'ACR_NOT_CONFIGURED', '未配置 ACR 镜像仓库，请设置 PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY。');
    }
    return target;
  }

  async function acquireToken({ force = false } = {}) {
    const registry = requireTarget();
    if (!force && tokenState.token && tokenState.expiresAt > now()) return tokenState;
    const challenge = await fetchImpl(`https://${registry.host}/v2/`, { method: 'GET' });
    const header = challenge.headers.get('www-authenticate') || '';
    const realm = /realm="([^"]+)"/.exec(header)?.[1];
    const service = /service="([^"]+)"/.exec(header)?.[1];
    if (!realm) {
      if (challenge.ok) {
        tokenState = { token: null, actions: [], expiresAt: now() + TOKEN_MIN_TTL_MS };
        return tokenState;
      }
      throw new AcrOperationError(502, 'ACR_AUTH_CHALLENGE_FAILED', `镜像仓库未返回认证信息（HTTP ${challenge.status}）。`);
    }
    const url = new URL(realm);
    if (service) url.searchParams.set('service', service);
    url.searchParams.set('scope', `repository:${registry.path}:*`);
    const headers = {};
    if (credentialsConfigured) {
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
    const response = await fetchImpl(url, { headers });
    if (response.status === 401) {
      throw new AcrOperationError(502, 'ACR_TOKEN_REJECTED', '镜像仓库拒绝认证，请检查 ACR_USERNAME / ACR_PASSWORD。');
    }
    if (!response.ok) throw new AcrOperationError(502, 'ACR_TOKEN_FAILED', `获取镜像仓库令牌失败（HTTP ${response.status}）。`);
    const body = await response.json().catch(() => ({}));
    const token = body.token || body.access_token || null;
    if (!token) throw new AcrOperationError(502, 'ACR_TOKEN_FAILED', '镜像仓库未返回访问令牌。');
    const declared = Array.isArray(body.access?.[0]?.actions) ? body.access[0].actions : [];
    const claims = decodeTokenClaims(token);
    const actions = declared.length ? declared : tokenActions(claims);
    tokenState = { token, actions, expiresAt: now() + tokenTtlMs(token, now()) };
    return tokenState;
  }

  async function listTags(token) {
    const registry = requireTarget();
    const tags = [];
    let last = null;
    for (let page = 0; page < MAX_TAG_PAGES; page += 1) {
      const url = new URL(`https://${registry.host}/v2/${registry.path}/tags/list`);
      url.searchParams.set('n', String(TAG_PAGE_SIZE));
      if (last) url.searchParams.set('last', last);
      const response = await fetchImpl(url, { headers: authHeaders(token) });
      if (response.status === 401 || response.status === 403) {
        throw new AcrOperationError(403, 'ACR_UNAUTHORIZED', '镜像仓库拒绝了列表请求，请检查 ACR 账号凭据与仓库权限。');
      }
      if (!response.ok) throw new AcrOperationError(502, 'ACR_TAGS_FAILED', `读取镜像版本失败（HTTP ${response.status}）。`);
      const body = await response.json().catch(() => ({}));
      const batch = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string' && tag) : [];
      if (!batch.length) break;
      tags.push(...batch);
      last = batch[batch.length - 1];
      if (batch.length < TAG_PAGE_SIZE) break;
    }
    return [...new Set(tags)].sort();
  }

  async function resolveDigest(tag, token) {
    const registry = requireTarget();
    const url = `https://${registry.host}/v2/${registry.path}/manifests/${encodeURIComponent(tag)}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetchImpl(url, { method: 'HEAD', headers: { ...authHeaders(token), Accept: MANIFEST_ACCEPT } });
      if (RETRYABLE_STATUS.has(response.status)) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      const digest = response.headers.get('docker-content-digest');
      return digest ? digest.trim().toLowerCase() : null;
    }
    return null;
  }

  async function resolveDigests(tags, token) {
    const entries = await mapLimit(tags, BATCH_CONCURRENCY, async (tag) => [tag, await resolveDigest(tag, token)]);
    return new Map(entries);
  }

  async function deleteManifest(digest, token) {
    const registry = requireTarget();
    const url = `https://${registry.host}/v2/${registry.path}/manifests/${encodeURIComponent(digest)}`;
    let status = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetchImpl(url, { method: 'DELETE', headers: authHeaders(token) });
      status = response.status;
      if (!RETRYABLE_STATUS.has(status)) break;
      await sleep(300 * (attempt + 1));
    }
    return { ok: status === 202 || status === 200 || status === 204, status };
  }

  async function loadCommitIndex(revisions) {
    if (!config.githubToken || !config.githubRepository) return { available: false, complete: false, map: new Map() };
    if (commitState.fetchedAt && now() - commitState.fetchedAt < COMMIT_CACHE_TTL_MS) return commitState;
    const map = new Map();
    let complete = true;
    for (let page = 1; page <= COMMIT_MAX_PAGES; page += 1) {
      const url = `https://api.github.com/repos/${config.githubRepository}/commits?per_page=${COMMIT_PAGE_SIZE}&page=${page}`;
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.githubToken}`,
          'User-Agent': 'my-platform-acr',
        },
      });
      if (!response.ok) {
        complete = false;
        break;
      }
      const list = await response.json().catch(() => null);
      if (!Array.isArray(list) || list.length === 0) break;
      for (const commit of list) {
        const sha = String(commit?.sha || '').toLowerCase();
        const date = commit?.commit?.committer?.date || commit?.commit?.author?.date || '';
        if (sha && date) map.set(sha.slice(0, 12), date);
      }
      if (revisions.every((revision) => map.has(revision))) break;
      if (list.length < COMMIT_PAGE_SIZE) break;
    }
    commitState = { available: map.size > 0, complete, map, fetchedAt: now() };
    if (!commitState.available) logger?.warn?.('ACR 构建时间不可用：GitHub 提交时间未获取成功。');
    return commitState;
  }

  async function protectedDigestsFor(token) {
    const tags = await listTags(token);
    const { protectedTags } = classifyTags(tags, configuredTags);
    const resolved = await resolveDigests(protectedTags.map((item) => item.tag), token);
    const digests = new Set(pinnedDigests);
    for (const digest of resolved.values()) if (digest) digests.add(digest);
    return { tags, protectedTags, resolved, digests };
  }

  async function getImages({ refresh = false } = {}) {
    const registry = requireTarget();
    const session = await acquireToken({ force: refresh });
    const tags = await listTags(session.token);
    const { protectedTags, groups, others } = classifyTags(tags, configuredTags);
    const protectedDigests = new Set(pinnedDigests);
    const resolvedProtected = await resolveDigests(protectedTags.map((item) => item.tag), session.token);
    for (const digest of resolvedProtected.values()) if (digest) protectedDigests.add(digest);
    const revisions = [...new Set([...groups.values()].flat().map((tag) => tagRevision(tag)).filter(Boolean))];
    const commitIndex = await loadCommitIndex(revisions);
    const groupPayload = [...groups.entries()]
      .map(([prefix, list]) => ({
        prefix,
        tags: list
          .map((tag) => {
            const revision = tagRevision(tag);
            return { tag, revision, createdAt: (revision && commitIndex.map.get(revision)) || null };
          })
          .sort(sortByCreatedAtDescending),
      }))
      .sort((left, right) => right.tags.length - left.tags.length || left.prefix.localeCompare(right.prefix));
    const withoutTimeline = groupPayload.reduce(
      (total, group) => total + group.tags.filter((item) => !item.createdAt).length,
      0,
    );
    return {
      repository,
      registry: registry.host,
      namespace: registry.namespace,
      name: registry.path,
      fetchedAt: new Date(now()).toISOString(),
      tagCount: tags.length,
      credentialsConfigured,
      canDelete: credentialsConfigured && canDeleteActions(session.actions),
      commitTimeline: {
        available: commitIndex.available,
        complete: commitIndex.complete,
        commits: commitIndex.map.size,
        unknownTags: withoutTimeline,
      },
      protectedTags: protectedTags
        .map((item) => ({ tag: item.tag, reason: item.reason, digest: resolvedProtected.get(item.tag) || null }))
        .sort((left, right) => left.tag.localeCompare(right.tag)),
      groups: groupPayload,
      otherTags: others.sort(),
      limits: { maxBatch: MAX_BATCH_TAGS },
      protectedDigestCount: protectedDigests.size,
    };
  }

  async function deleteImages({ tags } = {}) {
    requireTarget();
    const requested = normalizeTagList(tags);
    if (!requested.length) throw new AcrOperationError(400, 'ACR_NO_TAGS', '请选择要删除的镜像版本。');
    if (requested.length > MAX_BATCH_TAGS) {
      throw new AcrOperationError(400, 'ACR_TOO_MANY_TAGS', `单次最多删除 ${MAX_BATCH_TAGS} 个镜像版本。`);
    }
    const session = await acquireToken();
    if (!canDeleteActions(session.actions)) {
      throw new AcrOperationError(403, 'ACR_DELETE_NOT_PERMITTED', '当前 ACR 凭据没有删除权限，请在服务器配置 ACR_USERNAME / ACR_PASSWORD。');
    }
    const { tags: known, digests: protectedDigests } = await protectedDigestsFor(session.token);
    const knownTags = new Set(known);
    const deleted = [];
    const skipped = [];
    const failed = [];
    const pending = [];
    for (const tag of requested) {
      if (!knownTags.has(tag)) {
        skipped.push({ tag, reason: 'not-found' });
        continue;
      }
      if (isProtectedTagName(tag, configuredTags)) {
        skipped.push({ tag, reason: 'protected' });
        continue;
      }
      pending.push(tag);
    }
    const claimedDigests = new Set();
    await mapLimit(pending, BATCH_CONCURRENCY, async (tag) => {
      const digest = await resolveDigest(tag, session.token);
      if (!digest) {
        failed.push({ tag, reason: 'digest-unresolved' });
        return;
      }
      if (protectedDigests.has(digest)) {
        skipped.push({ tag, reason: 'in-use', digest });
        return;
      }
      if (claimedDigests.has(digest)) {
        skipped.push({ tag, reason: 'duplicate-digest', digest });
        return;
      }
      // 先同步占用 digest，避免并发分支对同一 manifest 重复发起删除。
      claimedDigests.add(digest);
      const outcome = await deleteManifest(digest, session.token);
      if (outcome.ok) {
        deleted.push({ tag, digest });
      } else {
        claimedDigests.delete(digest);
        failed.push({ tag, digest, status: outcome.status, reason: outcome.status === 401 || outcome.status === 403 ? 'forbidden' : 'delete-failed' });
      }
    });
    return { repository, deleted, skipped, failed };
  }

  async function pruneImages({ keep = 5, prefixes = null, includeUnknown = false, dryRun = true } = {}) {
    const keepCount = Math.min(Math.max(Number.parseInt(keep, 10) || 5, 1), 50);
    const images = await getImages();
    const selected = Array.isArray(prefixes) && prefixes.length ? new Set(prefixes.map((item) => String(item))) : null;
    const plan = [];
    for (const group of images.groups) {
      if (selected && !selected.has(group.prefix)) continue;
      const dated = group.tags.filter((item) => item.createdAt);
      const keepTags = new Set(dated.slice(0, keepCount).map((item) => item.tag));
      for (const item of group.tags) {
        if (keepTags.has(item.tag)) continue;
        if (!item.createdAt && !includeUnknown) continue;
        plan.push({ tag: item.tag, prefix: group.prefix, createdAt: item.createdAt });
      }
    }
    const batch = plan.slice(0, MAX_BATCH_TAGS);
    const base = {
      repository,
      keep: keepCount,
      planned: plan.length,
      remaining: Math.max(0, plan.length - batch.length),
      plan: batch,
    };
    // 计划为空时不要走删除，否则会以「请选择要删除的镜像版本」报错，误导为参数问题。
    if (dryRun || !batch.length) return base;
    const result = await deleteImages({ tags: batch.map((item) => item.tag) });
    return { ...base, ...result };
  }

  return { getImages, deleteImages, pruneImages };
}
