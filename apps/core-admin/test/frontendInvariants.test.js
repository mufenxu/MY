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

test('header icon tools and tabs remain keyboard and screen-reader accessible', () => {
  const layout = readSource('src', 'components', 'MainLayout.jsx');
  const styles = readSource('src', 'index.css');

  assert.match(layout, /role="tablist"/);
  assert.match(layout, /role="tab"[\s\S]*?tabIndex=\{0\}[\s\S]*?aria-selected/);
  assert.match(layout, /aria-label=\{`关闭\$\{config\.label\}页签`\}/);
  assert.match(layout, /aria-label="打开导航菜单"/);
  assert.match(layout, /aria-label="刷新当前页"/);
  assert.match(styles, /\.soybean-tab-item:focus-visible/);
});

test('platform SSO distinguishes authentication, mapping and availability failures', () => {
  const app = readSource('src', 'App.jsx');

  assert.match(app, /status === 401[\s\S]*?redirectToPlatformLogin/);
  assert.match(app, /isMappingError = IS_PLATFORM_SSO && status === 403/);
  assert.match(app, /综合管理服务暂时不可用/);
  assert.match(app, /setSessionRetry/);
});

test('local admin credentials remain in HttpOnly cookies with CSRF replay protection', () => {
  const api = readSource('src', 'utils', 'api.js');
  const app = readSource('src', 'App.jsx');
  const login = readSource('src', 'pages', 'Login.jsx');

  assert.doesNotMatch(api, /localStorage\.getItem\('token'\)/);
  assert.doesNotMatch(login, /localStorage\.setItem\('token'/);
  assert.match(api, /core_admin_csrf/);
  assert.match(api, /X-CSRF-Token/);
  assert.match(api, /csrfTokenMemory/);
  assert.match(api, /headers\?\.get\?\.\('x-csrf-token'\)/);
  assert.match(app, /api\.get\('\/users\/me', \{ skipAuthRedirect: true \}\)/);
  assert.match(app, /core-auth-changed/);
});

test('order reliability states are explicit and submitting orders cannot be refreshed concurrently', () => {
  const orders = readSource('src', 'pages', 'CourseOrders.jsx');

  assert.match(orders, /'Submitting': \{ color: 'processing', label: '提交中' \}/);
  assert.match(orders, /'ReconcilePending': \{ color: 'warning', label: '待人工核对' \}/);
  assert.match(orders, /'Unknown': \{ color: 'default', label: '结果未知' \}/);
  assert.match(orders, /disabled: record\.status === 'Submitting'/);
  assert.match(orders, /<Option value="Pending" disabled>/);
});

test('app secret reveal and reset complete the required reauthentication flow', () => {
  const scan = readSource('src', 'pages', 'ScanManagement.jsx');

  assert.match(scan, /fetch\('\/api\/auth\/reauth'/);
  assert.match(scan, /X-Platform-Request': 'console'/);
  assert.match(scan, /secret\/reveal/);
  assert.match(scan, /currentPassword: values\.password/);
  assert.doesNotMatch(scan, /setCurrentSecret\(res\.data\.secret\)[\s\S]{0,120}api\.get\(`\/apps\/\$\{record\._id\}\/secret`\)/);
  assert.match(scan, /setCurrentSecret\(''\)/);
  assert.match(scan, /destroyOnHidden/);
});

test('secret cache and Turnstile mutations perform server-backed reauthentication', () => {
  const secrets = readSource('src', 'components', 'SecretSettings.jsx');
  const turnstile = readSource('src', 'components', 'TurnstileSettings.jsx');
  const reauth = readSource('src', 'utils', 'reauth.js');

  assert.match(secrets, /establishSensitiveSession\(credentials\)/);
  assert.match(secrets, /api\.delete\(`\/secrets\/\$\{pendingAction\.key\}`[^]*data: proof/);
  assert.match(turnstile, /establishSensitiveSession\(credentials\)/);
  assert.match(turnstile, /value: values\.secretKey,[\s\S]*\.\.\.proof/);
  assert.match(turnstile, /key: 'turnstile_config',[\s\S]*remark:[\s\S]*\.\.\.proof/);
  assert.match(turnstile, /const onFinish = async \(values\) => \{\s*setPendingValues\(values\);\s*setReauthVisible\(true\);/);
  assert.match(reauth, /fetchWithTimeout\('\/api\/auth\/reauth'/);
  assert.match(reauth, /currentPassword: password/);
});

test('logout keeps the active UI session when the server cannot revoke cookies', () => {
  const layout = readSource('src', 'components', 'MainLayout.jsx');
  const runtime = readSource('src', 'utils', 'runtime.js');

  assert.match(layout, /await api\.post\('\/auth\/logout'[\s\S]*localStorage\.removeItem\('user'\)/);
  assert.match(layout, /catch \(error\)[\s\S]*退出失败/);
  assert.match(runtime, /if \(!response\.ok\)[\s\S]*throw new Error/);
  assert.doesNotMatch(runtime, /logoutPlatformSession[\s\S]*\.catch\(\(\) => \{\}\)/);
});

test('operator settings hide super-admin security and secret surfaces', () => {
  const settings = readSource('src', 'pages', 'Settings.jsx');

  assert.match(settings, /if \(!isSuperAdmin\) return;[\s\S]*loadConfig\(\);[\s\S]*loadAdminInfo\(\);/);
  assert.match(settings, /filter\(\(item\) => isSuperAdmin \|\| !\['1', '2', '3', '4'\]\.includes\(item\.key\)\)/);
  assert.match(settings, /defaultActiveKey=\{isSuperAdmin \? '1' : '6'\}/);
});
