import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AcrOperationError,
  canDeleteActions,
  classifyTags,
  createAcrService,
  isProtectedTagName,
  parseImageReference,
  parseRegistryTarget,
  tagPrefix,
  tagRevision,
} from '../src/acr-service.js';

const repository = 'registry.example.com/team/platform';
const registryHost = 'registry.example.com';
const repositoryPath = 'team/platform';
const internalTag = '__ACR_BUILD_SERVICE_INTERNAL_IMAGE_CACHE';
const digestFor = (seed) => `sha256:${seed.repeat(64).slice(0, 64)}`;

function jsonResponse(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function emptyResponse(status, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), text: async () => '' };
}

function createFetchRouter(handlers) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    calls.push({ href, method });
    for (const handler of handlers) {
      const response = handler({ href, method, options });
      if (response) return response;
    }
    throw new Error(`unexpected request: ${method} ${href}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const challenge = () => emptyResponse(401, {
  'www-authenticate': 'Bearer realm="https://auth.example.com/token",service="registry.example.com:team"',
});

function createConfig(overrides = {}) {
  return {
    releaseAllowedImageRepository: repository,
    releaseImages: { platform: `${repository}:custom-tag` },
    acrUsername: 'registry-user',
    acrPassword: 'registry-password',
    githubRepository: 'owner/repository',
    githubToken: 'github-token',
    ...overrides,
  };
}

function createService({ tags, digests = {}, commits = [], tokenActions = ['*'], config: configOverrides = {}, deletions } = {}) {
  const deleteLog = deletions || [];
  const fetchImpl = createFetchRouter([
    ({ href }) => (href.startsWith(`https://${registryHost}/v2/`) && href.endsWith('/v2/') ? challenge() : null),
    ({ href }) => (href.startsWith('https://auth.example.com/token') ? jsonResponse({ token: 'stub-token', access: [{ actions: tokenActions }] }) : null),
    ({ href }) => (href.includes('/tags/list') ? jsonResponse({ name: repositoryPath, tags }) : null),
    ({ href, method }) => {
      if (method !== 'HEAD' || !href.includes('/manifests/')) return null;
      const reference = decodeURIComponent(href.split('/manifests/')[1]);
      const digest = digests[reference];
      return digest ? emptyResponse(200, { 'docker-content-digest': digest }) : emptyResponse(404);
    },
    ({ href, method }) => {
      if (method !== 'DELETE' || !href.includes('/manifests/')) return null;
      const reference = decodeURIComponent(href.split('/manifests/')[1]);
      deleteLog.push(reference);
      return emptyResponse(202);
    },
    ({ href }) => (href.startsWith('https://api.github.com/repos/owner/repository/commits')
      ? jsonResponse(commits)
      : null),
  ]);
  const service = createAcrService({ config: createConfig(configOverrides), fetchImpl, now: () => Date.parse('2026-09-11T00:00:00Z') });
  service.fetchCalls = fetchImpl.calls;
  service.deleteLog = deleteLog;
  return service;
}

test('parseRegistryTarget accepts a registry path and rejects incomplete values', () => {
  assert.deepEqual(parseRegistryTarget(repository), { host: registryHost, path: repositoryPath, namespace: 'team' });
  assert.equal(parseRegistryTarget('registry.example.com/only-one-segment'), null);
  assert.equal(parseRegistryTarget(''), null);
});

test('parseImageReference separates tag and digest references', () => {
  assert.deepEqual(parseImageReference(`${repository}:platform-latest`), {
    repository,
    reference: 'platform-latest',
    digest: false,
  });
  const digest = digestFor('a');
  assert.deepEqual(parseImageReference(`${repository}@${digest}`), {
    repository,
    reference: digest,
    digest: true,
  });
});

test('tag helpers extract revisions and prefixes', () => {
  assert.equal(tagRevision('platform-api-latest-45225c6abcd1'), '45225c6abcd1');
  assert.equal(tagPrefix('platform-api-latest-45225c6abcd1'), 'platform-api');
  assert.equal(tagPrefix('mongodb-7.0-012a426c0903'), 'mongodb-7.0');
  assert.equal(tagPrefix('platform-api-latest'), null);
  assert.equal(tagRevision('latest'), null);
});

test('classifyTags protects production, internal and configured tags', () => {
  const configured = new Set(['custom-tag']);
  assert.equal(isProtectedTagName('platform-latest', configured), true);
  assert.equal(isProtectedTagName('latest', configured), true);
  assert.equal(isProtectedTagName(internalTag, configured), true);
  assert.equal(isProtectedTagName('custom-tag', configured), true);
  assert.equal(isProtectedTagName('platform-latest-45225c6abcd1', configured), false);
  const { protectedTags, groups, others } = classifyTags(
    ['platform-latest', 'latest', internalTag, 'custom-tag', 'platform-latest-45225c6abcd1', 'v1.2.3'],
    configured,
  );
  assert.deepEqual(protectedTags.map((item) => item.reason), ['production', 'production', 'internal', 'configured']);
  assert.deepEqual([...groups.keys()], ['platform']);
  assert.deepEqual(others, ['v1.2.3']);
});

