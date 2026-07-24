import assert from 'node:assert/strict';
import test from 'node:test';
import { createReleaseService, ReleaseOperationError } from '../src/release-service.js';
import { createMemoryReleaseStore } from '../src/release-store.js';

const imageRepository = 'registry.example.com/team/platform';
const digest = `sha256:${'a'.repeat(64)}`;

function config(overrides = {}) {
  return {
    githubRepository: 'owner/repository',
    githubToken: '',
    githubWorkflow: 'aliyun-acr.yml',
    githubRef: 'main',
    publicOrigin: 'https://admin.example.com',
    releaseActionsEnabled: false,
    releaseEnvironment: 'production',
    releaseCallbackToken: '',
    releaseAllowedImageRepository: '',
    deployHookUrl: '',
    deployHookToken: '',
    releaseImages: { platform: `${imageRepository}:platform-api-latest` },
    releaseRevision: '1234567890abcdef',
    releaseDeployedAt: '2026-07-18T12:00:00Z',
    backupRpoHours: 26,
    ...overrides,
  };
}

function artifact(component = 'platform', value = digest) {
  return {
    component,
    image: `${imageRepository}:${component}-latest`,
    shaTag: `${imageRepository}:${component}-latest-deadbeef0000`,
    digest: value,
    reference: `${imageRepository}@${value}`,
  };
}

function enabledConfig(overrides = {}) {
  return config({
    githubToken: 'token',
    releaseActionsEnabled: true,
    releaseCallbackToken: 'c'.repeat(32),
    releaseAllowedImageRepository: imageRepository,
    ...overrides,
  });
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test('release center remains explicitly read-only without credentials', async () => {
  const releases = createReleaseService({ config: config() });
  const summary = await releases.getSummary();
  assert.equal(summary.capabilities.githubConfigured, false);
  assert.equal(summary.capabilities.canBuild, false);
  assert.equal(summary.revision, '1234567890abcdef');
  await assert.rejects(
    releases.dispatchBuild({ targets: ['platform'] }),
    (error) => error instanceof ReleaseOperationError && error.code === 'RELEASE_ACTIONS_DISABLED',
  );
});

test('release builds create a persistent release and dispatch allowlisted targets', async () => {
  const requests = [];
  const store = createMemoryReleaseStore({ idFactory: () => 'release-1' });
  const releases = createReleaseService({
    config: enabledConfig(),
    store,
    idFactory: () => 'release-1',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      return options.method === 'POST' ? jsonResponse(null, 204) : jsonResponse({ workflow_runs: [] });
    },
  });

  const build = await releases.dispatchBuild({ targets: ['platform', 'core'], requestedBy: 'admin' });
  assert.equal(build.id, 'release-1');
  assert.deepEqual(build.targets, ['platform', 'core']);
  const body = JSON.parse(requests.find((request) => request.options.method === 'POST').options.body);
  assert.deepEqual(body.inputs, {
    targets: 'platform,core',
    push_sha_tags: 'true',
    release_id: 'release-1',
  });
  assert.equal((await store.getBuild('release-1')).requestedBy, 'admin');
  await assert.rejects(
    releases.dispatchBuild({ targets: ['platform;shutdown'] }),
    (error) => error.code === 'INVALID_RELEASE_TARGET',
  );
});

