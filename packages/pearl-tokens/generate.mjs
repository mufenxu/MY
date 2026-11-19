import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(packageRoot, '../..');
const css = readFileSync(path.join(packageRoot, 'tokens.css'), 'utf8');
const block = (selector) => {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map(([, key, value]) => [key, value.trim().replace(/\s+/g, ' ')]));
};
const light = block(':root {');
const dark = { ...light, ...block(':root[data-theme="dark"] {') };
const resolve = (name, scope) => {
  if (!(name in scope)) throw new Error(`缺少设计令牌 ${name}`);
  return scope[name].replace(/var\((--[\w-]+)\)/g, (_, key) => resolve(key, scope));
};
const paletteKeys = {
  ink: '--ink', inkMuted: '--ink-muted', inkSoft: '--ink-soft', inkFaint: '--ink-faint',
  blue: '--blue', blueHover: '--blue-hover', lime: '--lime', leafText: '--leaf-text',
  red: '--red', redText: '--red-text', redSwatch: '--red-swatch', amber: '--amber',
  violet: '--violet', teal: '--teal', canvas: '--canvas', stage: '--stage',
  surface: '--surface-solid', surfaceSolid: '--surface-solid', groove: '--groove-bg',
  inputBg: '--input-bg', line: '--line', lineStrong: '--line-strong', hover: '--hover-bg',
};
const colors = (scope) => Object.fromEntries(Object.entries(paletteKeys)
  .map(([key, variable]) => [key, resolve(variable, scope)]));
const numeric = (keys) => Object.fromEntries(Object.entries(keys)
  .map(([key, variable]) => [key, Number.parseFloat(resolve(variable, light))]));
const palette = { light: colors(light), dark: colors(dark) };
const radius = numeric({ xs: '--r-xs', sm: '--r-sm', md: '--r-md', lg: '--r-lg', xl: '--r-xl' });
const control = numeric({ height: '--control-h', heightSm: '--control-h-sm', heightLg: '--control-h-lg',
  rowHeight: '--row-h', cellPx: '--cell-px', tableHeadHeight: '--table-head-h' });
const typography = numeric({ caption: '--type-caption', label: '--type-label', body: '--type-body',
  control: '--type-control', table: '--type-table', tableHeader: '--type-table-header' });
const spacing = numeric({ sm: '--space-sm', md: '--space-md', lg: '--space-lg', xl: '--space-xl' });
const font = { sans: resolve('--font-sans', light), mono: resolve('--font-mono', light) };
const header = '// 由 packages/pearl-tokens/generate.mjs 从 tokens.css 自动生成，请修改源文件后运行 npm run generate。\n';
const declaration = (name, value) => `export const ${name} = ${JSON.stringify(value, null, 2)};\n`;
const index = header + '\n' + Object.entries({ palette, radius, control, typography, spacing, font })
  .map(([name, value]) => declaration(name, value)).join('\n')
  + "\nexport function resolvePalette(mode = 'light') {\n  return palette[mode === 'dark' ? 'dark' : 'light'];\n}\n"
  + '\nexport default { palette, radius, control, typography, spacing, font, resolvePalette };\n';
const theme = readFileSync(path.join(packageRoot, 'theme.js'), 'utf8')
  .replace(/^import .*;\r?\n/m, '')
  .replace(/^export /gm, '');
const bootstrap = header + '(function () {\n'
  + `const palette = ${JSON.stringify(Object.fromEntries(Object.entries(palette).map(([mode, values]) => [mode,
    { stage: values.stage, canvas: values.canvas, ink: values.ink }])))};\n`
  + theme + '\nwindow.myPlatformTheme = { getThemePreference, getCurrentTheme, setTheme, subscribeTheme, initTheme };\n'
  + 'initTheme();\n})();\n';
const coreMetadata = "\nif (/\\/query\\/?$/i.test(window.location.pathname)) {\n"
  + "  document.title = '学习记录自查';\n"
  + "  document.querySelector('meta[name=\"description\"]')?.setAttribute('content', '学习记录自查');\n}\n";

/* ── 「返回统一控制台」单组件分发 ────────────────────────────────────────────
   campus-service 与 iot-service 是未接入珍珠令牌的老页面：它们各自有独立的
   色板与深浅色机制（body.dark-theme / 默认暗色 + data-theme="light"），
   直接引入 2000 多行 components.css 会带来 .btn/.field 这类通用类的冲突风险。
   所以这里只把标记之间的那一段组件样式原样发过去，颜色令牌按本页色板映射。
   规则本身仍以 components.css 为唯一来源。 */
