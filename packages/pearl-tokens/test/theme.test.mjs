import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { palette } from '../index.js';

const storageKey = 'my-platform-theme';
const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const sources = {
  runtime: `const palette = ${JSON.stringify(palette)};\n`
    + read('../theme.js').replace(/^import .*;\r?\n/m, '').replace(/^export /gm, '')
    + '\nwindow.myPlatformTheme = { initTheme, setTheme, subscribeTheme, getThemePreference, getCurrentTheme };',
  console: read('../../../apps/admin-console/public/theme-bootstrap.js'),
  core: read('../../../apps/core-admin/public/theme-bootstrap.js'),
  exam: read('../../../apps/exam-admin/public/theme-bootstrap.js'),
  website: read('../../../apps/official-website/public/website-assets/theme-bootstrap.js'),
};

function browser(source, { stored = {}, systemDark = false, restricted = false } = {}) {
  const storage = new Map(Object.entries(stored));
  const classes = new Set();
  const media = new EventTarget();
  media.matches = systemDark;
  const window = new EventTarget();
  window.location = { pathname: '/' };
  window.localStorage = {
    getItem(key) {
      if (restricted) throw new Error('storage denied');
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (restricted) throw new Error('storage denied');
      storage.set(key, value);
    },
  };
  let mediaReads = 0;
  window.matchMedia = () => { mediaReads += 1; return media; };
  const root = {
    dataset: { themeLegacyKey: 'legacy-theme' },
    style: {},
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
  };
  const meta = {};
  const document = {
    documentElement: root,
    querySelector: () => ({ setAttribute: (key, value) => { meta[key] = value; } }),
  };
  vm.runInNewContext(source, { window, document, Event });
  const api = window.myPlatformTheme;
  api.initTheme();
  return {
    api, root, storage, classes, meta,
    get mediaReads() { return mediaReads; },
    system(dark) { media.matches = dark; media.dispatchEvent(new Event('change')); },
    storageEvent(key, newValue) {
      if (key === null) storage.clear();
      else if (newValue === null) storage.delete(key);
      else storage.set(key, newValue);
      const event = new Event('storage');
      Object.assign(event, { key, newValue });
      window.dispatchEvent(event);
    },
  };
}

for (const [name, source] of Object.entries(sources)) {
  test(`${name}: 浅色默认值与首次旧偏好迁移`, () => {
    const initial = browser(source);
    assert.equal(initial.api.getCurrentTheme(), 'light');
    assert.equal(initial.storage.get(storageKey), 'light');
    for (const preference of ['light', 'dark', 'system']) {
      const migrated = browser(source, { stored: { 'legacy-theme': preference } });
      assert.equal(migrated.api.getThemePreference(), preference);
      assert.equal(migrated.storage.get(storageKey), preference);
    }
  });

  test(`${name}: 统一偏好优先于旧偏好，忽略无效存储值`, () => {
    const current = browser(source, { stored: { [storageKey]: 'light', 'legacy-theme': 'dark' } });
    assert.equal(current.api.getCurrentTheme(), 'light');
    const invalid = browser(source, { stored: { [storageKey]: 'invalid', 'legacy-theme': 'invalid' } });
    assert.equal(invalid.api.getThemePreference(), 'light');
  });

  test(`${name}: 跟随系统且手动选择停止跟随`, () => {
    const env = browser(source, { stored: { [storageKey]: 'system' }, systemDark: true });
    assert.equal(env.api.getCurrentTheme(), 'dark');
    env.system(false);
    assert.equal(env.api.getCurrentTheme(), 'light');
    assert.equal(env.api.getThemePreference(), 'system');
    env.api.setTheme('dark');
    env.system(true);
    env.system(false);
    assert.equal(env.api.getCurrentTheme(), 'dark');
    env.api.setTheme('invalid');
    assert.equal(env.api.getThemePreference(), 'light');
  });

  test(`${name}: 标签页同步、移除偏好与清空存储`, () => {
    const env = browser(source);
    env.storageEvent(storageKey, 'dark');
    assert.equal(env.api.getCurrentTheme(), 'dark');
    env.storageEvent('unrelated-key', 'light');
    assert.equal(env.api.getCurrentTheme(), 'dark');
    env.storageEvent(storageKey, null);
    assert.equal(env.api.getThemePreference(), 'light');
    env.api.setTheme('dark');
    env.storageEvent(null, null);
    assert.equal(env.api.getCurrentTheme(), 'light');
    env.storageEvent(storageKey, 'invalid');
    assert.equal(env.api.getThemePreference(), 'light');
  });

  test(`${name}: 受限存储仍记住本页偏好并跟随系统`, () => {
    const env = browser(source, { restricted: true });
    env.api.setTheme('system');
    env.system(true);
    assert.equal(env.api.getThemePreference(), 'system');
    assert.equal(env.api.getCurrentTheme(), 'dark');
    env.api.setTheme('light');
    env.system(true);
    assert.equal(env.api.getCurrentTheme(), 'light');
  });

  test(`${name}: 重复初始化不重复绑定，订阅可以解除`, () => {
    const env = browser(source);
    const reads = env.mediaReads;
    env.api.initTheme();
    env.api.initTheme();
    assert.equal(env.mediaReads, reads);
    let changes = 0;
    const unsubscribe = env.api.subscribeTheme(() => { changes += 1; });
    env.api.setTheme('system');
    env.system(true);
    assert.equal(changes, 2);
    unsubscribe();
    env.api.setTheme('light');
    assert.equal(changes, 2);
  });

  test(`${name}: 主题更新根节点、系统控件与浏览器颜色`, () => {
    const env = browser(source);
    env.api.setTheme('dark');
    assert.equal(env.root.style.colorScheme, 'dark');
    assert.equal(env.root.style.color, palette.dark.ink);
    assert.equal(env.root.style.backgroundColor, palette.dark.stage);
    assert.equal(env.meta.content, palette.dark.stage);
    assert.equal(env.classes.has('dark'), true);
    env.root.dataset.themeBackground = 'canvas';
    env.api.setTheme('light');
    assert.equal(env.root.style.backgroundColor, palette.light.canvas);
    assert.equal(env.classes.has('dark'), false);
  });
}
