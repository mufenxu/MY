import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstileToken } from '../src/bot-challenge.js';

test('Turnstile verification validates hostname and action server-side', async () => {
  let submitted = null;
  const fetchImpl = async (url, options) => {
    submitted = { url, options };
    return new Response(JSON.stringify({ success: true, hostname: 'pxyb.cn', action: 'platform_login' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  assert.deepEqual(await verifyTurnstileToken({
    token: 'browser-token',
    secretKey: 'server-secret',
    remoteIp: '203.0.113.30',
    expectedHostname: 'pxyb.cn',
    fetchImpl,
  }), { valid: true });
  assert.match(submitted.url, /siteverify$/);
  assert.equal(submitted.options.body.get('secret'), 'server-secret');
  assert.equal(submitted.options.body.get('remoteip'), '203.0.113.30');

  const mismatch = await verifyTurnstileToken({
    token: 'browser-token',
    secretKey: 'server-secret',
    expectedHostname: 'admin.example.com',
    fetchImpl,
  });
  assert.equal(mismatch.reason, 'hostname_mismatch');
});

test('Turnstile verification fails closed without a token', async () => {
  assert.deepEqual(await verifyTurnstileToken({ secretKey: 'server-secret' }), { valid: false, reason: 'missing_token' });
});
