import assert from 'node:assert/strict';
import test from 'node:test';
import {
  componentObservation,
  environmentLabel,
  releaseStateClass,
  releaseStatusLabel,
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
