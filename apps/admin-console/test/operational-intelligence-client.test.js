import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

test('monitoring view keeps advanced intelligence out of the single-person daily surface', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');
  const app = readSource('src', 'client', 'Dashboard.jsx');
  const monitoringView = source.slice(
    source.indexOf('export function MonitoringView'),
    source.indexOf('export function IncidentsView'),
  );

  assert.match(monitoringView, /<TrendMonitoringPanel services=\{services\} \/>/);
  assert.doesNotMatch(monitoringView, /SloPanel|ChangeCalendarPanel|OperationalSearchPanel|SegmentedTabs/);
  assert.match(app, /<MonitoringView services=\{services\} \/>/);
  assert.doesNotMatch(source, /command.palette|command-palette|CommandPalette/i);
});

test('operational reads cancel stale requests before applying results', () => {
  const source = readSource('src', 'client', 'OperationsViews.jsx');
  const hook = readSource('src', 'client', 'useLatestRequest.js');
  const combined = source + hook;
  const controllerCreations = combined.match(/const controller = new AbortController\(\)/g) || [];
  const guardedWrites = combined.match(/requestRef\.current === controller/g) || [];
  const requestSignals = source.match(/\{ signal(?:: controller\.signal)? \}/g) || [];
  const clearedBeforeAbort = combined.match(/requestRef\.current = null;\s+controller\?\.abort\(\)/g) || [];

  assert.equal((source.match(/useLatestRequest\(\)/g) || []).length, 2);
  assert.ok(controllerCreations.length >= 1);
  assert.ok(guardedWrites.length >= 3);
  assert.ok(requestSignals.length >= 2);
  assert.ok(clearedBeforeAbort.length >= 1);
  assert.match(hook, /requestError\.code !== 'REQUEST_ABORTED'/);
});
