/**
 * 接口契约测试（iot-service）。
 *
 * 断言 docs/api-specification.md 的不变量，不连 MQTT、不连库：
 * - 错误负载是统一信封，5xx 不回传原始 error.message
 * - 限流 429 带 Retry-After 与 RateLimit-*，body 里有字符串 code
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const { createErrorPayload } = require('../src/http/middleware/requestContext');
const { createLimiter } = require('../src/http/middleware/rateLimit');

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('5xx 错误负载不回传内部错误原文', () => {
  const payload = createErrorPayload(
    { id: 'iot-1' },
    500,
    'connect ECONNREFUSED 10.0.0.7:1883',
    'INTERNAL_ERROR',
  );

  assert.equal(payload.ok, false);
  assert.equal(payload.success, false);
  assert.equal(payload.message, payload.error);
  assert.equal(payload.code, 'INTERNAL_ERROR');
  assert.equal(payload.requestId, 'iot-1');
  assert.doesNotMatch(payload.message, /ECONNREFUSED|10\.0\.0\.7/);
});

test('4xx 保留面向用户的文案', () => {
  const payload = createErrorPayload(
    { id: 'iot-2' },
    400,
    'MQTT 连接测试失败，请检查地址、端口与认证信息。',
    'MQTT_TEST_FAILED',
  );

  assert.equal(payload.code, 'MQTT_TEST_FAILED');
  assert.match(payload.message, /MQTT/);
});

test('限流 429 带 Retry-After、RateLimit-* 与统一信封', () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 1, name: 'contract-test' });
  const req = { id: 'iot-rate-1', ip: '203.0.113.9', headers: {}, socket: {} };

  const first = createResponse();
  let passed = false;
  limiter(req, first, () => { passed = true; });
  assert.equal(passed, true, '第一次请求应放行');
  assert.equal(first.headers['ratelimit-limit'], 1);
  assert.equal(first.headers['ratelimit-remaining'], 0);

  const second = createResponse();
  limiter(req, second, () => { throw new Error('超限后不应放行'); });

  assert.equal(second.statusCode, 429);
  assert.ok(Number(second.headers['retry-after']) >= 1);
  assert.equal(second.body.ok, false);
  assert.equal(second.body.code, 'RATE_LIMITED');
  assert.equal(second.body.requestId, 'iot-rate-1');
});