test('canDeleteActions requires the wildcard or delete action', () => {
  assert.equal(canDeleteActions(['*']), true);
  assert.equal(canDeleteActions(['pull', 'push']), false);
});

test('getImages groups candidates and maps commit timestamps', async () => {
  const service = createService({
    tags: ['platform-latest', 'latest', internalTag, 'custom-tag', 'platform-latest-aaaaaaaaaaaa', 'platform-latest-cccccccccccc', 'platform-latest-ffffffffffff', 'v1.2.3'],
    digests: {
      'platform-latest': digestFor('1'),
      latest: digestFor('2'),
      [internalTag]: digestFor('3'),
      'custom-tag': digestFor('4'),
    },
    commits: [
      { sha: 'cccccccccccc1111111111111111111111111111', commit: { committer: { date: '2026-09-01T00:00:00Z' } } },
      { sha: 'aaaaaaaaaaaa1111111111111111111111111111', commit: { committer: { date: '2026-08-01T00:00:00Z' } } },
    ],
  });
  const images = await service.getImages();
  assert.equal(images.repository, repository);
  assert.equal(images.tagCount, 8);
  assert.equal(images.canDelete, true);
  assert.equal(images.credentialsConfigured, true);
  assert.equal(images.commitTimeline.available, true);
  assert.deepEqual(images.protectedTags.map((item) => item.tag), [internalTag, 'custom-tag', 'latest', 'platform-latest'].sort());
  assert.deepEqual(images.otherTags, ['v1.2.3']);
  assert.equal(images.groups.length, 1);
  const [group] = images.groups;
  assert.equal(group.prefix, 'platform');
  assert.deepEqual(group.tags.map((item) => item.tag), [
    'platform-latest-cccccccccccc',
    'platform-latest-aaaaaaaaaaaa',
    'platform-latest-ffffffffffff',
  ]);
  assert.equal(group.tags[0].createdAt, '2026-09-01T00:00:00Z');
  assert.equal(group.tags[1].createdAt, '2026-08-01T00:00:00Z');
  assert.equal(group.tags[2].createdAt, null);
  assert.equal(images.commitTimeline.unknownTags, 1);
});

test('getImages degrades to read-only when credentials are absent', async () => {
  const service = createService({
    tags: ['platform-latest-aaaaaaaaaaaa'],
    commits: [],
    tokenActions: ['pull'],
    config: { acrUsername: '', acrPassword: '' },
  });
  const images = await service.getImages();
  assert.equal(images.credentialsConfigured, false);
  assert.equal(images.canDelete, false);
  assert.equal(images.commitTimeline.available, false);
});

test('deleteImages refuses to run without delete permission', async () => {
  const service = createService({ tags: ['platform-latest-aaaaaaaaaaaa'], tokenActions: ['pull'] });
  await assert.rejects(
    () => service.deleteImages({ tags: ['platform-latest-aaaaaaaaaaaa'] }),
    (error) => error instanceof AcrOperationError && error.code === 'ACR_DELETE_NOT_PERMITTED',
  );
});

test('deleteImages deletes by digest and skips protected, unknown and in-use tags', async () => {
  const service = createService({
    tags: ['platform-latest', 'platform-latest-aaaaaaaaaaaa', 'platform-latest-bbbbbbbbbbbb', 'platform-latest-dddddddddddd'],
    digests: {
      'platform-latest': digestFor('1'),
      'platform-latest-aaaaaaaaaaaa': digestFor('a'),
      'platform-latest-bbbbbbbbbbbb': digestFor('1'),
    },
  });
  const result = await service.deleteImages({
    tags: ['platform-latest', 'platform-latest-aaaaaaaaaaaa', 'platform-latest-bbbbbbbbbbbb', 'platform-latest-dddddddddddd', 'platform-latest-999999999999'],
  });
  assert.deepEqual(result.deleted, [{ tag: 'platform-latest-aaaaaaaaaaaa', digest: digestFor('a') }]);
  assert.deepEqual(sortByTag(result.skipped), [
    { tag: 'platform-latest', reason: 'protected' },
    { tag: 'platform-latest-999999999999', reason: 'not-found' },
    { tag: 'platform-latest-bbbbbbbbbbbb', reason: 'in-use', digest: digestFor('1') },
  ]);
  assert.deepEqual(result.failed, [{ tag: 'platform-latest-dddddddddddd', reason: 'digest-unresolved' }]);
  assert.deepEqual(service.deleteLog, [digestFor('a')]);
});

