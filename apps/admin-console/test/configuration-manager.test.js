import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigurationError, createConfigurationManager } from '../src/configuration-manager.js';
import { createMemoryConfigurationStore } from '../src/configuration-store.js';

function fixture({ enforceTwoPerson = true } = {}) {
  let settings = { alertingEnabled: true, monitorIntervalMs: 30000 };
  const updates = [];
  const operations = {
    getSettings: async () => structuredClone(settings),
    previewSettings: async (patch) => ({ ...settings, ...structuredClone(patch) }),
    updateSettings: async (next, actor) => {
      settings = structuredClone(next);
      updates.push({ settings, actor });
      return structuredClone(settings);
    },
  };
  const store = createMemoryConfigurationStore({
    idFactory: (() => { let id = 0; return () => `change-${++id}`; })(),
  });
  const manager = createConfigurationManager({ store, operations, enforceTwoPerson });
  return { manager, store, updates };
}

test('configuration changes require a different approver and create immutable versions', async () => {
  const { manager, updates } = fixture();
  const change = await manager.propose({
    settings: { alertingEnabled: false },
    summary: 'Silence alerts during migration',
    actor: 'alice',
  });
  assert.equal(change.status, 'pending');
  await assert.rejects(
    () => manager.approve(change.id, 'alice'),
    (error) => error instanceof ConfigurationError && error.code === 'CONFIGURATION_SELF_APPROVAL_FORBIDDEN',
  );

  const applied = await manager.approve(change.id, 'bob', 'Reviewed');
  assert.equal(applied.version, 2);
  assert.equal(applied.settings.alertingEnabled, false);
  assert.equal(updates[0].actor, 'bob');
  const overview = await manager.getOverview();
  assert.equal(overview.currentVersion, 2);
  assert.deepEqual(overview.versions.map((version) => version.version), [2, 1]);
});

test('rollback creates a new proposal and stale proposals become conflicted', async () => {
  const { manager } = fixture();
  const stale = await manager.propose({ settings: { monitorIntervalMs: 45000 }, summary: 'Slower monitor', actor: 'alice' });
  const first = await manager.propose({ settings: { alertingEnabled: false }, summary: 'Disable alerts', actor: 'carol' });
  await manager.approve(first.id, 'bob');
  await assert.rejects(() => manager.approve(stale.id, 'bob'), (error) => error.code === 'CONFIGURATION_VERSION_CONFLICT');

  const rollback = await manager.proposeRollback(1, { actor: 'alice', summary: 'Restore baseline' });
  assert.equal(rollback.kind, 'rollback');
  const result = await manager.approve(rollback.id, 'bob');
  assert.equal(result.version, 3);
  assert.equal(result.settings.alertingEnabled, true);
});
