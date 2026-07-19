import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from '../src/client/api.js';

test('requestJson applies console headers and returns JSON', async () => {
  let requestOptions;
  const result = await requestJson('/api/example', {
    method: 'POST',
    body: JSON.stringify({ ok: true }),
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      return new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.deepEqual(result, { value: 42 });
  assert.equal(requestOptions.credentials, 'same-origin');
  assert.equal(requestOptions.headers['X-Platform-Request'], 'console');
  assert.equal(requestOptions.headers['Content-Type'], 'application/json');
});

test('requestJson aborts stalled requests at the configured timeout', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted')), { once: true });
  });

  await assert.rejects(
    requestJson('/api/stalled', { fetchImpl, timeoutMs: 5 }),
    (error) => error.code === 'REQUEST_TIMEOUT' && /超时/.test(error.message),
  );
});

test('requestJson preserves caller cancellation and structured HTTP errors', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestJson('/api/cancelled', {
      signal: controller.signal,
      fetchImpl: async (_url, { signal }) => {
        if (signal.aborted) throw signal.reason || new Error('aborted');
        return new Response('{}');
      },
    }),
    (error) => error.code === 'REQUEST_ABORTED',
  );

  await assert.rejects(
    requestJson('/api/failed', {
      fetchImpl: async () => new Response(JSON.stringify({ error: '服务拒绝', code: 'DENIED', details: { retry: false } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    }),
    (error) => error.status === 403 && error.code === 'DENIED' && error.details.retry === false,
  );
});
