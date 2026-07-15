import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('development defaults to local auth bypass', () => {
  const config = loadConfig({ NODE_ENV: 'development' });
  assert.equal(config.authDisabled, true);
  assert.equal(config.port, 8788);
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
  });
  assert.equal(config.authDisabled, false);
});
