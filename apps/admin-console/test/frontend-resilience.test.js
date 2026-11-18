import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.resolve(appRoot, '..', '..', 'packages');
// 样式入口同时引用本应用文件与 @my-platform/* 共享包，两者都要能解析
const resolveStylesheet = (fromFile, stylesheet) => {
  if (!stylesheet.startsWith('@my-platform/')) {
    return path.resolve(path.dirname(fromFile), stylesheet);
  }
  const [, name, ...rest] = stylesheet.split('/');
  return path.join(packageRoot, name, ...rest);
};
const readSource = (...parts) => {
  const filename = path.join(appRoot, ...parts);
  const source = fs.readFileSync(filename, 'utf8');
  if (!filename.endsWith('styles.css')) return source;
  return source.replace(/^@import "([^"]+)";$/gm, (_, stylesheet) =>
    fs.readFileSync(resolveStylesheet(filename, stylesheet), 'utf8'));
};
const readConsoleSource = () => [
  'App.jsx',
  'Dashboard.jsx',
  'shared.jsx',
  'Login.jsx',
  'OverviewView.jsx',
  'ApplicationsView.jsx',
  'ServicesView.jsx',
  'BackupRecoveryView.jsx',
  'CommandPalette.jsx',
].map((name) => readSource('src', 'client', name)).join('\n');

