const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const test = require('node:test');

test('platform console link follows the verified SSO state', async () => {
  const [html, source, apiClient] = await Promise.all([
    readFile('public/index.html', 'utf8'),
    readFile('public/app.js', 'utf8'),
    readFile('public/js/apiClient.js', 'utf8')
  ]);

  assert.match(html, /id="platform-console-link"[^>]*href="\/console"/);
  assert.match(html, /id="platform-console-link"[^>]*class="[^"]*\bhidden\b/);
  assert.match(source, /platformConsoleLink\.classList\.toggle\('hidden', !state\.platformSso \|\| !state\.authenticated\)/);
  assert.match(apiClient, /location\.replace\(`\/console\?returnTo=\$\{encodeURIComponent\(returnTo\)\}`\)/);
});
