import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestDiagnostics, diagnosisFor } from '../src/request-diagnostics.js';

test('request diagnostics distinguish gateway routing failures from service failures', async () => {
  const requests = [];
  const diagnostics = createRequestDiagnostics({
    services: [{ id: 'core', name: 'Core', shortName: 'Core', baseUrl: 'http://core:3045', healthPath: '/health' }],
    publicOrigin: 'https://platform.example',
    idFactory: () => 'trace-1',
    fetchImpl: async (url, options) => {
      requests.push({ url, requestId: options.headers['X-Request-Id'] });
      return url.startsWith('https://')
        ? new Response('{}', { status: 502, headers: { 'X-Request-Id': 'gateway-request' } })
        : new Response('{}', { status: 200 });
    },
  });
  const result = await diagnostics.run({ serviceId: 'core', parentRequestId: 'console-request' });
  assert.equal(result.traces[0].diagnosis, 'gateway_or_public_route_failure');
  assert.deepEqual(result.traces[0].stages.map((stage) => stage.id), ['console', 'public_gateway', 'service_direct']);
  assert.equal(result.traces[0].stages[0].requestId, 'console-request');
  assert.equal(requests.every((request) => request.requestId === 'diag-trace-1'), true);
});

test('diagnosis matrix reports end-to-end health only when both probes pass', () => {
  assert.equal(diagnosisFor({ state: 'passed' }, { state: 'passed' }), 'end_to_end_healthy');
  assert.equal(diagnosisFor({ state: 'failed' }, { state: 'failed' }), 'service_or_dependency_failure');
});
