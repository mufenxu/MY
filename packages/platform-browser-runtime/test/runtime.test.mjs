import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlatformBrowserRuntime } from '../index.js';

test('managed app paths are resolved and stripped consistently', () => {
  global.window = {
    location: { pathname: '/apps/exam/dashboard', search: '', hash: '', replace() {} },
  };
  const runtime = createPlatformBrowserRuntime({ appName: 'exam' });

  assert.equal(runtime.APP_BASE_PATH, '/apps/exam');
  assert.equal(runtime.API_BASE_PATH, '/apps/exam/api');
  assert.equal(runtime.resolveAppUrl('/favicon.png'), '/apps/exam/favicon.png');
  assert.equal(runtime.stripAppBase('/apps/exam/dashboard'), '/dashboard');
  delete global.window;
});

test('standalone apps keep root-relative URLs unchanged', () => {
  global.window = {
    location: { pathname: '/dashboard', search: '', hash: '', replace() {} },
  };
  const runtime = createPlatformBrowserRuntime({ appName: 'core' });

  assert.equal(runtime.APP_BASE_PATH, '');
  assert.equal(runtime.API_BASE_PATH, '/api');
  assert.equal(runtime.resolveAppUrl('/favicon.png'), '/favicon.png');
  delete global.window;
});

test('managed apps redirect expired sessions through the console login', () => {
  let replacement = '';
  global.window = {
    location: {
      pathname: '/apps/core/dashboard',
      search: '?tab=users',
      hash: '#recent',
      replace(value) { replacement = value; },
    },
  };
  const runtime = createPlatformBrowserRuntime({ appName: 'core' });

  runtime.redirectToPlatformLogin();

  assert.equal(replacement, '/console?returnTo=%2Fapps%2Fcore%2Fdashboard%3Ftab%3Dusers%23recent');
  delete global.window;
});