const componentsCss = readFileSync(path.join(packageRoot, 'components.css'), 'utf8');
const switchStartMarker = '/* --- pearl-console-switch:start';
const switchEndMarker = '/* --- pearl-console-switch:end --- */';
const switchStart = componentsCss.indexOf(switchStartMarker);
const switchEnd = componentsCss.indexOf(switchEndMarker, switchStart);
if (switchStart < 0 || switchEnd < 0) {
  throw new Error('components.css 里缺少 pearl-console-switch 的 start/end 提取标记');
}
// 跳过 start 标记自身的注释块，产出文件里不留「会被提取」这类只对源文件有意义的说明。
const switchRules = componentsCss
  .slice(componentsCss.indexOf('*/', switchStart) + 2, switchEnd)
  .trim();
const tokenBlock = (selector, tokens) => `${selector} {\n${
  Object.entries(tokens).map(([name, value]) => `  ${name}: ${value};`).join('\n')
}\n}\n`;
const consoleSwitchFile = (blocks, tail = '') => [
  '/* 由 packages/pearl-tokens/generate.mjs 自动生成，不要手改。',
  '   组件几何与排版来自 components.css 里的 pearl-console-switch 段落；',
  '   颜色令牌按本页自己的色板映射，因为这几页没有接入珍珠令牌。 */',
  '',
  ...blocks.map(([selector, tokens]) => tokenBlock(selector, tokens)),
  switchRules,
  ...(tail ? [tail] : []),
  ''
].join('\n');

const campusSwitch = consoleSwitchFile([
  ['.pearl-console-switch', {
    '--surface': 'rgba(255, 255, 255, 0.72)',
    '--surface-solid': '#ffffff',
    '--ink': '#0f172a',
    '--ink-soft': '#475569',
    '--ink-faint': '#64748b',
    '--line-strong': 'rgba(15, 23, 42, 0.11)',
    '--glass-border-hover': 'rgba(2, 132, 199, 0.42)',
    '--blue': '#0284c7',
    '--focus': 'rgba(2, 132, 199, 0.72)',
    '--edge': 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
    '--edge-strong': 'inset 0 1px 0 #ffffff',
    '--e1': '0 1px 2px rgba(15, 23, 42, 0.05), 0 5px 14px rgba(15, 23, 42, 0.04)',
    '--e2': '0 1px 3px rgba(15, 23, 42, 0.07), 0 12px 30px rgba(15, 23, 42, 0.07)',
    '--type-caption': '12.5px'
  }],
  ['body.dark-theme .pearl-console-switch', {
    '--surface': 'rgba(31, 41, 55, 0.62)',
    '--surface-solid': 'rgba(31, 41, 55, 0.92)',
    '--ink': '#f3f4f6',
    '--ink-soft': '#cbd5e1',
    '--ink-faint': '#94a3b8',
    '--line-strong': 'rgba(255, 255, 255, 0.14)',
    '--glass-border-hover': 'rgba(56, 189, 248, 0.5)',
    '--blue': '#38bdf8',
    '--focus': 'rgba(56, 189, 248, 0.75)',
    '--edge': 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    '--edge-strong': 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
    '--e1': '0 1px 2px rgba(0, 0, 0, 0.3), 0 5px 14px rgba(0, 0, 0, 0.2)',
    '--e2': '0 1px 3px rgba(0, 0, 0, 0.34), 0 12px 30px rgba(0, 0, 0, 0.28)',
    '--type-caption': '12.5px'
  }],
  ['#platformConsoleLink.pearl-console-switch', {
    // 这一页桌面端把顶栏转成左侧栏，动作区是一列 46px 的整宽按钮；
    // 尺寸让给页面自己的 .actions a 决定，这里只把「材质」换成珍珠的。
    color: 'var(--ink-soft)',
    background: 'var(--surface)',
    border: '1px solid var(--line-strong)',
    'box-shadow': 'var(--edge), var(--e1)'
  }],
  ['#platformConsoleLink.pearl-console-switch:hover', {
    color: 'var(--ink)',
    background: 'var(--surface-solid)',
    'border-color': 'var(--glass-border-hover)',
    'box-shadow': 'var(--edge-strong), var(--e2)'
  }]
], `/* 收成纯图标后要压回 32×32 方钮：本页没有全局 border-box，.actions a 还带着 18px 横向内距。 */
@media (max-width: 768px) {
  #platformConsoleLink.pearl-console-switch {
    box-sizing: border-box;
    padding: 0;
  }
}`);

