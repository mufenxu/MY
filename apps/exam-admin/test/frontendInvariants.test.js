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
  const binding = readSource('src', 'features', 'wechat-binding', 'useWechatBinding.js');

  assert.match(login, /stopQrCreation[\s\S]*?qrCreateController\?\.abort\(\)/);
  assert.match(login, /qrcode\/create[\s\S]*?signal:\s*controller\.signal/);
  assert.match(dashboard, /@close="stopBindRequests"/);
  assert.match(binding, /stopBindCreation[\s\S]*?bindCreateController\?\.abort\(\)/);
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
  const bootstrap = readSource('src', 'main.js');

  assert.match(dashboard, /v-if="IS_PLATFORM_SSO"[\s\S]*?pearl-console-switch/);
  assert.match(dashboard, /pearl-console-switch[\s\S]*?href="\/console"[\s\S]*?统一控制台/);
  assert.doesNotMatch(dashboard, /rail-console-link/);
  assert.match(detail, /v-if="IS_PLATFORM_SSO"[\s\S]*?returnToPlatformConsole/);
  assert.match(detail, /未保存的修改[\s\S]*?window\.location\.assign\('\/console'\)/);
  assert.match(bootstrap, /link\.href = IS_PLATFORM_SSO \? '\/console'/);
  assert.match(bootstrap, /link\.textContent = IS_PLATFORM_SSO \? '返回管理中心'/);
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

test('startup blocks on SSO only and preloads the standalone dashboard without blocking login', () => {
    const index = readSource('index.html');
    const bootstrap = readSource('src', 'main.js');

    assert.match(index, /<div id="app"><\/div>/);
    assert.doesNotMatch(index, /exam-bootstrap-shell|exam-bootstrap-panel/);
    assert.match(bootstrap, /if \(IS_PLATFORM_SSO\) \{[\s\S]*await Promise\.all\(\[[\s\S]*bootstrapPlatformSession\(\)[\s\S]*preloadDashboardView\(\)/);
    assert.match(bootstrap, /app\.mount\('#app'\);[\s\S]*if \(!IS_PLATFORM_SSO\)[\s\S]*scheduleDashboardPreload\(\)/);
    assert.match(bootstrap, /preloadDashboardView\(\)\.catch\(\(\) => \{\}\)/);
    assert.match(bootstrap, /requestIdleCallback[\s\S]*setTimeout/);
    assert.doesNotMatch(bootstrap, /innerHTML\s*=/);
});

test('HTTP timeout handling composes and removes caller abort signals', () => {
  const source = readSource('src', 'utils', 'http.js');

  assert.match(source, /const externalSignal = config\.signal/);
  assert.match(source, /externalSignal\?\.addEventListener\('abort', abortFromExternalSignal/);
  assert.match(source, /externalSignal\?\.removeEventListener\('abort', abortFromExternalSignal\)/);
});

test('dashboard views cancel stale requests and retain their last successful data', () => {
  const source = readSource('src', 'views', 'DashboardView.vue');

  assert.match(source, /const viewLoading = reactive\(/);
  assert.match(source, /const beginViewRequest = \(key\) => \{[\s\S]*?\.abort\(\)[\s\S]*?new AbortController\(\)/);
  assert.match(source, /v-loading="viewLoading\.examResults"/);
  assert.match(source, /v-loading="viewLoading\.users"/);
  assert.match(source, /v-loading="viewLoading\.feedbacks"/);
  assert.doesNotMatch(source, /categories\.value\s*=\s*\[\]/);
});

test('dashboard tone classes and the analysis dialog have matching styles', () => {
  const dashboard = readSource('src/views/DashboardView.vue');
  const styles = readSource('src/assets/css/pearl-admin.css');

  // 快捷入口卡片的类名由 tone 拼出，每个取值都必须有对应规则，否则语义色不会生效。
  const tones = new Set([...dashboard.matchAll(/tone:\s*(?:[^,\n]*\?\s*)?'([a-z]+)'(?:\s*:\s*'([a-z]+)')?/g)]
    .flatMap((match) => [match[1], match[2]].filter(Boolean)));
  assert.ok(tones.size >= 4);
  for (const tone of tones) {
    assert.match(styles, new RegExp(`\\.dashboard-action-card\\.is-${tone}\\s*\\{`), `missing style for tone ${tone}`);
  }

  // 试卷分析弹窗的趋势柱：高度类由 is-height-1..10 表示。
  assert.match(dashboard, /heightClass: `is-height-\$\{/);
  for (let step = 1; step <= 10; step += 1) {
    assert.match(styles, new RegExp(`\\.analysis-bar-fill\\.is-height-${step}\\s*\\{`));
  }
  for (const name of ['analysis-bars', 'analysis-bar-track', 'analysis-bar-fill', 'analysis-stat-grid', 'analysis-grid', 'analysis-hero']) {
    assert.match(dashboard, new RegExp(`class="${name}"`));
    assert.match(styles, new RegExp(`\\.${name}\\s*\\{`), `missing style for ${name}`);
  }
});

test('exam editor confirms unsaved changes on every in-app navigation', () => {
  const detail = readSource('src/views/ExamDetailView.vue');

  assert.match(detail, /onBeforeRouteLeave\(async \(to\) => \{\s*if \(!isDirty\.value \|\| !canEdit\.value \|\| to\.name === 'Login'\) return true;/);
  assert.match(detail, /window\.addEventListener\('beforeunload', handleBeforeUnload\)/);
});
