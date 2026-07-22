import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

test('service monitoring is sequential and pauses while hidden or offline', () => {
  const source = readSource('src', 'client', 'App.jsx');

  assert.match(source, /loadRequestRef\.current/);
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.match(source, /navigator\.onLine !== false/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /window\.setTimeout\(run, 30000\)/);
  assert.doesNotMatch(source, /setInterval\(\(\) => loadServices/);
});

test('session connectivity failures render a retry state instead of the login form', () => {
  const source = readSource('src', 'client', 'App.jsx');

  assert.match(source, /error\.status === 401/);
  assert.match(source, /setSessionError\(error\)/);
  assert.match(source, /SessionUnavailableScreen/);
  assert.match(source, /onRetry=\{checkSession\}/);
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
  const app = readSource('src', 'client', 'App.jsx');
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
  const app = readSource('src', 'client', 'App.jsx');

  assert.match(app, /const loadNotificationView = \(\) => import\('\.\/NotificationServiceView\.jsx'\)/);
  assert.match(app, /const loadPlatformViews = \(\) => import\('\.\/PlatformControlViews\.jsx'\)/);
  assert.match(app, /const loadOperationsViews = \(\) => import\('\.\/OperationsViews\.jsx'\)/);
  assert.match(app, /window\.requestIdleCallback/);
  assert.match(app, /VIEW_MODULE_LOADERS/);
});

test('console navigation and segmented tabs preserve browser and keyboard semantics', () => {
  const app = readSource('src', 'client', 'App.jsx');
  const controls = readSource('src', 'client', 'UiControls.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(app, /window\.history\[replace \? 'replaceState' : 'pushState'\]/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(app, /<SegmentedTabs/);
  assert.match(controls, /role="tablist"/);
  assert.match(controls, /role="tab"/);
  assert.match(controls, /tabIndex=\{active \? 0 : -1\}/);
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.match(controls, new RegExp(`event\\.key === '${key}'`));
  }
  assert.match(styles, /ops-topography-background\.png/);
  assert.doesNotMatch(styles, /ops-topography-background\.webp/);
});

test('notification nested tabs keep the existing panel spacing and accessible labels', () => {
  const source = readSource('src', 'client', 'NotificationServiceView.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(source, /const panelLabelledBy = \['records', 'test'\]\.includes\(tab\)/);
  assert.match(source, /className="notify-view-panel"[^>]+aria-labelledby=\{panelLabelledBy\}/);
  assert.match(styles, /\.notify-view-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*14px;/s);
});
