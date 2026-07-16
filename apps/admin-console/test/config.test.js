import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadConfig, parseTrustProxy } from '../src/config.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const internalPrivateKey = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
const internalPublicKey = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');

test('development defaults to local auth bypass', () => {
  const config = loadConfig({ NODE_ENV: 'development' });
  assert.equal(config.authDisabled, true);
  assert.equal(config.port, 8788);
  assert.equal(config.publicOrigin, 'http://127.0.0.1:22100');
});

test('proxy trust is limited to an explicit hop count', () => {
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('false'), false);
});

test('production requires complete authentication settings', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }),
    /PLATFORM_ADMIN_USERNAME/,
  );
});

test('production accepts a password hash and strong session secret', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    PLATFORM_AUTH_DISABLED: 'true',
    PLATFORM_ADMIN_USERNAME: 'admin',
    PLATFORM_ADMIN_PASSWORD_HASH: 'scrypt$salt$hash',
    PLATFORM_SESSION_SECRET: 'x'.repeat(32),
    PLATFORM_INTERNAL_AUTH_PRIVATE_KEY: internalPrivateKey,
    PLATFORM_INTERNAL_AUTH_PUBLIC_KEY: internalPublicKey,
    PLATFORM_PUBLIC_ORIGIN: 'https://admin.example.com',
  });
  assert.equal(config.authDisabled, false);
});
