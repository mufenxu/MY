import assert from 'node:assert/strict';
import test from 'node:test';

import http from '../src/utils/http.js';

function stubFetch(t, implementation) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => { globalThis.fetch = original; });
}

// 永不返回，只在 signal 触发（或传入时已触发）时以 AbortError 拒绝——与浏览器的 fetch 行为一致。
const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
  const rejectAborted = () => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    reject(error);
  };
  if (signal.aborted) rejectAborted();
  else signal.addEventListener('abort', rejectAborted, { once: true });
});

test('a request that exceeds its timeout rejects with a readable TimeoutError', async (t) => {
  stubFetch(t, hangingFetch);

  await assert.rejects(
    http.get('/api/slow', { timeout: 5, showGlobalError: false }),
    (error) => {
      assert.equal(error.name, 'TimeoutError');
      assert.equal(error.message, '请求超时，请稍后再试');
      return true;
    },
  );
});

test('a caller-initiated abort is not reported as a timeout or network failure', async (t) => {
  stubFetch(t, hangingFetch);
  const seenByInterceptors = [];
  const id = http.interceptors.response.use(null, (error) => {
    seenByInterceptors.push(error);
    throw error;
  });
  t.after(() => { http.interceptors.response.handlers.splice(id, 1); });

  const controller = new AbortController();
  const pending = http.get('/api/cancelled', { signal: controller.signal, timeout: 60_000 });
  controller.abort();

  await assert.rejects(pending, (error) => error.name === 'AbortError');
  // 取消是预期行为，不进入全局错误拦截器，因此不会弹出「网络连接失败」。
  assert.deepEqual(seenByInterceptors, []);
});
