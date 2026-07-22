import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { withFetchServer as withServer } from '../test-support/fetch-server.js';

test('operational intelligence routes remain authenticated and pass bounded query inputs', async () => {
  const protectedConfig = { ...loadConfig({ NODE_ENV: 'development' }), authDisabled: false, metricsToken: 'm'.repeat(32) };
  const protectedApp = createApp({
    config: protectedConfig,
    operationalSearchManager: { search: async () => ({ results: [] }) },
    sloManager: { getReport: async () => ({ services: [] }) },
    changeCalendarManager: { list: async () => ({ events: [] }) },
  });
  await withServer(protectedApp, async (origin) => {
    assert.equal((await fetch(`${origin}/api/operations/search?q=core`)).status, 401);
    assert.equal((await fetch(`${origin}/api/operations/slo?window=7d`)).status, 401);
    assert.equal((await fetch(`${origin}/api/operations/change-calendar`)).status, 401);
  });

  const calls = [];
  const developmentConfig = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const app = createApp({
    config: developmentConfig,
    operationalSearchManager: { search: async (input) => { calls.push(['search', input]); return { results: [] }; } },
    sloManager: { getReport: async (input) => { calls.push(['slo', input]); return { services: [] }; } },
    changeCalendarManager: { list: async (input) => { calls.push(['calendar', input]); return { events: [] }; } },
  });
  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/operations/search?q=core&type=service&limit=5`)).status, 200);
    assert.equal((await fetch(`${origin}/api/operations/slo?window=30d&serviceId=core-api`)).status, 200);
    assert.equal((await fetch(`${origin}/api/operations/change-calendar?type=release&page=2&pageSize=10`)).status, 200);
  });
  assert.deepEqual(calls, [
    ['search', { q: 'core', type: 'service', limit: '5' }],
    ['slo', { window: '30d', serviceId: 'core-api' }],
    ['calendar', { from: undefined, to: undefined, type: 'release', serviceId: undefined, page: '2', pageSize: '10' }],
  ]);
});
