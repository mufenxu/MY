import assert from 'node:assert/strict';
import test from 'node:test';
import { configureSidecar, parseEnv } from './configure-deployment-sidecar.mjs';

const callbackToken = 'c'.repeat(43);
const deployToken = 'd'.repeat(43);
const base = [
  'PLATFORM_RELEASE_ACTIONS_ENABLED=false',
  `PLATFORM_RELEASE_CALLBACK_TOKEN=${callbackToken}`,
  'PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY=registry.example.com/team/platform',
  'PLATFORM_GITHUB_TOKEN=github_token_with_sufficient_length',
  'UNRELATED=value=with=equals',
  '',
].join('\n');

test('Sidecar configuration preserves unrelated values and generates a separate token', () => {
  const values = parseEnv(configureSidecar(base, 'configure', () => deployToken, '/srv/my-platform', '998'));
  assert.equal(values.get('UNRELATED'), 'value=with=equals');
  assert.equal(values.get('PLATFORM_RELEASE_ACTIONS_ENABLED'), 'false');
  assert.equal(values.get('COMPOSE_PROFILES'), 'release');
  assert.equal(values.get('PLATFORM_DEPLOY_HOOK_URL'), 'http://deployment-runner:22104');
  assert.equal(values.get('PLATFORM_DEPLOY_HOOK_TOKEN'), deployToken);
  assert.equal(values.get('DEPLOYMENT_RUNNER_IMAGE'), 'registry.example.com/team/platform:deployment-runner-latest');
  assert.equal(values.get('DEPLOY_RUNNER_WORKSPACE_ROOT'), '/srv/my-platform');
  assert.equal(values.get('DEPLOY_RUNNER_DOCKER_GID'), '998');
  assert.equal(values.get('DEPLOY_RUNNER_ALLOW_MONGODB'), 'false');
});

test('release actions require complete GitHub configuration', () => {
  assert.throws(() => configureSidecar(base.replace(/^PLATFORM_GITHUB_TOKEN=.*$/m, ''), 'enable-actions', () => deployToken, '/srv/my-platform'), /PLATFORM_GITHUB_TOKEN/);
  const values = parseEnv(configureSidecar(base, 'enable-actions', () => deployToken, '/srv/my-platform', '998'));
  assert.equal(values.get('PLATFORM_RELEASE_ACTIONS_ENABLED'), 'true');
});

test('disable returns the platform to read-only without deleting the deployment token', () => {
  const configured = configureSidecar(base, 'configure', () => deployToken, '/srv/my-platform', '998');
  const values = parseEnv(configureSidecar(configured, 'disable'));
  assert.equal(values.get('PLATFORM_RELEASE_ACTIONS_ENABLED'), 'false');
  assert.equal(values.get('COMPOSE_PROFILES'), '');
  assert.equal(values.get('PLATFORM_DEPLOY_HOOK_URL'), '');
  assert.equal(values.get('PLATFORM_DEPLOY_HOOK_TOKEN'), deployToken);
});

test('Sidecar configuration rejects paths that cannot match the Linux Docker host', () => {
  assert.throws(() => configureSidecar(base, 'configure', () => deployToken, 'relative/path'), /absolute Linux host path/);
  assert.throws(() => configureSidecar(base, 'configure', () => deployToken, 'C:\\workspace'), /absolute Linux host path/);
});

test('Sidecar configuration rejects a non-numeric Docker Socket group', () => {
  assert.throws(() => configureSidecar(base, 'configure', () => deployToken, '/srv/my-platform', 'docker'), /numeric group ID/);
});
