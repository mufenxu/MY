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
