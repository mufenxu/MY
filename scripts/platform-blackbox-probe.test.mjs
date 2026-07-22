import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendBlackboxSpool,
  flushBlackboxSpool,
  parseBlackboxTargets,
  probeBlackboxTarget,
  readBlackboxSpool,
} from './platform-blackbox-probe.mjs';

test('blackbox target configuration is structured and rejects duplicates', () => {
  assert.deepEqual(parseBlackboxTargets(JSON.stringify([
    { id: 'platform-edge', url: 'https://pxyb.cn/api/readyz', expectedStatus: 200 },
  ])), [{ id: 'platform-edge', url: 'https://pxyb.cn/api/readyz', expectedStatus: 200 }]);
  assert.throws(() => parseBlackboxTargets('[{"id":"x","url":"https://a.example"},{"id":"x","url":"https://b.example"}]'), /duplicate/);
});

test('blackbox probe reports expected HTTP responses and failures truthfully', async () => {
  const target = { id: 'platform', url: 'https://pxyb.cn/api/readyz', expectedStatus: 200 };
  const healthy = await probeBlackboxTarget(target, {
    fetchImpl: async () => new Response('{}', { status: 200 }),
    now: () => new Date('2026-07-22T00:00:00.000Z'),
  });
  assert.equal(healthy.state, 'healthy');
  assert.equal(healthy.httpStatus, 200);

  const offline = await probeBlackboxTarget(target, {
    fetchImpl: async () => { throw new TypeError('network failed'); },
    now: () => new Date('2026-07-22T00:00:30.000Z'),
  });
  assert.equal(offline.state, 'offline');
  assert.equal(offline.reason, 'network_error');
});

test('blackbox spool preserves samples across ingest failures and drains after recovery', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'my-blackbox-'));
  const filename = path.join(directory, 'spool.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const samples = [
    { targetId: 'platform', state: 'offline', recordedAt: '2026-07-22T00:00:00.000Z' },
    { targetId: 'platform', state: 'healthy', recordedAt: '2026-07-22T00:00:30.000Z' },
  ];
  await appendBlackboxSpool(filename, samples);
  await assert.rejects(flushBlackboxSpool({
    filename,
    ingestUrl: 'https://pxyb.cn/api/internal/blackbox/samples',
    token: 'x'.repeat(32),
    probeId: 'outside-a',
    fetchImpl: async () => new Response('{}', { status: 503 }),
  }), /HTTP 503/);
  assert.equal((await readBlackboxSpool(filename)).length, 2);

  const deliveries = [];
  await flushBlackboxSpool({
    filename,
    ingestUrl: 'https://pxyb.cn/api/internal/blackbox/samples',
    token: 'x'.repeat(32),
    probeId: 'outside-a',
    fetchImpl: async (url, options) => {
      deliveries.push(JSON.parse(options.body));
      return new Response('{}', { status: 202 });
    },
  });
  assert.equal(deliveries[0].samples.length, 2);
  assert.deepEqual(await readBlackboxSpool(filename), []);
});

test('blackbox spool skips a partial crash record and preserves valid samples', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'my-blackbox-corrupt-'));
  const filename = path.join(directory, 'spool.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sample = { targetId: 'platform', state: 'offline', recordedAt: '2026-07-22T00:00:00.000Z' };
  const recovered = { targetId: 'platform', state: 'healthy', recordedAt: '2026-07-22T00:00:30.000Z' };
  await writeFile(filename, `${JSON.stringify(sample)}\n{"targetId":"partial`, { mode: 0o600 });
  await appendBlackboxSpool(filename, [recovered]);

  assert.deepEqual(await readBlackboxSpool(filename), [sample, recovered]);
});

test('blackbox ingest is aborted at its request deadline without dropping the spool', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'my-blackbox-timeout-'));
  const filename = path.join(directory, 'spool.jsonl');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await appendBlackboxSpool(filename, [
    { targetId: 'platform', state: 'offline', recordedAt: '2026-07-22T00:00:00.000Z' },
  ]);

  await assert.rejects(flushBlackboxSpool({
    filename,
    ingestUrl: 'https://pxyb.cn/api/internal/blackbox/samples',
    token: 'x'.repeat(32),
    probeId: 'outside-a',
    timeoutMs: 10,
    fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }), /timed out|timeout/i);
  assert.equal((await readBlackboxSpool(filename)).length, 1);
});
