import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createPasswordHash,
  createSessionRegistry,
  isPasswordHash,
  issueSession,
  parseCookies,
  passwordHashNeedsUpgrade,
  verifyPassword,
  verifySession,
  verifyTotp,
} from '../src/auth.js';
import { createNativeDeviceSecurity, verifyAndroidAttestation, verifyDeviceProof, proofDigest } from '../src/native-device-security.js';
import { createMemoryAuthStore } from '../src/auth-store.js';
import { createTestAttestation, createTestDevice, createTestPasskey } from './helpers/native-device.js';
import { createPasskeyService } from '../src/passkeys.js';
import { createMongoSessionRegistry } from '../src/mongo-session-registry.js';

test('password hashes verify the original password only', async () => {
  const hash = await createPasswordHash('a-strong-password', Buffer.alloc(16, 7));
  assert.match(hash, /^scrypt\$131072\$8\$1\$/);
  assert.equal(isPasswordHash(hash), true);
  assert.equal(passwordHashNeedsUpgrade(hash), false);
  assert.equal(await verifyPassword('a-strong-password', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword('a-strong-password', 'invalid'), false);
});

test('legacy scrypt hashes remain valid and are marked for upgrade', async () => {
  const salt = Buffer.alloc(16, 4);
  const hash = crypto.scryptSync('legacy-admin-password', salt, 64, { N: 2 ** 14, r: 8, p: 1 });
  const encoded = `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  assert.equal(await verifyPassword('legacy-admin-password', encoded), true);
  assert.equal(passwordHashNeedsUpgrade(encoded), true);
});

test('signed sessions expire and reject tampering', () => {
  const secret = 'a'.repeat(32);
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const token = issueSession({ username: 'admin', secret, ttlHours: 1, now });

  assert.equal(verifySession(token, secret, now + 1000).sub, 'admin');
  assert.equal(verifySession(`${token}x`, secret, now + 1000), null);
  assert.equal(verifySession(token, secret, now + 60 * 60 * 1000), null);
});

test('registered sessions can be revoked server-side', () => {
  const secret = 'b'.repeat(32);
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const sessions = createSessionRegistry({ secret });
  const token = sessions.issue({ username: 'admin', ttlHours: 1, now });

  assert.equal(sessions.verify(token, now + 1000).sub, 'admin');
  assert.equal(sessions.revoke(token, now + 1000), true);
  assert.equal(sessions.verify(token, now + 2000), null);

  const unregistered = issueSession({ username: 'admin', secret, ttlHours: 1, now });
  assert.equal(sessions.verify(unregistered, now + 1000), null);
});

test('registered sessions expire after the configured idle timeout', () => {
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const sessions = createSessionRegistry({ secret: 'i'.repeat(32), idleTimeoutMinutes: 5 });
  const token = sessions.issue({ username: 'admin', ttlHours: 1, now });
  assert.equal(sessions.verify(token, now + 299_000).sub, 'admin');

  const untouched = sessions.issue({ username: 'other-admin', ttlHours: 1, now });
  assert.equal(sessions.verify(untouched, now + 300_000), null);
});

test('registered sessions honor a per-session idle timeout', () => {
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const sessions = createSessionRegistry({ secret: 'j'.repeat(32), idleTimeoutMinutes: 5 });
  const browserToken = sessions.issue({ username: 'browser-admin', ttlHours: 1, now });
  const androidToken = sessions.issue({
    username: 'android-admin',
    ttlHours: 24,
    idleTimeoutMinutes: 60,
    now,
  });

  assert.equal(sessions.verify(browserToken, now + 300_000), null);
  assert.equal(sessions.verify(androidToken, now + 300_000).sub, 'android-admin');
  assert.equal(sessions.verify(androidToken, now + 65 * 60 * 1000), null);
});

test('registered sessions expose safe metadata and support remote revocation', () => {
  const sessions = createSessionRegistry({ secret: 'c'.repeat(32) });
  const token = sessions.issue({
    username: 'operator',
    role: 'operator',
    ttlHours: 2,
    ip: '127.0.0.1',
    userAgent: 'test-browser',
  });
  const [session] = sessions.list();
  assert.equal(session.subject, 'operator');
  assert.equal(session.role, 'operator');
  assert.equal(session.ip, '127.0.0.1');
  assert.equal(session.userAgent, 'test-browser');
  assert.equal(sessions.isActive({ nonce: session.nonce, subject: 'operator' }), true);
  assert.equal(sessions.isActive({ nonce: session.nonce, subject: 'another-operator' }), false);
  assert.equal(sessions.revokeByNonce(session.nonce), true);
  assert.equal(sessions.isActive({ nonce: session.nonce, subject: 'operator' }), false);
  assert.equal(sessions.verify(token), null);
  assert.equal(sessions.list().length, 0);
});

test('reauthentication grants are server-side, short-lived and session-bound', () => {
  const now = Date.UTC(2026, 6, 19, 12, 0, 0);
  const sessions = createSessionRegistry({ secret: 'r'.repeat(32) });
  const token = sessions.issue({ username: 'root', role: 'super_admin', ttlHours: 1, now });
  const expiresAt = sessions.markReauthenticated(token, { now, ttlSeconds: 9999 });

  assert.equal(expiresAt, Math.floor(now / 1000) + 300);
  assert.equal(sessions.verify(token, now + 299_000).reauthenticatedUntil, expiresAt);
  assert.equal(sessions.verify(token, now + 301_000).reauthenticatedUntil, 0);
  assert.equal(sessions.markReauthenticated(`${token}x`, { now }), null);
});

test('TOTP verification accepts the current step and rejects malformed codes', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = Date.UTC(2026, 6, 18, 12, 0, 0);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 0x0f;
  const token = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');

  assert.equal(verifyTotp(token, secret, now), true);
  assert.equal(verifyTotp('12345', secret, now), false);
  assert.equal(verifyTotp(token, 'invalid!', now), false);
});

test('cookie parser handles encoded values and malformed input', () => {
  assert.deepEqual(parseCookies('a=1; session=hello%20world; broken'), {
    a: '1',
    session: 'hello world',
  });
});

test('native access is short lived and refresh reuse revokes the entire device session', () => {
  const now = Date.now();
  const secret = 'n'.repeat(32);
  const sessions = createSessionRegistry({ secret, idleTimeoutMinutes: 1440 });
  const issued = sessions.issue({ username: 'admin', accountId: 'account-id', ttlHours: 720, sessionKind: 'native_app', now,
    nativeSecurity: { thumbprint: 'device-key', integrity: 'unverified', attestedAt: 0, versionCode: 0 }, accessTtlSeconds: 900 });
  const identity = sessions.verify(issued.token, now);
  assert.equal(identity.cnf.jkt, 'device-key');
  assert.equal(identity.exp, Math.floor(now / 1000) + 900);
  assert.equal(sessions.refreshNative(issued.refreshToken, { thumbprint: 'wrong-key', now }), null);
  assert.ok(sessions.verify(issued.token, now));
  const child = sessions.issue({ username: 'admin', ttlHours: 1, parentSessionNonce: identity.nonce, now });
  const refreshed = sessions.refreshNative(issued.refreshToken, { thumbprint: 'device-key', now });
  assert.notEqual(refreshed.token, issued.token);
  assert.notEqual(refreshed.refreshToken, issued.refreshToken);
  assert.ok(sessions.verify(issued.token, now + 59_000));
  assert.equal(sessions.verify(issued.token, now + 61_000), null);
  assert.ok(sessions.verify(refreshed.token, now + 61_000));
  assert.equal(sessions.refreshNative(issued.refreshToken, { thumbprint: 'device-key', now: now + 62_000 }), null);
  assert.equal(sessions.verify(refreshed.token, now + 62_000), null);
  assert.equal(sessions.verify(child, now + 62_000), null);
});

test('device proofs bind exact body, query, method, token and time and reject replay', async () => {
  const device = createTestDevice();
  const path = '/apps/campus/api/action?id=1';
  const body = '{"value":1}';
  const cookie = 'my_platform_session=example-token';
  const signed = device.sign(path, { body, cookie });
  const input = { proof: signed, method: 'POST', url: `https://pxyb.cn${path}`, bodyDigest: proofDigest(body), token: 'example-token' };
  assert.equal(verifyDeviceProof(input).thumbprint, device.thumbprint);
  for (const changed of [
    { method: 'DELETE' }, { bodyDigest: proofDigest('{"value":2}') }, { token: 'other-token' },
    { url: 'https://pxyb.cn/apps/campus/api/action?id=2' }, { url: 'https://evil.example/apps/campus/api/action?id=1' },
    { now: Date.now() + 120_000 }, { proof: 'bnVsbA.bnVsbA.AA' },
  ]) assert.throws(() => verifyDeviceProof({ ...input, ...changed }), { name: 'DeviceSecurityError' });
  const authStore = createMemoryAuthStore({ encryptionKey: Buffer.alloc(32, 1).toString('base64url'),
    bootstrap: { username: 'admin', passwordHash: 'unused-test-hash', role: 'super_admin' } });
  const security = createNativeDeviceSecurity({ config: { publicOrigin: 'https://pxyb.cn', androidAttestationRootSha256: [] }, authStore });
  const request = () => ({ method: 'POST', url: path, headers: { dpop: signed }, bodyDigest: proofDigest(body) });
  const firstRequest = request();
  await security.proof(firstRequest, 'example-token');
  await security.proof(firstRequest, 'example-token');
  await assert.rejects(security.proof(request(), 'example-token'), { code: 'DEVICE_PROOF_REPLAYED' });
  const challenge = await security.challenge();
  assert.equal(challenge.attestationConfigured, false);
  const registered = await security.register({ thumbprint: device.thumbprint }, { challengeId: challenge.challengeId });
  assert.equal(registered.integrity, 'unverified');
  await assert.rejects(security.register({ thumbprint: device.thumbprint }, { challengeId: challenge.challengeId }), { code: 'DEVICE_ATTESTATION_EXPIRED' });
  const required = createNativeDeviceSecurity({ config: { publicOrigin: 'https://pxyb.cn', androidAttestationRootSha256: [], androidRequireIntegrity: true }, authStore });
  const requiredChallenge = await required.challenge();
  await assert.rejects(required.register({ thumbprint: device.thumbprint }, requiredChallenge), { code: 'DEVICE_ATTESTATION_UNAVAILABLE' });
});

test('Passkey approval challenges cannot cross a session or QR request', async () => {
  const authStore = createMemoryAuthStore({ encryptionKey: Buffer.alloc(32, 2).toString('base64url'),
    bootstrap: { username: 'operator', passwordHash: 'unused-test-hash', role: 'operator' } });
  const credential = await createTestPasskey(authStore, 'operator');
  const passkeys = createPasskeyService({ authStore, rpName: 'test', rpID: 'pxyb.cn', origin: 'https://pxyb.cn' });
  const context = { purpose: 'qr_approval', sessionNonce: 'session-a', binding: 'request-a' };
  for (const wrongContext of [{ ...context, sessionNonce: 'session-b' }, { ...context, binding: 'request-b' }]) {
    const options = await passkeys.authenticationOptions('operator', context);
    const result = await passkeys.verifyAuthentication('operator', {
      challengeId: options.challengeId, response: credential.assertion(options.options.challenge),
    }, wrongContext);
    assert.equal(result.verified, false);
  }
  const options = await passkeys.authenticationOptions('operator', context);
  const assertion = { challengeId: options.challengeId, response: credential.assertion(options.options.challenge) };
  assert.equal((await passkeys.verifyAuthentication('operator', assertion, context)).verified, true);
  assert.equal((await passkeys.verifyAuthentication('operator', assertion, context)).verified, false);
});

test('Android hardware attestation validates the entire certificate and authorization chain', () => {
  const valid = createTestAttestation();
  assert.deepEqual(verifyAndroidAttestation(valid), { integrity: 'verified', attestedAt: valid.now, versionCode: 42 });
  for (const options of [
    { rootPathLen: 0 }, { issuerKeyUsage: 1 }, { unknownCritical: true }, { weakSignature: true },
    { hardware: { keySize: 384 } }, { hardware: { ecCurve: 2 } }, { hardware: { digest: [2] } },
    { hardware: { purpose: [2, 7] } }, { hardware: { osPatchLevel: 202401 } },
    { hardware: { rootOfTrust: { deviceLocked: false, verifiedBootState: 0 } } },
  ]) assert.throws(() => verifyAndroidAttestation(createTestAttestation(options)), { name: 'DeviceSecurityError' }, JSON.stringify(options));
  for (const changed of [
    { challenge: crypto.randomBytes(32).toString('base64url') }, { publicKey: createTestDevice().publicKey },
    { revocations: { 2: { status: 'REVOKED' } } }, { now: valid.now + 2 * 86_400_000 },
    { config: { ...valid.config, androidMinVersionCode: 43 } },
    { config: { ...valid.config, androidAppCertFingerprints: ['f'.repeat(64)] } },
    { config: { ...valid.config, androidAttestationRootSha256: ['f'.repeat(64)] } },
  ]) assert.throws(() => verifyAndroidAttestation({ ...valid, ...changed }), { name: 'DeviceSecurityError' });
});

test('Mongo native refresh uses compare-and-swap and revokes children on reuse or a race', async () => {
  const rows = [];
  const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some((entry) => matches(row, entry));
    if (value && typeof value === 'object' && '$gt' in value) return row[key] > value.$gt;
    if (value && typeof value === 'object' && '$lt' in value) return row[key] < value.$lt;
    return row[key] === value;
  });
  const collection = {
    async createIndex() {}, async updateMany() {}, async estimatedDocumentCount() { return rows.length; },
    async insertOne(row) { rows.push(structuredClone(row)); },
    async findOne(query) { return structuredClone(rows.find((row) => matches(row, query)) || null); },
    async updateOne(query, update) {
      const row = rows.find((entry) => matches(entry, query));
      if (!row) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteMany(query) {
      let deletedCount = 0;
      for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(rows[index], query)) { rows.splice(index, 1); deletedCount += 1; }
      return { deletedCount };
    },
    find(query, { projection }) {
      return { sort() { return this; }, limit() { return this; }, async toArray() {
        return rows.filter((row) => matches(row, query)).map((row) => Object.fromEntries(
          Object.entries(row).filter(([key]) => projection[key] !== 0),
        ));
      } };
    },
  };
  const sessions = await createMongoSessionRegistry({ secret: 'm'.repeat(32), idleTimeoutMinutes: 1440,
    client: { db: () => ({ collection: () => collection }) } });
  const now = Date.now();
  const issue = () => sessions.issue({ username: 'admin', accountId: 'account-id', ttlHours: 720, sessionKind: 'native_app', now,
    nativeSecurity: { thumbprint: 'device-key', integrity: 'unverified', attestedAt: 0, versionCode: 0 } });
  const original = await issue();
  const identity = await sessions.verify(original.token, now);
  const child = await sessions.issue({ username: 'admin', ttlHours: 1, parentSessionNonce: identity.nonce, now });
  assert.equal(await sessions.refreshNative(original.refreshToken, { thumbprint: 'wrong-key', now }), null);
  const refreshed = await sessions.refreshNative(original.refreshToken, { thumbprint: 'device-key', now });
  assert.ok(refreshed);
  assert.ok(await sessions.verify(original.token, now + 59_000));
  assert.equal(await sessions.verify(original.token, now + 61_000), null);
  const metadata = await sessions.list();
  assert.ok(metadata.length > 0);
  for (const entry of metadata) for (const key of ['accessTokenHash', 'refreshTokenHash', 'previousAccessTokenHash', 'refreshToken']) assert.equal(key in entry, false);
  assert.equal(await sessions.refreshNative(original.refreshToken, { thumbprint: 'device-key', now: now + 62_000 }), null);
  assert.equal(await sessions.verify(refreshed.token, now + 62_000), null);
  assert.equal(await sessions.verify(child, now + 62_000), null);
  const racing = await issue();
  const winners = (await Promise.all([1, 2].map(() => sessions.refreshNative(racing.refreshToken, { thumbprint: 'device-key', now })))).filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal(await sessions.verify(winners[0].token, now), null);
});
