import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyServiceRequest } from '@my-platform/platform-auth';
import { createOperationsNotifier } from '../src/operations-notifier.js';

test('operations notifier signs internal notification requests without exposing the API key header', async () => {
  const apiKey = 'operations-notifier-test-key';
  let captured;
  const notifier = createOperationsNotifier({
    serviceUrl: 'http://notification-service:3000',
    apiKey,
    publicOrigin: 'https://pxyb.cn',
    fetchImpl: async (url, options) => {
      captured = { url: url.toString(), options };
      return { ok: true, status: 200 };
    },
  });
  const result = await notifier.sendIncident({
    title: 'Test incident',
    severity: 'warning',
    description: 'Temporary issue',
  }, 'opened');
  assert.equal(result.delivered, true);
  assert.equal(captured.url, 'http://notification-service:3000/notify');
  assert.equal(captured.options.headers['X-API-KEY'], undefined);
  assert.equal(verifyServiceRequest({
    headers: captured.options.headers,
    secret: apiKey,
    allowedCallers: ['platform-api'],
    method: 'POST',
    pathname: '/notify',
    body: captured.options.body,
  }).caller, 'platform-api');
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.msg_type, 'text');
  assert.match(payload.data.content, /^【统一管理后台告警】/);
  assert.match(payload.data.content, /详情：https:\/\/pxyb\.cn\//);
  assert.doesNotMatch(payload.data.content, /###|<font|\*\*|\]\(/);
});

test('all operations notifications use WeChat-compatible plain text', async () => {
  const bodies = [];
  const notifier = createOperationsNotifier({
    serviceUrl: 'http://notification-service:3000',
    apiKey: 'operations-notifier-test-key',
    publicOrigin: 'https://pxyb.cn',
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    },
  });

  await notifier.sendIncident({ title: '服务异常', severity: 'critical', description: '连接失败' }, 'opened');
  await notifier.sendRelease({
    kind: 'deployment',
    status: 'succeeded',
    deployment: { environment: 'production', components: ['admin-console'], revision: 'abcdef1234567890' },
  });
  await notifier.sendSecurityAlert({ type: 'new_ip_login', username: 'admin', ip: '203.0.113.10' });

  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.equal(body.msg_type, 'text');
    assert.doesNotMatch(body.data.content, /###|<font|\*\*|\]\(/);
  }
  assert.match(bodies[0].data.content, /状态：连接失败/);
  assert.match(bodies[1].data.content, /状态：成功/);
  assert.match(bodies[2].data.content, /处理：需要关注/);
});
