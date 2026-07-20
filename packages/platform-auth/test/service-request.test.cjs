const assert = require('node:assert/strict');
const test = require('node:test');
const {
  issueServiceRequest,
  verifyServiceRequest,
} = require('../index.cjs');

const SECRET = 'service-request-test-secret-with-adequate-length';

test('service request signatures bind caller, method, path and body', () => {
  const body = JSON.stringify({ message: 'hello' });
  const headers = issueServiceRequest({
    caller: 'core-api',
    secret: SECRET,
    method: 'POST',
    pathname: '/notify?priority=high',
    body,
    now: 1_000_000,
    nonce: '0123456789abcdef',
  });
  const verified = verifyServiceRequest({
    headers,
    secret: SECRET,
    allowedCallers: ['core-api'],
    method: 'POST',
    pathname: '/notify?priority=high',
    body,
    now: 1_005_000,
  });
  assert.equal(verified.caller, 'core-api');
  assert.equal(verifyServiceRequest({
    headers,
    secret: SECRET,
    allowedCallers: ['core-api'],
    method: 'POST',
    pathname: '/notify?priority=high',
    body: JSON.stringify({ message: 'changed' }),
    now: 1_005_000,
  }), null);
});

test('service request signatures reject expired, unknown and replayed callers', () => {
  const headers = issueServiceRequest({
    caller: 'platform-api',
    secret: SECRET,
    pathname: '/notify',
    now: 2_000_000,
    nonce: 'abcdef0123456789',
  });
  assert.equal(verifyServiceRequest({
    headers,
    secret: SECRET,
    allowedCallers: ['core-api'],
    pathname: '/notify',
    now: 2_001_000,
  }), null);
  assert.equal(verifyServiceRequest({
    headers,
    secret: SECRET,
    allowedCallers: ['platform-api'],
    pathname: '/notify',
    now: 2_031_000,
  }), null);
  assert.equal(verifyServiceRequest({
    headers,
    secret: SECRET,
    allowedCallers: ['platform-api'],
    pathname: '/notify',
    now: 2_001_000,
    replayGuard: () => false,
  }), null);
});
