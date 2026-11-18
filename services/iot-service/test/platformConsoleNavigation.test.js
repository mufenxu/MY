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

test('platform console deep links select the requested tab', async () => {
  const [source, registry] = await Promise.all([
    readFile('public/app.js', 'utf8'),
    readFile('../../config/platform.services.docker.json', 'utf8')
  ]);

  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('page'\)/);
  assert.match(source, /switchTab\(paneMeta\[requestedTab\] \? requestedTab : savedTab\)/);

  // 控制台登记的每个 ?page= 入口都必须是真实存在的板块。
  const paneBlock = source.match(/const paneMeta = \{([\s\S]*?)\n\};/)[1];
  const panes = new Set([...paneBlock.matchAll(/^\s{2}([a-z]+):/gm)].map((match) => match[1]));
  const linked = [...registry.matchAll(/\/apps\/iot\/\?page=([a-z-]+)/g)].map((match) => match[1]);
  assert.ok(linked.length > 0);
  for (const page of linked) assert.ok(panes.has(page), `unknown IoT page in service registry: ${page}`);
});

test('logout keeps the signed-in UI when the server cannot end the session', async () => {
  const source = await readFile('public/app.js', 'utf8');
  const handler = source.match(/async function handleLogout\(\) \{[\s\S]*?\n\}\n/)[0];

  assert.match(handler, /if \(!response\.ok\) throw new Error/);
  assert.match(handler, /catch \(error\) \{[\s\S]*?showToast\('退出失败'[\s\S]*?return;/);
  assert.doesNotMatch(handler, /\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(handler, /finally \{\s*state\.authenticated = false/);
});

test('confirm dialogs never treat Enter on the cancel button as confirmation', async () => {
  const source = await readFile('public/js/uiFeedback.js', 'utf8');

  assert.match(source, /if \(event\.key === 'Enter'\) \{[\s\S]*?if \(document\.activeElement === cancelBtn\) return;[\s\S]*?onConfirm\(\);/);
  assert.match(source, /else if \(type === 'danger'\) \{[\s\S]*?cancelBtn\.focus\(\);/);
});

test('theme, auto-refresh and rule toggles stay reachable from the keyboard', async () => {
  const styles = await readFile('public/styles.css', 'utf8');
  const rule = styles.match(/\.toggle-control input \{([^}]*)\}/)[1];

  // display:none 会把复选框从 Tab 顺序和读屏里移除。
  assert.doesNotMatch(rule, /display:\s*none/);
  assert.match(styles, /\.toggle-control input:focus-visible \+ \.toggle-track \{/);
});

test('custom selects follow programmatic changes to the native control', async () => {
  const source = await readFile('public/js/formEnhancements.js', 'utf8');

  assert.match(source, /new MutationObserver\(sync\)\.observe\(select,/);
  assert.match(source, /Object\.getOwnPropertyDescriptor\(global\.HTMLSelectElement\.prototype, property\)/);
  assert.match(source, /select\.form\.addEventListener\('reset'/);
  // 委托在父容器上的监听器依赖冒泡。
  assert.match(source, /new Event\('change', \{ bubbles: true \}\)/);
});

test('device, relay and key identifiers are encoded in request paths', async () => {
  const [grid, keys] = await Promise.all([
    readFile('public/js/deviceGridView.js', 'utf8'),
    readFile('public/js/apiKeysView.js', 'utf8')
  ]);

  assert.doesNotMatch(grid, /\/api\/devices\/\$\{deviceId\}/);
  assert.doesNotMatch(grid, /\/relays\/\$\{relayId\}/);
  assert.doesNotMatch(keys, /\/api\/keys\/\$\{keyId\}/);
});

test('realtime channel keeps retrying and toasts ignore per-request ids', async () => {
  const [source, feedback] = await Promise.all([
    readFile('public/app.js', 'utf8'),
    readFile('public/js/uiFeedback.js', 'utf8')
  ]);

  assert.doesNotMatch(source, /已停止自动重连/);
  assert.match(source, /window\.addEventListener\('online', reconnectRealtimeNow\)/);

  const dedupeKey = (title, desc) => `${title}:${String(desc).replace(/\s*\[[0-9a-f-]{6,}\]\s*$/i, '')}`;
  assert.match(feedback, /String\(desc\)\.replace\(\/\\s\*\\\[\[0-9a-f-\]\{6,\}\\\]\\s\*\$\/i, ''\)/);
  assert.equal(dedupeKey('自动刷新异常', '服务不可用 [1a2b3c4d]'), dedupeKey('自动刷新异常', '服务不可用 [9f8e7d6c]'));
  assert.notEqual(dedupeKey('自动刷新异常', '服务不可用'), dedupeKey('自动刷新异常', '请求超时'));
});
