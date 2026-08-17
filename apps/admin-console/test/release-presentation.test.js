import assert from 'node:assert/strict';
import test from 'node:test';
import {
  environmentLabel,
  releaseStateClass,
  releaseDuration,
  releaseIsActive,
  releaseStatusLabel,
  releaseTimingVerb,
  workflowNameLabel,
} from '../src/client/release-presentation.js';

test('release presentation localizes GitHub values shown in the build center', () => {
  assert.equal(environmentLabel('production'), '生产环境');
  assert.equal(workflowNameLabel('Build and push Aliyun ACR images'), '构建并推送阿里云 ACR 镜像');
  assert.equal(releaseStatusLabel('failure'), '失败');
  assert.equal(releaseStateClass('failure'), 'failure');
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
