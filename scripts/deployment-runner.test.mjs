import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadRunnerConfig,
  normalizeComponents,
  parseEnvSource,
  updateEnvSource,
  validateRunnerArtifact,
} from './deployment-runner.mjs';

test('deployment runner preserves unrelated environment values', () => {
  const source = '# production\nPLATFORM_API_IMAGE=registry/old:tag\nSECRET=value=with=equals\n';
  const updated = updateEnvSource(source, {
    PLATFORM_API_IMAGE: 'registry/repository@sha256:abc',
    CORE_API_IMAGE: 'registry/repository@sha256:def',
  });
  const values = parseEnvSource(updated);
  assert.equal(values.get('PLATFORM_API_IMAGE'), 'registry/repository@sha256:abc');
  assert.equal(values.get('CORE_API_IMAGE'), 'registry/repository@sha256:def');
  assert.equal(values.get('SECRET'), 'value=with=equals');
  assert.match(updated, /^# production/m);
});

test('deployment runner rejects unknown components and mutable images', () => {
  assert.throws(() => normalizeComponents(['platform', 'unknown']), /部署组件无效/);
  const config = loadRunnerConfig({ DEPLOY_RUNNER_ALLOWED_IMAGE_REPOSITORY: 'registry.example.com/team/app' });
  assert.throws(() => validateRunnerArtifact({
    component: 'platform',
    digest: `sha256:${'a'.repeat(64)}`,
    reference: 'registry.example.com/team/app:latest',
  }, config), /不可变 Digest/);
});

test('deployment runner accepts an allowlisted digest reference', () => {
  const config = loadRunnerConfig({ DEPLOY_RUNNER_ALLOWED_IMAGE_REPOSITORY: 'registry.example.com/team/app' });
  const digest = `sha256:${'b'.repeat(64)}`;
  const artifact = validateRunnerArtifact({
    component: 'platform',
    digest,
    reference: `registry.example.com/team/app@${digest}`,
    image: 'registry.example.com/team/app:platform-api-latest',
    shaTag: 'registry.example.com/team/app:platform-api-latest-deadbeef0000',
  }, config);
  assert.equal(artifact.component, 'platform');
  assert.equal(artifact.digest, digest);
});