test('deleteImages reports duplicate digests inside one batch without failing', async () => {
  const service = createService({
    tags: ['platform-latest-aaaaaaaaaaaa', 'platform-latest-cccccccccccc'],
    digests: {
      'platform-latest-aaaaaaaaaaaa': digestFor('a'),
      'platform-latest-cccccccccccc': digestFor('a'),
    },
  });
  const result = await service.deleteImages({ tags: ['platform-latest-aaaaaaaaaaaa', 'platform-latest-cccccccccccc'] });
  const deletedTags = result.deleted.map((item) => item.tag);
  const duplicates = result.skipped.filter((item) => item.reason === 'duplicate-digest').map((item) => item.tag);
  assert.deepEqual(result.failed, []);
  assert.equal(deletedTags.length, 1);
  assert.equal(duplicates.length, 1);
  assert.notEqual(deletedTags[0], duplicates[0]);
  assert.deepEqual(service.deleteLog, [digestFor('a')]);
});

function sortByTag(items) {
  return [...items].sort((left, right) => left.tag.localeCompare(right.tag));
}

test('deleteImages rejects oversized batches', async () => {
  const service = createService({ tags: [] });
  const tags = Array.from({ length: 61 }, (_, index) => `platform-latest-${index.toString(16).padStart(12, '0')}`);
  await assert.rejects(
    () => service.deleteImages({ tags }),
    (error) => error instanceof AcrOperationError && error.code === 'ACR_TOO_MANY_TAGS',
  );
});

test('pruneImages keeps the newest candidates and reports the remaining plan', async () => {
  const service = createService({
    tags: ['platform-latest-aaaaaaaaaaaa', 'platform-latest-bbbbbbbbbbbb', 'platform-latest-cccccccccccc', 'platform-latest-ffffffffffff'],
    commits: [
      { sha: 'cccccccccccc1111111111111111111111111111', commit: { committer: { date: '2026-09-01T00:00:00Z' } } },
      { sha: 'bbbbbbbbbbbb1111111111111111111111111111', commit: { committer: { date: '2026-08-15T00:00:00Z' } } },
      { sha: 'aaaaaaaaaaaa1111111111111111111111111111', commit: { committer: { date: '2026-08-01T00:00:00Z' } } },
    ],
  });
  const plan = await service.pruneImages({ keep: 2, dryRun: true });
  assert.deepEqual(plan.plan.map((item) => item.tag), ['platform-latest-aaaaaaaaaaaa']);
  assert.equal(plan.remaining, 0);
  assert.deepEqual(service.deleteLog, []);

  const withUnknown = await service.pruneImages({ keep: 2, includeUnknown: true, dryRun: true });
  assert.deepEqual(withUnknown.plan.map((item) => item.tag), ['platform-latest-aaaaaaaaaaaa', 'platform-latest-ffffffffffff']);
});

test('pruneImages executes deletions when dryRun is false', async () => {
  const service = createService({
    tags: ['platform-latest-aaaaaaaaaaaa', 'platform-latest-bbbbbbbbbbbb'],
    digests: { 'platform-latest-aaaaaaaaaaaa': digestFor('a') },
    commits: [
      { sha: 'bbbbbbbbbbbb1111111111111111111111111111', commit: { committer: { date: '2026-09-01T00:00:00Z' } } },
      { sha: 'aaaaaaaaaaaa1111111111111111111111111111', commit: { committer: { date: '2026-08-01T00:00:00Z' } } },
    ],
  });
  const result = await service.pruneImages({ keep: 1, dryRun: false });
  assert.equal(result.deleted.length, 1);
  assert.equal(result.deleted[0].tag, 'platform-latest-aaaaaaaaaaaa');
  assert.deepEqual(service.deleteLog, [digestFor('a')]);
});

test('pruneImages reports an empty plan instead of failing when nothing can be removed', async () => {
  const service = createService({
    tags: ['platform-latest-aaaaaaaaaaaa'],
    commits: [{ sha: 'aaaaaaaaaaaa1111111111111111111111111111', commit: { committer: { date: '2026-09-01T00:00:00Z' } } }],
  });
  const result = await service.pruneImages({ keep: 3, dryRun: false });
  assert.equal(result.planned, 0);
  assert.deepEqual(result.plan, []);
  assert.deepEqual(service.deleteLog, []);
});

test('getImages surfaces repository errors as AcrOperationError', async () => {
  const fetchImpl = createFetchRouter([
    () => emptyResponse(500),
  ]);
  const service = createAcrService({ config: createConfig(), fetchImpl });
  await assert.rejects(
    () => service.getImages(),
    (error) => error instanceof AcrOperationError && error.code === 'ACR_AUTH_CHALLENGE_FAILED',
  );
});
