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

function binaryResponse(buffer, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

function zipStoredText(filename, content) {
  const name = Buffer.from(filename);
  const data = Buffer.from(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(0, 6);
  local.writeUInt32LE(0, 10);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(0, 8);
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const localSize = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(localSize, 16);
  return Buffer.concat([local, name, data, central, name, end]);
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

test('release summary keeps GitHub-only runs visible after release center builds exist', async () => {
  const store = createMemoryReleaseStore();
  await store.createBuild({
    id: 'release-center-build',
    status: 'succeeded',
    source: 'manual',
    targets: ['platform'],
    artifacts: [artifact()],
    revision: 'a'.repeat(40),
    workflowRun: { id: '100', attempt: 1, url: 'https://github.example/runs/100', actor: 'admin', event: 'workflow_dispatch' },
    createdAt: '2026-07-20T10:00:00Z',
    completedAt: '2026-07-20T10:04:00Z',
  });
  const releases = createReleaseService({
    config: config({ githubToken: 'token' }),
    store,
    fetchImpl: async () => jsonResponse({
      workflow_runs: [
        {
          id: 200,
          name: 'Build and push Aliyun ACR images',
          event: 'push',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          head_sha: 'b'.repeat(40),
          created_at: '2026-07-20T11:00:00Z',
          run_started_at: '2026-07-20T11:00:02Z',
          updated_at: '2026-07-20T11:05:00Z',
          html_url: 'https://github.example/runs/200',
          actor: { login: 'developer' },
        },
        {
          id: 100,
          name: 'Build and push Aliyun ACR images',
          event: 'workflow_dispatch',
          status: 'completed',
          conclusion: 'success',
          head_branch: 'main',
          head_sha: 'a'.repeat(40),
          created_at: '2026-07-20T10:00:00Z',
          run_started_at: '2026-07-20T10:00:02Z',
          updated_at: '2026-07-20T10:04:00Z',
          html_url: 'https://github.example/runs/100',
          actor: { login: 'admin' },
        },
      ],
    }),
  });

  const summary = await releases.getSummary();
  assert.deepEqual(summary.builds.map((item) => item.id), ['github-200', 'release-center-build']);
  assert.equal(summary.builds[0].observedOnly, true);
  assert.equal(summary.builds[0].status, 'succeeded');
  assert.equal(summary.builds[0].workflowRun.url, 'https://github.example/runs/200');
  assert.equal(summary.builds[1].observedOnly, undefined);
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

test('release summary restores missing artifacts from GitHub run artifact manifest', async () => {
  const store = createMemoryReleaseStore({
    now: () => new Date('2026-07-24T11:16:58Z'),
  });
  const coreArtifact = artifact('core');
  const artifactManifest = [
    coreArtifact.component,
    coreArtifact.image,
    coreArtifact.digest,
    coreArtifact.reference,
    coreArtifact.shaTag,
  ].join('\t');
  const requests = [];
  const releases = createReleaseService({
    config: enabledConfig(),
    store,
    idFactory: () => 'e5ad557074e4',
    fetchImpl: async (url, options = {}) => {
      const resource = String(url);
      requests.push(resource);
      if (options.method === 'POST') return jsonResponse(null, 204);
      if (resource.endsWith('/actions/runs/300/artifacts?per_page=100')) {
        return jsonResponse({
          artifacts: [{
            name: 'release-artifacts-e5ad557074e4',
            expired: false,
            archive_download_url: 'https://api.github.example/artifacts/300.zip',
          }],
        });
      }
      if (resource === 'https://api.github.example/artifacts/300.zip') {
        return binaryResponse(zipStoredText('release-artifacts.tsv', `${artifactManifest}\n`));
      }
      if (resource.includes('/actions/workflows/aliyun-acr.yml/runs?per_page=30')) {
        return jsonResponse({
          workflow_runs: [{
            id: 300,
            name: 'Build and push Aliyun ACR images',
            event: 'workflow_dispatch',
            status: 'completed',
            conclusion: 'success',
            head_branch: 'main',
            head_sha: 'e5ad557074e4aabbccddeeff0011223344556677',
            created_at: '2026-07-24T11:16:58Z',
            run_started_at: '2026-07-24T11:16:58Z',
            updated_at: '2026-07-24T11:19:56Z',
            html_url: 'https://github.example/runs/300',
            actor: { login: 'admin' },
          }],
        });
      }
      throw new Error(`Unexpected request: ${resource}`);
    },
  });

  await releases.dispatchBuild({ targets: ['core'], requestedBy: 'admin' });
  const summary = await releases.getSummary();
  assert.equal(summary.builds[0].id, 'e5ad557074e4');
  assert.equal(summary.builds[0].status, 'succeeded');
  assert.equal(summary.builds[0].artifacts[0].component, 'core');
  assert.equal(summary.builds[0].artifactSyncStatus, undefined);
  assert.equal((await store.getBuild('e5ad557074e4')).artifacts[0].reference, coreArtifact.reference);
  assert.ok(requests.includes('https://api.github.example/artifacts/300.zip'));
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

test('deployment can preserve the mutable latest tag by explicit request', async () => {
  const store = createMemoryReleaseStore();
  const requests = [];
  const releases = createReleaseService({
    config: enabledConfig({
      deployHookUrl: 'http://deploy-runner.internal/',
      deployHookToken: 'd'.repeat(32),
    }),
    store,
    idFactory: () => 'deployment-tag-mode',
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
      if (resource.endsWith('/deployments')) return jsonResponse({ id: 'deployment-tag-mode', status: 'queued' }, 202);
      throw new Error(`Unexpected request: ${resource}`);
    },
  });
  await releases.acceptCallback({
    type: 'build',
    releaseId: 'build-tag-mode',
    status: 'succeeded',
    targets: ['platform'],
    artifacts: [artifact()],
    revision: 'd'.repeat(40),
  });

  const deployment = await releases.dispatchDeployment({
    action: 'deploy',
    buildId: 'build-tag-mode',
    components: ['platform'],
    imageReferenceMode: 'tag',
    requestedBy: 'admin',
  });
  assert.equal(deployment.imageReferenceMode, 'tag');
  const request = requests.find((item) => item.url.endsWith('/deployments'));
  const body = JSON.parse(request.options.body);
  assert.equal(body.imageReferenceMode, 'tag');
  assert.equal(body.artifacts[0].image, `${imageRepository}:platform-latest`);
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
