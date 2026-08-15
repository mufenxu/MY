import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectCiEnvContract, loadCiEnvContractInputs } from './check-ci-env-contract.mjs';

test('CI environment generator covers the required Compose contract', () => {
  assert.deepEqual(inspectCiEnvContract(loadCiEnvContractInputs()), []);
});

test('CI environment contract reports a missing required variable', () => {
  const inputs = loadCiEnvContractInputs();
  inputs.generator = inputs.generator.replace(/^\s{2}PLATFORM_AUTH_ENCRYPTION_KEY:.*\r?\n/m, '');

  assert.deepEqual(inspectCiEnvContract(inputs), [
    'CI environment generator is missing required Compose variable PLATFORM_AUTH_ENCRYPTION_KEY',
  ]);
});

test('platform API receives the external authentication configuration', () => {
  const { compose } = loadCiEnvContractInputs();

  for (const key of [
    'PLATFORM_EXTERNAL_AUTH_PRIVATE_KEY',
    'PLATFORM_EXTERNAL_AUTH_PUBLIC_KEY',
    'PLATFORM_EXTERNAL_AUTH_KEY_ID',
    'PLATFORM_EXTERNAL_AUTH_TOKEN_TTL_SECONDS',
  ]) {
    assert.match(compose, new RegExp(`^\\s{6}${key}: \\$\\{${key}:[^}]+}`, 'm'));
  }
});
