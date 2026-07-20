const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { issueServiceRequest } = require('@my-platform/platform-auth');
process.env.NOTIFY_API_KEY = 'module-test-key';
process.env.WECOM_CORP_ID = 'module-test-corp';
process.env.WECOM_AGENT_ID = '10001';
process.env.WECOM_SECRET = 'module-test-secret';
const { createApp } = require('../src/app');

const config = {
  apiKey: 'test-api-key-value',
  internalCallers: ['core-api', 'platform-api'],
  tokenCacheMargin: 120,
  wecom: { corpId: 'corp', secret: 'secret', agentId: 10001 },
};

async function withServer(client, callback) {
  const server = createApp({ config, wecomClient: client }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(server.address().port); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function request(port, { path = '/notify', apiKey, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? '' : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path, method: data ? 'POST' : 'GET',
      headers: { ...headers, ...(apiKey ? { 'X-API-KEY': apiKey } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
    }, (res) => {
      let response = '';
      res.on('data', (chunk) => { response += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(response) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('health endpoint is public', async () => withServer({}, async (port) => {
  assert.equal((await request(port, { path: '/healthz' })).status, 200);
}));

test('notification endpoint rejects an invalid API key', async () => withServer({}, async (port) => {
  assert.equal((await request(port, { body: {} })).status, 401);
}));

test('notification endpoint validates and forwards messages', async () => {
  const sent = [];
  await withServer({ sendMessage: async (payload) => { sent.push(payload); return { errcode: 0 }; } }, async (port) => {
    const response = await request(port, {
      apiKey: config.apiKey,
      body: { touser: 'alice', msg_type: 'text', data: { content: 'hello' } },
    });
    assert.equal(response.status, 200);
    assert.equal(sent.length, 1);
  });
});

test('notification endpoint accepts signed internal callers and rejects replay', async () => {
  const body = { touser: 'alice', msg_type: 'text', data: { content: 'hello' } };
  const serialized = JSON.stringify(body);
  const headers = issueServiceRequest({
    caller: 'core-api',
    secret: config.apiKey,
    method: 'POST',
    pathname: '/notify',
    body: serialized,
  });
  await withServer({ sendMessage: async () => ({ errcode: 0 }) }, async (port) => {
    assert.equal((await request(port, { body, headers })).status, 200);
    assert.equal((await request(port, { body, headers })).status, 401);
  });
});

test('notification endpoint returns validation errors safely', async () => withServer({ sendMessage: async () => ({}) }, async (port) => {
  const response = await request(port, { apiKey: config.apiKey, body: { msg_type: 'unknown', data: {} } });
  assert.equal(response.status, 400);
  assert.equal(response.body.errcode, 400);
}));
