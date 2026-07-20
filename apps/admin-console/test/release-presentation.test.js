import assert from 'node:assert/strict';
import test from 'node:test';
import {
  componentObservation,
  componentHistory,
  environmentLabel,
  releaseStateClass,
  releaseDuration,
  releaseIsActive,
  releaseStatusLabel,
  releaseTimingVerb,
  runtimeImageReference,
  runtimeStateSummary,
  runtimeVersionLabel,
  workflowNameLabel,
} from '../src/client/release-presentation.js';

test('release presentation localizes GitHub and runtime values shown in the release center', () => {
  assert.equal(environmentLabel('production'), '生产环境');
  assert.equal(workflowNameLabel('Build and push Aliyun ACR images'), '构建并推送阿里云 ACR 镜像');
  assert.equal(releaseStatusLabel('failure'), '失败');
  assert.equal(releaseStateClass('failure'), 'failure');
  assert.equal(runtimeStateSummary({ state: 'running', health: 'healthy' }), '运行中 · 健康');
});

test('observed tag-based containers are not mislabeled as unobserved', () => {
  const runtime = {
    observed: true,
    containerImage: 'registry.example.com/team/app:platform-api-latest',
    revision: '1234567890abcdef',
    digest: `sha256:${'a'.repeat(64)}`,
    imageId: `sha256:${'b'.repeat(64)}`,
    state: 'running',
    health: 'healthy',
  };
  assert.deepEqual(componentObservation({ runtime, observed: true, inSync: null }), {
    label: '已观测',
    className: 'observed',
  });
  assert.equal(runtimeImageReference(runtime), runtime.containerImage);
  assert.match(runtimeVersionLabel(runtime), /提交 1234567890ab/);
  assert.match(runtimeVersionLabel(runtime), /Digest sha256:/);
  assert.match(runtimeVersionLabel(runtime), /镜像 ID sha256:/);
});

test('missing containers remain explicitly unobserved', () => {
  assert.deepEqual(componentObservation({
    runtime: { observed: false, state: 'missing', health: 'unknown' },
    observed: false,
    inSync: null,
  }), { label: '未观测', className: '' });
});

test('component history matches the observed immutable image to build and deployment times', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const component = {
    id: 'platform',
    runtime: {
      digest,
      containerImage: 'registry.example.com/team/app:platform-api-latest',
    },
  };
  const history = componentHistory(component, [
    {
      id: 'build-1',
      status: 'succeeded',
      completedAt: '2026-07-20T15:41:22Z',
      targets: ['platform'],
      artifacts: [{ component: 'platform', digest, image: 'registry.example.com/team/app:platform-api-latest' }],
    },
  ], [
    {
      id: 'deployment-1',
      status: 'succeeded',
      completedAt: '2026-07-20T16:42:30Z',
      artifacts: [{ component: 'platform', digest, image: 'registry.example.com/team/app:platform-api-latest' }],
    },
  ]);
  assert.deepEqual(history, {
    buildId: 'build-1',
    buildAt: '2026-07-20T15:41:22Z',
    deploymentId: 'deployment-1',
    deploymentAt: '2026-07-20T16:42:30Z',
  });
});

test('release timing formats active waits, live runtimes and completed durations', () => {
  assert.equal(releaseIsActive('in_progress'), true);
  assert.equal(releaseIsActive('succeeded'), false);
  assert.equal(releaseTimingVerb('queued'), '已等待');
  assert.equal(releaseTimingVerb('in_progress'), '已运行');
  assert.equal(releaseDuration('2026-07-20T17:11:42Z', null, Date.parse('2026-07-20T17:18:06Z')), '06分 24秒');
  assert.equal(releaseDuration('2026-07-20T17:11:42Z', '2026-07-20T18:26:18Z'), '01时 14分 36秒');
  assert.equal(releaseDuration(null), '--');
});
