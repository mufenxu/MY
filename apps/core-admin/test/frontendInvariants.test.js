import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

test('backup and restore override the short interactive request timeout', () => {
  const source = readSource('src', 'pages', 'Settings.jsx');

  assert.match(source, /BACKUP_REQUEST_TIMEOUT_MS\s*=\s*120000/);
  assert.match(source, /RESTORE_REQUEST_TIMEOUT_MS\s*=\s*300000/);
  assert.match(source, /settings\/backup[\s\S]*?timeout:\s*BACKUP_REQUEST_TIMEOUT_MS/);
  assert.match(source, /settings\/restore[\s\S]*?timeout:\s*RESTORE_REQUEST_TIMEOUT_MS/);
});

test('other externally bound operations override the short request timeout', () => {
  const settings = readSource('src', 'pages', 'Settings.jsx');
  const orders = readSource('src', 'pages', 'CourseOrders.jsx');
  const publicQuery = readSource('src', 'pages', 'PublicQuery.jsx');

  assert.match(settings, /settings\/run-task[\s\S]*?timeout:\s*MANUAL_TASK_TIMEOUT_MS/);
  assert.match(settings, /settings\/test-notify[\s\S]*?timeout:\s*NOTIFICATION_TEST_TIMEOUT_MS/);
  assert.match(orders, /course-order\/admin\/refresh[\s\S]*?timeout:\s*ORDER_REFRESH_TIMEOUT_MS/);
  assert.match(publicQuery, /course-order\/public-refresh[\s\S]*?timeout:\s*PUBLIC_REFRESH_TIMEOUT_MS/);
});

test('QR creation requests are cancelled when login surfaces are replaced', () => {
  for (const relativePath of [
    ['src', 'pages', 'Login.jsx'],
    ['src', 'components', 'ScanAuthModal.jsx'],
  ]) {
    const source = readSource(...relativePath);
    assert.match(source, /createRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /signal:\s*controller\.signal/);
  }
});

test('platform console return is rendered only in the managed SSO shell', () => {
  const source = readSource('src', 'components', 'MainLayout.jsx');

  assert.match(source, /\{IS_PLATFORM_SSO && \([\s\S]*?返回统一服务控制台/);
  assert.match(source, /window\.location\.assign\('\/'\)/);
});
