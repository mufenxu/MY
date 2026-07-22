import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

test('monitoring view integrates operational intelligence without a new navigation surface', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');
  const app = readSource('src', 'client', 'App.jsx');

  for (const view of ['trend', 'slo', 'calendar', 'search']) {
    assert.match(source, new RegExp(`id: '${view}'`));
  }
  assert.match(source, /idPrefix="monitoring-view-tab"/);
  assert.match(source, /className="ops-page" id="monitoring-view-panel" role="tabpanel"/);
  assert.match(app, /<MonitoringView services=\{services\} onNavigate=\{navigateToView\} \/>/);
  assert.doesNotMatch(source, /command.palette|command-palette|CommandPalette/i);
});

test('operational intelligence panels expose loading, error, empty, refresh, filters, and pagination', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');

  for (const endpoint of ['slo', 'change-calendar', 'search']) {
    assert.match(source, new RegExp(`/api/operations/${endpoint}\\?\\$\\{`));
  }
  assert.match(source, /正在计算 SLO 与错误预算/);
  assert.match(source, /当前时间窗口暂无可用 SLO 样本/);
  assert.match(source, /正在读取变更日历/);
  assert.match(source, /当前筛选范围暂无变更记录/);
  assert.match(source, /正在检索运营数据/);
  assert.match(source, /没有找到匹配的运营对象/);
  assert.match(source, /sourceAvailabilityError\(data\)/);
  assert.match(source, /sourceScanLimitWarning\(data\)/);
  assert.match(source, /data\.truncated \? `匹配 \$\{data\.totalMatched/);
  assert.match(source, /operationalStatusLabel\(event\.status, event\.type\)/);
  assert.match(source, /operationalStatusLabel\(result\.status, result\.type\)/);
  assert.match(source, /className="notify-pagination"/);
  assert.match(source, />上一页<\/button>/);
  assert.match(source, />下一页<\/button>/);
  assert.match(source, /maxLength=\{80\}/);
  assert.match(source, /query\.trim\(\)\.length < 2/);
  assert.match(source, /筛选 SLO 服务/);
  assert.match(source, /筛选变更类型/);
  assert.match(source, /筛选变更服务/);
  assert.match(source, /筛选检索类型/);
  assert.match(source, /idPrefix="slo-window-tab"/);
  assert.match(source, /idPrefix="change-calendar-range-tab"/);
});

test('operational intelligence tables preserve essential actions and budget data on mobile', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');
  const styles = readSource('src', 'client', 'styles.css');

  assert.match(source, /monitoring-table slo-table/);
  assert.match(source, /monitoring-table change-calendar-table/);
  assert.match(source, /monitoring-table operational-search-table/);
  assert.match(styles, /\.slo-table > span:nth-child\(5\)[\s\S]*?display: inline-flex;/);
  assert.match(styles, /\.operational-search-table > span:nth-child\(6\)[\s\S]*?display: inline-flex;/);
});

test('all operational intelligence reads cancel stale requests before applying results', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');
  const controllerCreations = source.match(/const controller = new AbortController\(\)/g) || [];
  const guardedWrites = source.match(/requestRef\.current === controller/g) || [];
  const requestSignals = source.match(/signal: controller\.signal/g) || [];
  const clearedBeforeAbort = source.match(/requestRef\.current = null;\s+controller\?\.abort\(\)/g) || [];

  assert.ok(controllerCreations.length >= 4);
  assert.ok(guardedWrites.length >= 12);
  assert.ok(requestSignals.length >= 4);
  assert.ok(clearedBeforeAbort.length >= 4);
  assert.match(source, /requestError\.code !== 'REQUEST_ABORTED'/);
});

test('operational search results route through existing console navigation', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');
  assert.match(source, /onNavigate\(resolveConsoleView\(result\.view\)\)/);
  assert.match(source, /<ExternalLink size=\{15\} \/>进入模块/);
});
