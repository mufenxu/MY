import assert from 'node:assert/strict';
import test from 'node:test';
import { ReleaseOperationError, createReleaseService } from '../src/release-service.js';

function config(overrides = {}) {
  return {
    githubRepository: 'owner/repository',
    githubToken: '',
    githubWorkflow: 'aliyun-acr.yml',
    githubRef: 'main',
    releaseActionsEnabled: false,
    deployHookUrl: '',
    deployHookToken: '',
    releaseImages: { platform: 'registry/platform:sha-123' },
    releaseRevision: '1234567890abcdef',
    releaseDeployedAt: '2026-07-18T12:00:00Z',
    ...overrides,
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

test('release builds dispatch only allowlisted targets with immutable tags enabled', async () => {
  const requests = [];
  const releases = createReleaseService({
    config: config({ githubToken: 'token', releaseActionsEnabled: true }),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return options.method === 'POST'
        ? { ok: true, status: 204 }
        : { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    },
  });

  await releases.dispatchBuild({ targets: ['platform', 'core'] });
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(body.inputs, { targets: 'platform,core', push_sha_tags: 'true' });
  await assert.rejects(
    releases.dispatchBuild({ targets: ['platform;shutdown'] }),
    (error) => error.code === 'INVALID_RELEASE_TARGET',
  );
});

test('deployment hook rejects unsafe image references before making a request', async () => {
  let called = false;
  const releases = createReleaseService({
    config: config({
      githubToken: 'token',
      releaseActionsEnabled: true,
      deployHookUrl: 'http://deploy-runner.internal/',
      deployHookToken: 'd'.repeat(32),
    }),
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({ accepted: true }) };
    },
  });
  await assert.rejects(
    releases.dispatchDeployment({ action: 'rollback', component: 'platform', image: 'image:tag;rm -rf /' }),
    (error) => error.code === 'INVALID_IMAGE_REFERENCE',
  );
  assert.equal(called, false);
});

