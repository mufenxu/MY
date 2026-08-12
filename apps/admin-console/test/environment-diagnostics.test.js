import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvironmentDiagnostics } from '../src/environment-diagnostics.js';

function config(overrides = {}) {
  return {
    deployHookUrl: 'http://deployment-runner:22104/',
    deployHookToken: 't'.repeat(32),
    workspaceRoot: 'C:\\workspace',
    ...overrides,
  };
}

test('environment diagnostics caches sidecar reports and supports explicit refresh', async () => {
  let calls = 0;
  const diagnostics = createEnvironmentDiagnostics({
    config: config(),
    now: () => new Date('2026-08-13T00:00:00.000Z'),
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.headers.Authorization, `Bearer ${'t'.repeat(32)}`);
      return new Response(JSON.stringify({
        checkedAt: `2026-08-13T00:00:0${calls}.000Z`,
        summary: { total: 1, state: 'healthy' },
        variables: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const first = await diagnostics.getReport();
  const cached = await diagnostics.getReport();
  const refreshed = await diagnostics.getReport({ refresh: true });
  assert.equal(first.checkedAt, cached.checkedAt);
  assert.notEqual(refreshed.checkedAt, first.checkedAt);
  assert.equal(calls, 2);
});

test('environment diagnostics returns an unavailable report without leaking upstream details', async () => {
  const diagnostics = createEnvironmentDiagnostics({
    config: config(),
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED token=private'); },
  });

  const report = await diagnostics.getReport();
  assert.equal(report.available, false);
  assert.equal(report.summary.state, 'unavailable');
  assert.match(report.issue, /部署诊断服务暂不可用/);
  assert.equal(JSON.stringify(report).includes('private'), false);
});