test('workflow callbacks persist complete immutable artifacts and reject other repositories', async () => {
  const store = createMemoryReleaseStore();
  const releases = createReleaseService({ config: enabledConfig(), store });
  const revision = 'b'.repeat(40);
  const build = await releases.acceptCallback({
    type: 'build',
    releaseId: 'gha-123-1',
    status: 'succeeded',
    event: 'push',
    targets: ['platform'],
    artifacts: [artifact()],
    revision,
    runId: '123',
    actor: 'developer',
  });
  assert.equal(build.status, 'succeeded');
  assert.equal(build.artifacts[0].reference, `${imageRepository}@${digest}`);
  assert.equal((await releases.getSummary()).builds[0].revision, revision);

  const replay = await releases.acceptCallback({
    type: 'build',
    releaseId: 'gha-123-1',
    status: 'succeeded',
    event: 'push',
    targets: ['platform'],
    artifacts: [artifact()],
    revision,
    runId: '123',
    actor: 'developer',
  });
  assert.equal(replay.status, 'succeeded');
  await assert.rejects(
    releases.acceptCallback({
      type: 'build',
      releaseId: 'gha-123-1',
      status: 'failed',
      targets: ['platform'],
      revision,
      runId: '123',
    }),
    (error) => error.code === 'RELEASE_ALREADY_FINALIZED',
  );

  await assert.rejects(
    releases.acceptCallback({
      type: 'build',
      releaseId: 'gha-124-1',
      status: 'succeeded',
      targets: ['platform'],
      revision,
      artifacts: [{ ...artifact(), reference: `evil.example/app@${digest}` }],
    }),
    (error) => error.code === 'UNTRUSTED_RELEASE_ARTIFACT',
  );
});

test('release summary reports components that differ from the latest verified build', async () => {
  const store = createMemoryReleaseStore();
  const releases = createReleaseService({
    config: config({
      releaseCallbackToken: 'c'.repeat(32),
      releaseAllowedImageRepository: imageRepository,
      deployHookUrl: 'http://deployment-runner:22104',
      deployHookToken: 'd'.repeat(32),
    }),
    store,
    fetchImpl: async () => jsonResponse({
      components: [{
        component: 'platform',
        configuredImage: `${imageRepository}@sha256:${'b'.repeat(64)}`,
        digest: `sha256:${'b'.repeat(64)}`,
        state: 'running',
        health: 'healthy',
        inSync: true,
      }],
      jobs: [],
    }),
  });
  await releases.acceptCallback({
    type: 'build',
    releaseId: 'gha-update-1',
    status: 'succeeded',
    event: 'push',
    targets: ['platform'],
    artifacts: [artifact()],
    revision: 'e'.repeat(40),
    runId: '456',
  });
  const summary = await releases.getSummary();
  assert.equal(summary.metrics.availableUpdates, 1);
  assert.equal(summary.imageBuiltAt, '2026-07-18T12:00:00Z');
  assert.equal(summary.metrics.observedComponents, 1);
  assert.equal(summary.components[0].observed, true);
  assert.deepEqual(summary.metrics.availableUpdateComponents, ['platform']);
  assert.equal(summary.metrics.latestBuildId, 'gha-update-1');
});

test('release summary does not count missing runtime placeholders as observed containers', async () => {
  const releases = createReleaseService({
    config: config({
      deployHookUrl: 'http://deployment-runner:22104',
      deployHookToken: 'd'.repeat(32),
    }),
    fetchImpl: async () => jsonResponse({
      components: [{ component: 'platform', state: 'missing', health: 'unknown', inSync: null }],
      jobs: [],
    }),
  });
  const summary = await releases.getSummary();
  assert.equal(summary.metrics.observedComponents, 0);
  assert.equal(summary.components[0].observed, false);
});

test('release summary exposes GitHub start, update and completion timestamps', async () => {
  const releases = createReleaseService({
    config: config({ githubToken: 'token' }),
    fetchImpl: async () => jsonResponse({
      workflow_runs: [{
        id: 123,
        name: 'Build and push Aliyun ACR images',
        status: 'in_progress',
        conclusion: null,
        head_sha: 'a'.repeat(40),
        created_at: '2026-07-20T17:11:40Z',
        run_started_at: '2026-07-20T17:11:42Z',
        updated_at: '2026-07-20T17:12:00Z',
      }],
    }),
  });
  const summary = await releases.getSummary();
  assert.equal(summary.runs[0].startedAt, '2026-07-20T17:11:42Z');
  assert.equal(summary.runs[0].updatedAt, '2026-07-20T17:12:00Z');
  assert.equal(summary.runs[0].completedAt, null);
  assert.ok(Date.parse(summary.refreshedAt));
});