test('service monitoring is sequential and pauses while hidden or offline', () => {
  const source = readConsoleSource();

  assert.match(source, /loadRequestRef\.current/);
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.match(source, /navigator\.onLine !== false/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /window\.setTimeout\(run, 30000\)/);
  assert.doesNotMatch(source, /setInterval\(\(\) => loadServices/);
});

test('session connectivity failures render a retry state instead of the login form', () => {
  const source = readConsoleSource();

  assert.match(source, /error\.status === 401/);
  assert.match(source, /setSessionError\(error\)/);
  assert.match(source, /SessionUnavailableScreen/);
  assert.match(source, /onRetry=\{checkSession\}/);
});

test('external OAuth authentication uses a dedicated login context without changing console login', () => {
  const app = readSource('src', 'client', 'App.jsx');
  const login = readSource('src', 'client', 'Login.jsx');

  assert.match(app, /window\.location\.pathname === '\/auth\/login'/);
  assert.match(app, /externalAuth=\{isExternalAuthLogin\}/);
  assert.match(login, /externalAuth = false/);
  assert.match(login, /externalAuth \? '统一身份认证' : '平台身份验证'/);
  assert.match(login, /externalAuth \? '继续进入应用' : '我已保存，进入控制台'/);

  const redirectIndex = app.indexOf('window.location.replace(returnTo);');
  const sessionIndex = app.indexOf('setSession(nextSession);');
  assert.ok(redirectIndex >= 0);
  assert.ok(sessionIndex >= 0);
  assert.ok(redirectIndex < sessionIndex);
  assert.match(app, /window\.location\.replace\(returnTo\);\s*return;/);
});

test('client files never rely on an undeclared React namespace', () => {
  const clientRoot = path.join(appRoot, 'src', 'client');
  const jsxFiles = fs.readdirSync(clientRoot).filter((name) => name.endsWith('.jsx'));

  for (const filename of jsxFiles) {
    const source = fs.readFileSync(path.join(clientRoot, filename), 'utf8');
    if (!/\bReact\./.test(source)) continue;
    assert.match(source, /^import React(?:\s*,|\s+from)/m, `${filename} uses React.* without importing React`);
  }
});

test('CT8 automation has one canonical client and API namespace', () => {
  const app = readConsoleSource();
  const automation = readSource('src', 'client', 'AutomationView.jsx');

  assert.match(app, /const loadAutomationView = \(\) => import\('\.\/AutomationView\.jsx'\)/);
  assert.match(app, /const AutomationView = lazy\(loadAutomationView\)/);
  assert.match(app, /<Suspense fallback=\{<ViewLoadingFallback \/>\}>/);
  assert.match(app, /class ViewModuleBoundary extends Component/);
  assert.match(app, /componentDidCatch\(error, details\)/);
  assert.match(app, /<ViewModuleBoundary key=\{activeFilter\}>/);
  assert.doesNotMatch(app, /function AutomationView/);
  assert.match(automation, /CT8_API_BASE = '\/apps\/core\/api\/ct8'/);
  assert.doesNotMatch(automation, /\/github\//);
});

test('large operational views stay out of the entry bundle and preload while idle', () => {
  const app = readConsoleSource();

  assert.match(app, /const loadNotificationView = \(\) => import\('\.\/NotificationServiceView\.jsx'\)/);
  assert.match(app, /const loadPlatformViews = \(\) => import\('\.\/PlatformControlViews\.jsx'\)/);
  assert.match(app, /const loadOperationsViews = \(\) => import\('\.\/OperationsViews\.jsx'\)/);
  assert.match(app, /const loadExternalApplicationsView = \(\) => import\('\.\/ExternalApplicationsView\.jsx'\)/);
  assert.match(app, /window\.requestIdleCallback/);
  assert.match(app, /VIEW_MODULE_LOADERS/);
});

test('external applications use server-issued launch links and reveal client secrets only after creation or rotation', () => {
  const app = readConsoleSource();
  const view = readSource('src', 'client', 'ExternalApplicationsView.jsx');
  const navigation = readSource('src', 'client', 'navigation.js');

  assert.match(navigation, /id: 'external-apps', label: '外部应用'/);
  assert.match(app, /activeFilter === 'external-apps'/);
  assert.match(view, /requestJson\('\/api\/external-apps'/);
  assert.match(view, /`\/api\/external-apps\/\$\{encodeURIComponent\(application\.id\)\}\/launch`/);
  assert.match(view, /clientSecret/);
  assert.match(view, /rotate-secret/);
  assert.match(view, /密钥只显示这一次/);
  assert.doesNotMatch(view, /clientSecretHash/);
  assert.equal(view.match(/href="\/docs\/external-auth"/g)?.length, 2);
  assert.match(view, /查看接入文档/);
});

test('console navigation and segmented tabs preserve browser and keyboard semantics', () => {
  const app = readConsoleSource();
  const controls = readSource('src', 'client', 'UiControls.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(app, /window\.history\[replace \? 'replaceState' : 'pushState'\]/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(readSource('src', 'client', 'OperationsViews.jsx'), /<SegmentedTabs/);
  assert.match(controls, /role="tablist"/);
  assert.match(controls, /role="tab"/);
  assert.match(controls, /tabIndex=\{active \? 0 : -1\}/);
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.match(controls, new RegExp(`event\\.key === '${key}'`));
  }
  assert.match(styles, /\.dependency-stage\s*\{/);
  assert.match(styles, /\.topology-panel\s*\{/);
});

test('notification nested tabs keep the existing panel spacing and accessible labels', () => {
  const source = readSource('src', 'client', 'NotificationServiceView.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(source, /const panelLabelledBy = \['records', 'test'\]\.includes\(tab\)/);
  assert.match(source, /className="notify-view-panel"[^>]+aria-labelledby=\{panelLabelledBy\}/);
  assert.match(source, /aria-label="统一通知服务控制中心"/);
  assert.match(source, /id: 'app', label: 'App 通知'/);
  assert.match(source, /\/api\/notifications\/app\/overview/);
  assert.match(source, /\/api\/notifications\/app\/test/);
  assert.match(source, /appOverview\.registeredUsers/);
  assert.match(source, /ariaLabel="App 通知接收用户"/);
  assert.doesNotMatch(source, /<label><span>平台用户 ID<\/span><div className="notify-input-wrap">/);
  assert.match(styles, /\.notify-view-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*14px;/s);
  assert.match(styles, /\.notify-channel-grid\s*\{/);
  assert.match(styles, /\.notify-app-layout\s*\{/);
});

test('homepage dependency topology uses live service observations without decorative canvas data', () => {
  const topology = readSource('src', 'client', 'HolographicTopology.jsx');
  const app = readConsoleSource();

  for (const serviceId of ['core', 'exam', 'campus', 'mqtt', 'notify', 'ct8-automation']) {
    assert.match(topology, new RegExp(`id: '${serviceId}'`));
  }
  assert.match(topology, /service\.latencyMs/);
  assert.match(topology, /service\.httpStatus/);
  assert.match(topology, /service\.checkedAt/);
  assert.match(topology, /aria-label="核心网关与六个服务的依赖关系"/);
  assert.match(app, /monitoringEnabled=\{monitoringEnabled\}/);
  assert.doesNotMatch(topology, /<canvas|requestAnimationFrame|throughput|1\.93k/);
});

test('homepage formal cockpit keeps summary and alert content tied to live observations', () => {
  const app = readConsoleSource();
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(app, /className="hero-grid" aria-label="全网运行摘要"/);
  assert.match(app, /const healthyCount = counts\.healthy \?\? 0/);
  assert.match(app, /const incidentCount = Math\.max\(operationsSummary\?\.incidents\?\.length \?\? 0, attentionCount\)/);
  assert.match(app, /incidents\.slice\(0, 3\)\.map/);
  assert.match(app, /className="quick-item"\s+type="button"/s);
  assert.match(app, /onOpenConfiguration=\{\(\) => navigateToView\('configuration'\)\}/);
  assert.doesNotMatch(app, /网关响应耗时陡增/);
  assert.match(styles, /\.dependency-service-copy > strong\s*\{[^}]*font-size:\s*12\.5px/s);
  assert.match(styles, /\.dependency-service-metrics small\s*\{[^}]*font-size:\s*var\(--type-caption\)/s);
});

test('backup view manages scheduled and S3-compatible offsite backups without exposing saved secrets', () => {
  const app = readConsoleSource();
  const operations = readSource('src', 'client', 'OperationsViews.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(app, /const BackupOffsitePanel = lazyNamed\(loadOperationsViews, 'BackupOffsitePanel'\)/);
  assert.match(app, /<BackupOffsitePanel/);
  assert.match(app, /onExecuteBackup=\{handleStartBackup\}/);
  assert.match(app, /backupJob=\{activeJob\}/);
  assert.match(app, /\/api\/backups\/\$\{encodeURIComponent\(backup\.name\)\}\/sync/);
  assert.match(operations, /export function BackupOffsitePanel/);
  for (const endpoint of [
    '/api/backups/schedule',
    '/api/backups/offsite/config',
    '/api/backups/offsite/test',
    '/api/backups/offsite',
    '/api/backups/offsite/import',
    '/api/operations/settings',
  ]) {
    assert.match(operations, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  assert.match(operations, /onClick=\{executeBackupNow\}/);
  assert.match(operations, /\.result\?\.offsite\?\.status === 'failed'/);
  assert.match(operations, /type="password"[^>]+autoComplete="new-password"/);
  assert.match(operations, /accessKeyIdMasked/);
  assert.doesNotMatch(operations, /value=\{config\.(?:accessKeyId|secretAccessKey)\}/);
  assert.match(styles, /\.offsite-layout/);
  assert.match(styles, /\.col-remote/);
});

test('external application editor reports save failures inside the dialog', () => {
  const view = readSource('src', 'client', 'ExternalApplicationsView.jsx');

  assert.match(view, /function ApplicationEditor\(\{ application, busy, error, onClose, onSave \}\)/);
  assert.match(view, /error && <div className="error-banner" role="alert">/);
  assert.match(view, /<ApplicationEditor application=\{editor\} busy=\{Boolean\(busyId\)\} error=\{error\}/);
  assert.match(view, /onClick=\{\(\) => openEditor\(application\)\}/);
});

test('first paint placeholder is styled by the stylesheet because the console CSP forbids inline styles', () => {
  const index = readSource('index.html');
  const server = readSource('src', 'app.js');
  const shared = readSource('src', 'client', 'shared.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  // style-src 不含 'unsafe-inline' 时，内联 <style> 与 style 属性都不会生效
  assert.match(server, /styleSrc: \["'self'"\]/);
  assert.doesNotMatch(index, /<style\b/i);
  assert.doesNotMatch(index, /\sstyle\s*=/i);
  // 占位结构与 React 的 LoadingScreen 一致，接管时不会跳变
  assert.match(index, /<main class="loading-screen">/);
  assert.match(shared, /<main className="loading-screen">/);
  assert.match(styles, /\.loading-screen\s*\{/);
  assert.match(styles, /\.spin\s*\{/);
});

test('console session, transfer and deep-link fixes stay in place', () => {
  const dashboard = readSource('src', 'client', 'Dashboard.jsx');
  const backup = readSource('src', 'client', 'BackupRecoveryView.jsx');
  const notifications = readSource('src', 'client', 'NotificationServiceView.jsx');
  const platform = readSource('src', 'client', 'PlatformControlViews.jsx');
  const automation = readSource('src', 'client', 'AutomationView.jsx');

  // 服务端没有确认撤销会话时，界面不能切到登录页。
  assert.match(dashboard, /await requestJson\('\/api\/auth\/logout', \{ method: 'POST' \}\);\s*\} catch \(requestError\) \{[\s\S]*?return;\s*\}\s*onLogout\(\);/);
  assert.doesNotMatch(dashboard, /finally \{\s*onLogout\(\);/);
  // 顶栏角色来自会话，而不是写死。
  assert.match(dashboard, /ROLE_LABELS\[session\.user\?\.role\]/);
  // 大文件上传不能沿用 12 秒默认超时。
  assert.match(backup, /\/api\/backups\/upload[\s\S]*?timeoutMs: 10 \* 60 \* 1000/);
  assert.match(notifications, /\/api\/notifications\/cmcc\/media[\s\S]*?timeoutMs: 2 \* 60 \* 1000/);
  // 深链目标只同步一次，不能把每次渲染都新建的数组当作依赖。
  assert.match(platform, /\}, \[targetAvailable, targetEntityId\]\);/);
  // 线上站点根路径是品牌官网，控制台入口不能指向 `/`。
  assert.doesNotMatch(platform, /<a href="\/"/);
  assert.doesNotMatch(automation, /href: '\/\?view=/);
});

test('incident notes, row shortcuts, secret rotation and module preloading stay safe', () => {
  const operations = readSource('src', 'client', 'OperationsViews.jsx');
  const backup = readSource('src', 'client', 'BackupRecoveryView.jsx');
  const dashboard = readSource('src', 'client', 'Dashboard.jsx');
  const external = readSource('src', 'client', 'ExternalApplicationsView.jsx');

  // 备注随事件切换清空，不会被提交到另一条事件上。
  assert.match(operations, /if \(incident\.id !== selectedId\) setNote\(''\);/);
  // 行内按钮的回车/空格不被行级快捷键吞掉。
  assert.match(backup, /function handleBackupRowKeyDown\(event, backup\) \{[\s\S]*?if \(event\.target !== event\.currentTarget\) return;/);
  // 预加载失败不留下未处理的 Promise 拒绝。
  assert.match(dashboard, /VIEW_MODULE_LOADERS\[viewId\]\?\.\(\)\.catch\(\(\) => \{\}\)/);
  // 轮换密钥必须先确认。
  assert.match(external, /onClick=\{\(\) => setRotateTarget\(application\)\}/);
  assert.match(external, /<ConfirmDialog open=\{Boolean\(rotateTarget\)\}[\s\S]*?onConfirm=\{rotateSecret\} \/>/);
});
