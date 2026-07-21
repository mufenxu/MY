import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(appRoot, '..', '..');
const readSource = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');
const readWorkspaceSource = (...parts) => fs.readFileSync(path.join(workspaceRoot, ...parts), 'utf8');

test('globally referenced icons remain in the explicit registration set', () => {
  const source = readSource('src', 'main.js');

  assert.ok((source.match(/\bDataLine\b/g) || []).length >= 2);
  assert.ok((source.match(/\bFullScreen\b/g) || []).length >= 2);
});

test('QR creation requests are cancelled when their surface closes', () => {
  const login = readSource('src', 'views', 'LoginView.vue');
  const dashboard = readSource('src', 'views', 'DashboardView.vue');

  assert.match(login, /stopQrCreation[\s\S]*?qrCreateController\?\.abort\(\)/);
  assert.match(login, /qrcode\/create[\s\S]*?signal:\s*controller\.signal/);
  assert.match(dashboard, /@close="stopBindRequests"/);
  assert.match(dashboard, /stopBindCreation[\s\S]*?bindCreateController\?\.abort\(\)/);
});

test('global HTTP errors remain visible unless a request opts out', () => {
  const source = readSource('src', 'utils', 'setupHttp.js');

  assert.match(source, /requestConfig\.showGlobalError !== false/);
  assert.match(source, /error\.config\?\.showGlobalError !== false/);
});

test('bearer credentials remain memory-only while cookie auth survives reloads', () => {
  const source = readSource('src', 'utils', 'session.js');

  assert.match(source, /function getTokenValue\(\)[\s\S]*?memoryStore\[TOKEN_KEY\]/);
  assert.match(source, /function setTokenValue\(token\)[\s\S]*?removeStorage\(durableStorage, TOKEN_KEY\)/);
  assert.doesNotMatch(source, /setStoredValue\(TOKEN_KEY/);
});

test('platform console return stays scoped to verified managed sessions', () => {
  const dashboard = readSource('src', 'views', 'DashboardView.vue');
  const detail = readSource('src', 'views', 'ExamDetailView.vue');

  assert.match(dashboard, /v-if="IS_PLATFORM_SSO"[\s\S]*?返回统一服务控制台/);
  assert.match(detail, /v-if="IS_PLATFORM_SSO"[\s\S]*?returnToPlatformConsole/);
  assert.match(detail, /未保存的修改[\s\S]*?window\.location\.assign\('\/'\)/);
});

test('logout preserves the session until server-side revocation succeeds', () => {
  const dashboard = readSource('src', 'views', 'DashboardView.vue');
  const runtime = readSource('src', 'utils', 'runtime.js');
  const sharedRuntime = readWorkspaceSource('packages', 'platform-browser-runtime', 'index.js');

  assert.match(dashboard, /await logoutPlatformSession\(\);[\s\S]*return;/);
  assert.match(dashboard, /await adminApi\.logout\(\);[\s\S]*session\.clear\(\);/);
  assert.match(dashboard, /catch \(error\)[\s\S]*退出失败/);
  assert.doesNotMatch(dashboard, /adminApi\.logout\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(runtime, /createPlatformBrowserRuntime\(\{ appName: 'exam' \}\)/);
  assert.match(sharedRuntime, /if \(!response\.ok\)[\s\S]*throw new Error/);
});
