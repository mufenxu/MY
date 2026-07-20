import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTopology, loadWorkspaceInputs } from './check-service-topology.mjs';

test('workspace topology matches the canonical contract', () => {
  assert.deepEqual(inspectTopology(loadWorkspaceInputs()), []);
});

test('topology inspection rejects direct service exposure and legacy runtime domains', () => {
  const inputs = loadWorkspaceInputs();
  inputs.topology.services.find((service) => service.id === 'campus').internalUrl = 'http://platform-api:22100';
  inputs.runtimeSources['services/core-api/routes/iot.js'] += '\nconst legacy = "https://mqttapi.pxyb.cn";\n';
  const errors = inspectTopology(inputs);
  assert.ok(
    errors.some((error) => error.includes('production Compose exposes a host port')),
    errors.join('\n'),
  );
  assert.ok(errors.some((error) => error.includes('legacy public domain')), errors.join('\n'));
});
