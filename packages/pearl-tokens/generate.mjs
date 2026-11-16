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
const outputs = new Map([
  [path.join(packageRoot, 'index.js'), index],
  [path.join(workspaceRoot, 'apps/admin-console/public/theme-bootstrap.js'), bootstrap],
  [path.join(workspaceRoot, 'apps/core-admin/public/theme-bootstrap.js'), bootstrap + coreMetadata],
  [path.join(workspaceRoot, 'apps/exam-admin/public/theme-bootstrap.js'), bootstrap],
  [path.join(workspaceRoot, 'apps/official-website/public/website-assets/theme-bootstrap.js'), bootstrap],
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
