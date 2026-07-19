import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createDeploymentRunner,
  loadRunnerConfig,
  normalizeComponents,
  parseEnvSource,
  updateEnvSource,
  validateRunnerArtifact,
  validateWorkspaceMount,
} from './deployment-runner.mjs';

async function withServer(server, callback) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

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

test('deployment runner requires matching host and container workspace paths', () => {
  assert.equal(validateWorkspaceMount({ Mounts: [{ Source: '/srv/my-platform', Destination: '/srv/my-platform' }] }, '/srv/my-platform'), '/srv/my-platform');
  assert.throws(() => validateWorkspaceMount({ Mounts: [{ Source: '/host/project', Destination: '/workspace' }] }, '/workspace'), /identical host\/container workspace path/);
});

test('deployment runner exposes only a minimal unauthenticated health endpoint', async () => {
  const runner = createDeploymentRunner({
    config: loadRunnerConfig({
      DEPLOY_RUNNER_ENABLED: 'true',
      DEPLOY_RUNNER_TOKEN: 't'.repeat(32),
      DEPLOY_RUNNER_CALLBACK_TOKEN: 'c'.repeat(32),
      DEPLOY_RUNNER_CALLBACK_URL: 'http://platform-api:22100/api/releases/callback',
      DEPLOY_RUNNER_ALLOWED_IMAGE_REPOSITORY: 'registry.example.com/team/app',
    }),
  });
  await withServer(runner.createServer(), async (origin) => {
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal((await fetch(`${origin}/status`)).status, 401);
  });
});

test('deployment Sidecar is backend-only and isolates the Docker socket from platform-api', async () => {
  const compose = await readFile(new URL('../infra/docker/compose.yml', import.meta.url), 'utf8');
  const dockerfile = await readFile(new URL('../deployment-runner.Dockerfile', import.meta.url), 'utf8');
  const sidecar = compose.slice(compose.indexOf('  deployment-runner:'), compose.indexOf('  platform-api:'));
  const platform = compose.slice(compose.indexOf('  platform-api:'), compose.indexOf('  core-api:'));
  assert.match(sidecar, /profiles: \["release"\]/);
  assert.match(sidecar, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
  assert.match(sidecar, /\.\.\/\.\.:\$\{DEPLOY_RUNNER_WORKSPACE_ROOT:\?Set DEPLOY_RUNNER_WORKSPACE_ROOT\}/);
  assert.match(sidecar, /DEPLOY_RUNNER_EXPECT_SELF_MOUNT: "true"/);
  assert.match(sidecar, /group_add:/);
  assert.match(sidecar, /DEPLOY_RUNNER_DOCKER_GID/);
  assert.doesNotMatch(sidecar, /:\/root\/\.docker/);
  assert.match(dockerfile, /^USER runner$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["node", "\/app\/scripts\/deployment-runner\.mjs"\]$/m);
  assert.match(sidecar, /- backend/);
  assert.doesNotMatch(sidecar, /^\s+ports:/m);
  assert.doesNotMatch(platform, /\/var\/run\/docker\.sock/);
});