const iotSwitch = consoleSwitchFile([
  ['.pearl-console-switch', {
    '--surface': 'rgba(22, 32, 53, 0.78)',
    '--surface-solid': 'rgba(30, 42, 68, 0.96)',
    '--ink': '#f3f4f6',
    '--ink-soft': '#cbd5e1',
    '--ink-faint': '#94a3b8',
    '--line-strong': 'rgba(255, 255, 255, 0.12)',
    '--glass-border-hover': 'rgba(129, 140, 248, 0.5)',
    '--blue': '#818cf8',
    '--focus': 'rgba(129, 140, 248, 0.75)',
    '--edge': 'inset 0 1px 0 rgba(255, 255, 255, 0.07)',
    '--edge-strong': 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
    '--e1': '0 1px 2px rgba(0, 0, 0, 0.35), 0 5px 14px rgba(0, 0, 0, 0.22)',
    '--e2': '0 1px 3px rgba(0, 0, 0, 0.4), 0 12px 30px rgba(0, 0, 0, 0.3)',
    '--type-caption': '12.5px'
  }],
  ['[data-theme="light"] .pearl-console-switch', {
    '--surface': 'rgba(255, 255, 255, 0.86)',
    '--surface-solid': '#ffffff',
    '--ink': '#111827',
    '--ink-soft': '#4b5563',
    '--ink-faint': '#6b7280',
    '--line-strong': 'rgba(17, 24, 39, 0.1)',
    '--glass-border-hover': 'rgba(99, 102, 241, 0.4)',
    '--blue': '#4f46e5',
    '--focus': 'rgba(79, 70, 229, 0.7)',
    '--edge': 'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
    '--edge-strong': 'inset 0 1px 0 #ffffff',
    '--e1': '0 1px 2px rgba(15, 23, 42, 0.05), 0 5px 14px rgba(15, 23, 42, 0.04)',
    '--e2': '0 1px 3px rgba(15, 23, 42, 0.07), 0 12px 30px rgba(15, 23, 42, 0.07)',
    '--type-caption': '12.5px'
  }],
  ['#platform-console-link.pearl-console-switch', {
    // 尺寸对齐本页 .button 的其余按钮，只把材质换成珍珠的。
    height: 'auto',
    padding: '9px 18px',
    'border-radius': '10px',
    gap: '8px',
    'font-size': '0.88rem',
    'font-weight': '600',
    color: 'var(--ink-soft)',
    background: 'var(--surface)',
    border: '1px solid var(--line-strong)',
    'box-shadow': 'var(--edge), var(--e1)'
  }],
  ['#platform-console-link.pearl-console-switch:hover', {
    color: 'var(--ink)',
    background: 'var(--surface-solid)',
    'border-color': 'var(--glass-border-hover)',
    'box-shadow': 'var(--edge-strong), var(--e2)'
  }]
], `/* 本页窄屏时 .topbar-actions 会竖排成一列整宽按钮，收成纯图标会变成一条空条，
   所以这里保留文字，只把尺寸还原成普通按钮。 */
@media (max-width: 768px) {
  #platform-console-link.pearl-console-switch {
    box-sizing: border-box;
    width: auto;
    height: auto;
    padding: 9px 18px;
  }

  #platform-console-link.pearl-console-switch > span {
    display: inline;
  }
}`);

const outputs = new Map([
  [path.join(packageRoot, 'index.js'), index],
  [path.join(workspaceRoot, 'apps/admin-console/public/theme-bootstrap.js'), bootstrap],
  [path.join(workspaceRoot, 'apps/core-admin/public/theme-bootstrap.js'), bootstrap + coreMetadata],
  [path.join(workspaceRoot, 'apps/exam-admin/public/theme-bootstrap.js'), bootstrap],
  [path.join(workspaceRoot, 'apps/official-website/public/website-assets/theme-bootstrap.js'), bootstrap],
  [path.join(workspaceRoot, 'services/campus-service/public/console-switch.css'), campusSwitch],
  [path.join(workspaceRoot, 'services/iot-service/public/console-switch.css'), iotSwitch],
]);
for (const [file, content] of outputs) {
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
      throw new Error(`${path.relative(workspaceRoot, file)} 与设计源文件不同步，请运行 npm run generate`);
    }
  } else {
    writeFileSync(file, content);
  }
}
console.log(process.argv.includes('--check') ? '设计令牌与主题引导文件已同步' : '已生成设计令牌与主题引导文件');
