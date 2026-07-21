const assert = require('node:assert/strict');
const test = require('node:test');
const {
  issueServiceRequest,
  isPlatformRole,
  isScanLoginSessionExpired,
  isSafeHttpMethod,
  isTerminalScanLoginStatus,
  verifyServiceRequest,
} = require('../index.cjs');

const SECRET = 'service-request-test-secret-with-adequate-length';

test('shared platform vocabulary normalizes roles and safe HTTP methods', () => {
  assert.equal(isPlatformRole('viewer'), true);
  assert.equal(isPlatformRole('admin'), false);
  assert.equal(isSafeHttpMethod('get'), true);
  assert.equal(isSafeHttpMethod('POST'), false);
});

test('scan login protocol shares terminal states and expiry rules', () => {
  assert.equal(isTerminalScanLoginStatus('cancelled'), true);
  assert.equal(isTerminalScanLoginStatus('confirmed'), false);
  assert.equal(isScanLoginSessionExpired({ status: 'pending', expiresAt: 1_001 }, { now: 1_000 }), false);
  assert.equal(isScanLoginSessionExpired({ status: 'pending', expiresAt: 999 }, { now: 1_000 }), true);
  assert.equal(isScanLoginSessionExpired({
    status: 'confirmed',
    expiresAt: 2_000,
    tempAuthCodeExpiresAt: 999,
  }, { now: 1_000 }), true);
});

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
