/**
 * 接口契约测试（notification-service）。
 *
 * 只断言规范承诺的不变量，不依赖外部企业微信：
 * - /livez /healthz、/readyz、/version 的形状
 * - 未知路径返回 JSON 404（不是 Express 的 HTML 页）
 * - 错误响应带 ok/success=false，同时保留 errcode/errmsg 旧字段
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NOTIFY_API_KEY ||= 'contract-test-key';
process.env.WECOM_CORP_ID ||= 'contract-corp';
process.env.WECOM_AGENT_ID ||= '10001';
process.env.WECOM_SECRET ||= 'contract-secret';

const { createApp } = require('../src/app');

const config = {
  apiKey: 'contract-api-key-value',
  internalCallers: ['core-api', 'platform-api'],
  managementCallers: ['admin-console'],
  historyEncryptionKey: Buffer.alloc(32, 7).toString('base64url'),
  historyRetentionDays: 30,
  tokenCacheMargin: 120,
  wecom: { corpId: 'corp', secret: 'secret', agentId: 10001 },
};

async function withServer(wecomClient, callback) {
  const app = createApp({ config, wecomClient });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function get(port, pathname, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('健康三端点形状一致', async () => withServer({}, async (port) => {
  const livez = await get(port, '/livez');
  assert.equal(livez.status, 200);
  assert.equal(livez.body.status, 'ok');
  assert.equal(livez.body.service, 'notification-service');
  assert.equal(typeof livez.body.version, 'string');

  const readyz = await get(port, '/readyz');
  assert.ok([200, 503].includes(readyz.status));
  assert.match(readyz.body.status, /^(ready|not-ready)$/);

  const version = await get(port, '/version');
  assert.equal(version.status, 200);
  assert.equal(version.body.service, 'notification-service');
  assert.ok(version.body.node);
}));

test('未知路径返回 JSON 404，而不是 HTML', async () => withServer({}, async (port) => {
  const response = await get(port, '/definitely-not-a-route');

  assert.equal(response.status, 404);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'ROUTE_NOT_FOUND');
  assert.ok(response.body.requestId);
}));

test('未带凭据的发送请求返回统一信封，并保留 errcode', async () => withServer({}, async (port) => {
  const response = await get(port, '/notify', {}, 'POST');

  assert.equal(response.status, 401);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.success, false);
  // 外部对接方读的是这个旧字段，不能删
  assert.equal(response.body.errcode, 401);
}));

test('OpenAPI 文档可机读', async () => withServer({}, async (port) => {
  const response = await get(port, '/openapi.json');

  assert.equal(response.status, 200);
  assert.equal(response.body.openapi, '3.1.0');
  assert.ok(Object.keys(response.body.paths || {}).length > 0);
}));
