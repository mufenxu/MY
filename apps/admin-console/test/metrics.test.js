import assert from 'node:assert/strict';
import test from 'node:test';
import { createMetrics } from '../src/metrics.js';

test('proxy metrics use bounded labels and are exposed to Prometheus', async () => {
  const metrics = createMetrics();
  metrics.recordProxy({
    service: 'core',
    outcome: 'error',
    statusClass: '5xx',
    errorKind: 'upstream',
    durationMs: 125,
  });
  metrics.recordProxy({
    service: '/attacker-controlled/path',
    outcome: 'unexpected',
    statusClass: '599-custom',
    errorKind: 'secret-value',
    durationMs: -1,
  });

  const output = await metrics.render();
  assert.match(output, /my_platform_proxy_requests_total\{service="core",outcome="error",status_class="5xx",error_kind="upstream"\} 1/);
  assert.match(output, /my_platform_proxy_requests_total\{service="other",outcome="success",status_class="unknown",error_kind="other"\} 1/);
  assert.doesNotMatch(output, /attacker-controlled|secret-value/);
});
