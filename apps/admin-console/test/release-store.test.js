import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryReleaseStore } from '../src/release-store.js';

test('release store keeps builds ordered and records timeline updates', async () => {
  let index = 0;
  const times = [
    new Date('2026-07-19T01:00:00Z'),
    new Date('2026-07-19T02:00:00Z'),
    new Date('2026-07-19T03:00:00Z'),
  ];
  const store = createMemoryReleaseStore({
    idFactory: () => `id-${index}`,
    now: () => times[Math.min(index++, times.length - 1)],
  });
  const first = await store.createBuild({ requestedBy: 'admin' });
  const second = await store.createBuild({ requestedBy: 'operator' });
  await store.updateBuild(first.id, { status: 'succeeded' }, { status: 'succeeded' });
  assert.deepEqual((await store.listBuilds()).map((item) => item.id), [second.id, first.id]);
  assert.equal((await store.getBuild(first.id)).timeline[0].status, 'succeeded');
});
