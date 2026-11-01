/**
 * 珍珠令牌的一致性闸门。
 *
 * 这里只做「机械可验证」的部分：CSS 变量是否齐全、JS 色板与 CSS 数值是否同步、
 * components.css 引用的变量是否都真实存在。视觉判断留给人工与截图。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { control, palette, radius, resolvePalette } from '../index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readPackageFile = (name) => fs.readFileSync(path.join(packageRoot, name), 'utf8');

const tokensCss = readPackageFile('tokens.css');
const componentsCss = readPackageFile('components.css');

/** 取某个选择器块里声明的变量，值统一去掉空白并转小写，方便跨写法比较。 */
const readBlock = (css, selector) => {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `tokens.css 里找不到 ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const map = new Map();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(name, value.trim().replace(/\s+/g, ' '));
  }
  return map;
};

const light = readBlock(tokensCss, ':root {');
const darkOverrides = readBlock(tokensCss, ':root[data-theme="dark"]');
// 暗色作用域只覆盖需要变的令牌，其余沿用 :root
const dark = new Map([...light, ...darkOverrides]);

const normalize = (value) => value.replace(/\s+/g, '').toLowerCase();

/** 把 var(--x) 就地展开，才能拿 CSS 的复合写法和 JS 里的字面值比较。 */
const resolveVars = (value, scope, depth = 0) => {
  if (depth > 4 || !value.includes('var(')) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (whole, name) => {
    const next = scope.get(name);
    return next ? resolveVars(next, scope, depth + 1) : whole;
  });
};

test('光明与暗色两套作用域都声明了核心色板', () => {
  const core = [
    '--ink',
    '--ink-muted',
    '--ink-soft',
    '--ink-faint',
    '--blue',
    '--lime',
    '--red',
    '--amber',
    '--violet',
    '--teal',
    '--canvas',
    '--surface-solid',
    '--line',
    '--r-md',
    '--control-h',
  ];
  for (const name of core) {
    assert.ok(light.has(name), `:root 缺少 ${name}`);
    assert.ok(dark.has(name), `暗色作用域缺少 ${name}`);
  }
});

test('JS 色板与 tokens.css 的数值保持一致', () => {
  const parity = {
    '--ink': 'ink',
    '--ink-muted': 'inkMuted',
    '--ink-soft': 'inkSoft',
    '--ink-faint': 'inkFaint',
    '--blue': 'blue',
    '--lime': 'lime',
    '--leaf-text': 'leafText',
    '--red': 'red',
    '--red-text': 'redText',
    '--amber': 'amber',
    '--violet': 'violet',
    '--teal': 'teal',
    '--canvas': 'canvas',
    '--stage': 'stage',
    '--surface-solid': 'surfaceSolid',
    '--input-bg': 'inputBg',
    '--line': 'line',
    '--line-strong': 'lineStrong',
  };

  for (const [variable, key] of Object.entries(parity)) {
    assert.equal(
      normalize(resolveVars(light.get(variable) ?? '', light)),
      normalize(palette.light[key]),
      `:root 的 ${variable} 与 palette.light.${key} 不一致`,
    );
    assert.equal(
      normalize(resolveVars(dark.get(variable) ?? '', dark)),
      normalize(palette.dark[key]),
      `暗色作用域的 ${variable} 与 palette.dark.${key} 不一致`,
    );
  }
});

test('标尺数值与 CSS 变量对齐', () => {
  for (const [key, px] of Object.entries(radius)) {
    assert.equal(light.get(`--r-${key}`), `${px}px`, `--r-${key} 应是 ${px}px`);
  }
  assert.equal(light.get('--control-h'), `${control.height}px`);
  assert.equal(light.get('--control-h-sm'), `${control.heightSm}px`);
});

test('components.css 不引用不存在的变量', () => {
  const declared = new Set([
    ...light.keys(),
    ...dark.keys(),
    ...readBlock(componentsCss, '.btn {').keys(),
  ]);
  // 组件内部自建的局部变量与 @property 注册的变量
  for (const [, name] of componentsCss.matchAll(/(--[\w-]+)\s*:/g)) declared.add(name);
  for (const [, name] of tokensCss.matchAll(/@property\s+(--[\w-]+)/g)) declared.add(name);

  const missing = new Set();
  for (const [, name] of componentsCss.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!declared.has(name)) missing.add(name);
  }

  assert.deepEqual([...missing], [], `components.css 引用了未定义的变量：${[...missing].join(', ')}`);
});

test('主题切换可解析出对应色板', () => {
  assert.equal(resolvePalette(), palette.light);
  assert.equal(resolvePalette('dark'), palette.dark);
  assert.equal(resolvePalette('whatever'), palette.light);
});

test('导出入口完整', () => {
  for (const name of ['tokens.css', 'components.css']) {
    assert.ok(readPackageFile(name).length > 0, `${name} 不应为空`);
  }
  assert.ok(tokensCss.includes('@property --fill'), 'tokens.css 应注册 @property --fill');
});
