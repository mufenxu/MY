import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  loadImageBuildGraph,
  releaseArtifactTargets,
  resolveChangedImageTargets,
  resolveRequestedImageTargets,
} from './resolve-image-targets.mjs';

test('shared package changes resolve every image that copies the package', async () => {
  const graph = await loadImageBuildGraph();
  assert.deepEqual(resolveChangedImageTargets(['packages/platform-browser-runtime/index.js'], graph), ['core', 'exam']);
  assert.deepEqual(
    resolveChangedImageTargets(['packages/platform-auth/index.cjs'], graph),
    ['platform', 'core', 'exam', 'notification', 'campus', 'iot'],
  );
});

test('manual aliases, global rules, and release artifact filtering are deterministic', async () => {
  const graph = await loadImageBuildGraph();
  assert.deepEqual(resolveRequestedImageTargets('notification-service,platform-api', graph), ['platform', 'notification']);
  assert.deepEqual(resolveChangedImageTargets(['.github/workflows/aliyun-acr.yml'], graph), Object.keys(graph.targets));
  assert.equal(releaseArtifactTargets(['platform', 'runner', 'core'], graph).join(','), 'platform,core');
  assert.throws(() => resolveRequestedImageTargets('unknown', graph), /Unknown image target/);
});

test('dependency graph Dockerfiles exist and the ACR workflow consumes the resolver', async () => {
  const graph = await loadImageBuildGraph();
  for (const metadata of Object.values(graph.targets)) await access(new URL(`../${metadata.dockerfile}`, import.meta.url));
  const workflow = await readFile(new URL('../.github/workflows/aliyun-acr.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node scripts\/resolve-image-targets\.mjs/);
  assert.match(workflow, /packages\/platform-browser-runtime\/\*\*/);
  assert.match(workflow, /config\/image-build-targets\.json/);
});