test('release summary reconciles manually dispatched builds when callbacks miss the run id', async () => {
  const requests = [];
  const store = createMemoryReleaseStore({
    now: () => new Date('2026-07-23T02:52:48Z'),
  });
  const releases = createReleaseService({
    config: enabledConfig(),
    store,
    idFactory: () => '5174a26e-32b',
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (options.method === 'POST') return jsonResponse(null, 204);
      return jsonResponse({
        workflow_runs: [{
          id: 29975512070,
          name: 'Build and push Aliyun ACR images',
          event: 'workflow_dispatch',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          head_sha: '4766b850dcf26cb841950619522caabd38be8a27',
          created_at: '2026-07-23T02:52:49Z',
          run_started_at: '2026-07-23T02:52:49Z',
          updated_at: '2026-07-23T02:55:33Z',
          html_url: 'https://github.com/mufenxu/MY/actions/runs/29975512070',
        }],
      });
    },
  });

  await releases.dispatchBuild({ targets: ['notification'], requestedBy: 'admin' });
  const summary = await releases.getSummary();
  assert.equal(summary.builds[0].status, 'succeeded');
  assert.equal(summary.builds[0].workflowRun.id, '29975512070');
  assert.equal(summary.builds[0].completedAt, '2026-07-23T02:55:33Z');
  assert.equal((await store.getBuild('5174a26e-32b')).status, 'queued');

  const callback = await releases.acceptCallback({
    type: 'build',
    releaseId: '5174a26e-32b',
    status: 'succeeded',
    event: 'workflow_dispatch',
    targets: ['notification'],
    artifacts: [artifact('notification')],
    revision: '4766b850dcf26cb841950619522caabd38be8a27',
    runId: '29975512070',
  });
  assert.equal(callback.status, 'succeeded');
  assert.equal(callback.artifacts[0].component, 'notification');
});

test('deployment uses build digests only after runner and platform preflight checks pass', async () => {
  const store = createMemoryReleaseStore();
  const requests = [];
  const releases = createReleaseService({
    config: enabledConfig({
      deployHookUrl: 'http://deploy-runner.internal/',
      deployHookToken: 'd'.repeat(32),
    }),
    store,
    idFactory: () => 'deployment-1',
    operationsStore: {
      listIncidents: async () => [],
      getSettings: async () => ({ maintenanceWindows: [] }),
      addAudit: async () => ({}),
    },
    fetchImpl: async (url, options = {}) => {
      const resource = String(url);
      requests.push({ url: resource, options });
      if (resource.includes('api.github.com')) return jsonResponse({ workflow_runs: [] });
      if (resource.endsWith('/status')) return jsonResponse({ components: [] });
      if (resource.endsWith('/preflight')) return jsonResponse({ ok: true, checks: [{ id: 'docker', status: 'passed' }] });
      if (resource.endsWith('/deployments')) return jsonResponse({ id: 'deployment-1', status: 'queued' }, 202);
      throw new Error(`Unexpected request: ${resource}`);
    },
  });
  await releases.acceptCallback({
    type: 'build',
    releaseId: 'build-1',
    status: 'succeeded',
    targets: ['platform'],
    artifacts: [artifact()],
    revision: 'c'.repeat(40),
  });

  const deployment = await releases.dispatchDeployment({
    action: 'deploy',
    buildId: 'build-1',
    components: ['platform'],
    requestedBy: 'admin',
  });
  assert.equal(deployment.id, 'deployment-1');
  assert.equal(deployment.artifacts[0].reference, `${imageRepository}@${digest}`);
  const request = requests.find((item) => item.url.endsWith('/deployments'));
  assert.equal(JSON.parse(request.options.body).artifacts[0].digest, digest);
});

test('release preflight blocks deployment while a critical incident is active', async () => {
  const releases = createReleaseService({
    config: enabledConfig({ deployHookUrl: 'http://runner/', deployHookToken: 'd'.repeat(32) }),
    operationsStore: { listIncidents: async () => [{ severity: 'critical' }] },
    fetchImpl: async (url) => String(url).endsWith('/preflight')
      ? jsonResponse({ ok: true, checks: [] })
      : jsonResponse({ components: [] }),
  });
  const preflight = await releases.getPreflight({ components: ['platform'] });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.checks.find((check) => check.id === 'critical_incidents').status, 'blocked');
});
