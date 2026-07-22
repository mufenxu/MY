const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { issueServiceRequest } = require('@my-platform/platform-auth');
process.env.NOTIFY_API_KEY = 'module-test-key';
process.env.WECOM_CORP_ID = 'module-test-corp';
process.env.WECOM_AGENT_ID = '10001';
process.env.WECOM_SECRET = 'module-test-secret';
const { createApp } = require('../src/app');

const historyEncryptionKey = Buffer.alloc(32, 7).toString('base64url');

const config = {
  apiKey: 'test-api-key-value',
  internalCallers: ['core-api', 'platform-api'],
  managementCallers: ['admin-console'],
  historyEncryptionKey,
  historyRetentionDays: 30,
  tokenCacheMargin: 120,
  wecom: { corpId: 'corp', secret: 'secret', agentId: 10001 },
};

async function withServer(client, callback) {
  const app = createApp({ config, wecomClient: client });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(server.address().port, app); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function request(port, { path = '/notify', apiKey, body, headers = {}, method } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? '' : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path, method: method || (data ? 'POST' : 'GET'),
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

function signedHeaders({ caller = 'admin-console', method = 'GET', path, body = '' }) {
  return issueServiceRequest({ caller, secret: config.apiKey, method, pathname: path, body });
}

test('health endpoint is public', async () => withServer({}, async (port) => {
  assert.equal((await request(port, { path: '/healthz' })).status, 200);
  const openApi = await request(port, { path: '/openapi.json' });
  assert.equal(openApi.status, 200);
  assert.equal(openApi.body.openapi, '3.1.0');
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

test('managed API clients enforce scopes, explicit targets and isolated delivery status', async () => {
  const sent = [];
  await withServer({ sendMessage: async (payload) => { sent.push(payload); return { errcode: 0 }; } }, async (port) => {
    const createPath = '/management/api-clients';
    const createBody = {
      name: 'Status integration',
      description: 'Managed API test',
      scopes: ['notifications:send', 'notifications:status:read'],
      rateLimitPerMinute: 20,
      expiresAt: null,
      actor: 'admin',
    };
    const created = await request(port, {
      path: createPath,
      body: createBody,
      headers: signedHeaders({ method: 'POST', path: createPath, body: JSON.stringify(createBody) }),
    });
    assert.equal(created.status, 201);
    assert.match(created.body.token, /^ntf_live_/);

    const noTarget = await request(port, {
      apiKey: created.body.token,
      body: { msg_type: 'text', data: { content: 'missing target' } },
    });
    assert.equal(noTarget.status, 400);
    assert.equal(noTarget.body.code, 'EXPLICIT_TARGET_REQUIRED');

    const broadcast = await request(port, {
      apiKey: created.body.token,
      body: { touser: '@all', msg_type: 'text', data: { content: 'broadcast' } },
    });
    assert.equal(broadcast.status, 403);
    assert.equal(broadcast.body.code, 'BROADCAST_SCOPE_REQUIRED');

    const sentResponse = await request(port, {
      apiKey: created.body.token,
      body: { touser: 'alice', msg_type: 'text', data: { content: 'hello' } },
    });
    assert.equal(sentResponse.status, 200);
    assert.equal(sent.length, 1);

    const delivery = await request(port, {
      path: `/deliveries/${sentResponse.body.deliveryId}`,
      apiKey: created.body.token,
    });
    assert.equal(delivery.status, 200);
    assert.equal(delivery.body.delivery.apiClientId, created.body.client.id);

    const enqueue = await request(port, {
      path: '/enqueue',
      apiKey: created.body.token,
      body: { msgType: 'text', content: 'later', target: { touser: 'alice' } },
    });
    assert.equal(enqueue.status, 403);
    assert.equal(enqueue.body.code, 'API_SCOPE_REQUIRED');

    const accessPath = '/management/api-access';
    const access = await request(port, { path: accessPath, headers: signedHeaders({ path: accessPath }) });
    assert.equal(access.status, 200);
    assert.equal(access.body.clients.length, 1);
    assert.equal(access.body.clients[0].token, undefined);
    assert.equal(access.body.requests.total >= 5, true);
    const missingTargetRequest = access.body.requests.items.find((row) => row.errorCode === 'EXPLICIT_TARGET_REQUIRED');
    assert.equal(missingTargetRequest.targetType, '');
    assert.equal(missingTargetRequest.targetValue, '');
  });
});

test('notification endpoint returns validation errors safely', async () => withServer({ sendMessage: async () => ({}) }, async (port) => {
  const response = await request(port, { apiKey: config.apiKey, body: { msg_type: 'unknown', data: {} } });
  assert.equal(response.status, 400);
  assert.equal(response.body.errcode, 400);
}));

test('management endpoints require an admin-console service signature', async () => withServer({}, async (port) => {
  assert.equal((await request(port, { path: '/management/overview', apiKey: config.apiKey })).status, 401);
  const path = '/management/overview';
  const response = await request(port, { path, headers: signedHeaders({ path }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.wecom.agentId, 10001);
  assert.equal(response.body.wecom.secret, undefined);
}));

test('management test send requires one explicit user and records a sanitized delivery', async () => {
  const sent = [];
  await withServer({ sendMessage: async (payload) => { sent.push(payload); return { errcode: 0 }; } }, async (port) => {
    const rejectedBody = { actor: 'operator', msgType: 'text', touser: '@all', content: 'hello' };
    const rejectedPath = '/management/test';
    const rejectedSerialized = JSON.stringify(rejectedBody);
    const rejected = await request(port, {
      path: rejectedPath,
      body: rejectedBody,
      headers: signedHeaders({ method: 'POST', path: rejectedPath, body: rejectedSerialized }),
    });
    assert.equal(rejected.status, 400);

    const body = { actor: 'operator', msgType: 'markdown', touser: 'alice', content: '### test' };
    const serialized = JSON.stringify(body);
    const response = await request(port, {
      path: rejectedPath,
      body,
      headers: signedHeaders({ method: 'POST', path: rejectedPath, body: serialized }),
    });
    assert.equal(response.status, 201);
    assert.equal(sent[0].touser, 'alice');

    const listPath = '/management/deliveries?page=1&pageSize=20';
    const list = await request(port, { path: listPath, headers: signedHeaders({ path: listPath }) });
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].targetValue, 'alice');
    assert.equal(list.body.items[0].encryptedPayload, undefined);
  });
});

test('failed single-user deliveries can be retried without exposing stored payloads', async () => {
  let attempts = 0;
  const error = Object.assign(new Error('temporary WeCom failure'), { status: 502, code: 'WECOM_MESSAGE_ERROR', wecomCode: 45009 });
  await withServer({
    sendMessage: async () => {
      attempts += 1;
      if (attempts === 1) throw error;
      return { errcode: 0 };
    },
  }, async (port) => {
    const notifyBody = { touser: 'alice', msg_type: 'text', data: { content: 'retry me' } };
    assert.equal((await request(port, { apiKey: config.apiKey, body: notifyBody })).status, 502);

    const listPath = '/management/deliveries?status=failed&page=1&pageSize=20';
    const list = await request(port, { path: listPath, headers: signedHeaders({ path: listPath }) });
    const failed = list.body.items[0];
    assert.equal(failed.retryable, true);
    assert.equal(failed.wecomCode, 45009);

    const retryPath = `/management/deliveries/${failed.id}/retry`;
    const retryBody = { actor: 'operator' };
    const retrySerialized = JSON.stringify(retryBody);
    const retried = await request(port, {
      path: retryPath,
      body: retryBody,
      headers: signedHeaders({ method: 'POST', path: retryPath, body: retrySerialized }),
    });
    assert.equal(retried.status, 201);
    assert.equal(retried.body.delivery.parentDeliveryId, failed.id);
    assert.equal(attempts, 2);
  });
});
