import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sendCallback, validateCallbackTarget } from './release-workflow-callback.mjs';

const callbackUrl = 'https://platform.example.com/api/releases/callback';
const allowedOrigin = 'https://platform.example.com';

test('release callback target is bound to the protected HTTPS origin and fixed path', () => {
  assert.equal(validateCallbackTarget(callbackUrl, allowedOrigin), callbackUrl);
  for (const [target, origin] of [
    ['http://platform.example.com/api/releases/callback', 'http://platform.example.com'],
    ['https://attacker.example/api/releases/callback', allowedOrigin],
    ['https://platform.example.com/redirect', allowedOrigin],
    ['https://platform.example.com/api/releases/callback?next=evil', allowedOrigin],
    [callbackUrl, 'https://platform.example.com/base'],
  ]) {
    assert.throws(() => validateCallbackTarget(target, origin), /protected HTTPS origin/);
  }
});

test('release callback rejects partial configuration and disables redirects', async () => {
  await assert.rejects(
    sendCallback({ env: { RELEASE_CALLBACK_URL: callbackUrl }, sleep: async () => {} }),
    /configured together/,
  );

  let request;
  await sendCallback({
    env: {
      RELEASE_CALLBACK_URL: callbackUrl,
      RELEASE_CALLBACK_ALLOWED_ORIGIN: allowedOrigin,
      RELEASE_CALLBACK_TOKEN: 't'.repeat(32),
      RELEASE_ID: 'release-1',
      RELEASE_STATUS: 'success',
      RELEASE_TARGETS: 'core,platform',
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 202 };
    },
    sleep: async () => {},
  });

  assert.equal(request.url, callbackUrl);
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, `Bearer ${'t'.repeat(32)}`);
  assert.deepEqual(JSON.parse(request.options.body).targets, ['core', 'platform']);
});

test('ACR workflow has no callback URL input and protects manual production promotion', async () => {
  const workflow = await readFile(new URL('../.github/workflows/aliyun-acr.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /callback_url:/);
  assert.doesNotMatch(workflow, /github\.event\.inputs\.callback_url/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /GITHUB_REF[^\n]+refs\/heads\/main/);
  assert.match(workflow, /RELEASE_CALLBACK_ALLOWED_ORIGIN:\s*\$\{\{ vars\.PLATFORM_RELEASE_CALLBACK_ORIGIN \}\}/);
});
