import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryQrLoginStore } from '../src/qr-login-store.js';

test('QR login store binds separate scan and browser secrets and consumes once', async () => {
  let currentTime = Date.parse('2026-07-30T00:00:00.000Z');
  const secrets = ['scan-secret-value-that-is-long-enough', 'browser-secret-value-that-is-long-enough'];
  const store = createMemoryQrLoginStore({
    now: () => new Date(currentTime),
    idFactory: () => '123e4567-e89b-42d3-a456-426614174000',
    secretFactory: () => secrets.shift(),
    codeFactory: () => 73,
  });

  const created = await store.create({ browserIp: '203.0.113.7', browserUserAgent: 'Test Browser' });
  assert.equal(created.verificationCode, '0073');
  assert.equal(created.record.scanTokenHash, undefined);
  assert.equal(created.record.browserVerifierHash, undefined);
  assert.equal(await store.getForBrowser(created.requestId, 'wrong-browser-secret'), null);
  assert.equal(await store.scan(created.requestId, 'wrong-scan-secret', 'operator'), null);

  const scanned = await store.scan(created.requestId, created.scanToken, 'operator');
  assert.equal(scanned.status, 'scanned');
  assert.equal(scanned.scannedBy, 'operator');
  assert.equal(await store.scan(created.requestId, created.scanToken, 'other-user'), null);

  const approved = await store.approve(created.requestId, 'operator', 'biometric');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.confirmationMethod, 'biometric');
  const consumed = await store.consume(created.requestId, created.browserVerifier);
  assert.equal(consumed.status, 'consumed');
  assert.equal(await store.consume(created.requestId, created.browserVerifier), null);

  currentTime += 91_000;
  assert.equal(await store.getForBrowser(created.requestId, created.browserVerifier), null);
});

