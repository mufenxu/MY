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

  assert.match(app, /import AutomationView from '\.\/AutomationView\.jsx'/);
  assert.doesNotMatch(app, /function AutomationView/);
  assert.match(automation, /CT8_API_BASE = '\/apps\/core\/api\/ct8'/);
  assert.doesNotMatch(automation, /\/github\//);
});
