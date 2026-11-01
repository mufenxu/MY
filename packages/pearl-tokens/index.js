/**
 * 珍珠玻璃（Pearl Glass）设计令牌的 JS 视图。
 *
 * CSS 变量版在 ./tokens.css，供手写样式消费；这里导出同一套数值，
 * 供带 UI 组件库的应用把它们映射到库自己的主题系统
 * （antd 的 ConfigProvider.theme.token、Element Plus 的 --el-* 变量）。
 * 两处数值必须保持一致：改这里时同步改 tokens.css。
 */

export const palette = {
  light: {
    ink: '#101418',
    inkMuted: '#596368',
    inkSoft: '#7e888c',
    inkFaint: '#99a2a5',
    blue: '#236de9',
    blueHover: '#1d61d5',
    lime: '#82dd2d',
    leafText: '#3f7a12',
    red: '#d63c33',
    redText: '#cf3a31',
    redSwatch: '#ff5a50',
    amber: '#b26205',
    violet: '#6b53c8',
    teal: '#0f7f8f',
    canvas: '#f4f6f5',
    stage: '#dfe3e2',
    surface: '#fbfcfc',
    surfaceSolid: '#fbfcfc',
    groove: '#e1e7e5',
    inputBg: 'rgba(255, 255, 255, 0.78)',
    line: 'rgba(46, 58, 62, 0.085)',
    lineStrong: 'rgba(46, 58, 62, 0.11)',
    hover: 'rgba(46, 58, 62, 0.045)',
  },
  dark: {
    ink: '#eef2f1',
    inkMuted: '#b0babd',
    inkSoft: '#8d979a',
    inkFaint: '#6c7679',
    blue: '#4c8dff',
    blueHover: '#3d7ff2',
    lime: '#82dd2d',
    leafText: '#9be35a',
    red: '#ff7a71',
    redText: '#ff8a82',
    redSwatch: '#ff5a50',
    amber: '#e0a244',
    violet: '#a993f0',
    teal: '#58c3d2',
    canvas: '#121517',
    stage: '#090b0c',
    surface: '#1b1f21',
    surfaceSolid: '#1b1f21',
    groove: 'rgba(0, 0, 0, 0.22)',
    inputBg: 'rgba(255, 255, 255, 0.04)',
    line: 'rgba(255, 255, 255, 0.07)',
    lineStrong: 'rgba(255, 255, 255, 0.1)',
    hover: 'rgba(255, 255, 255, 0.05)',
  },
};

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

export const control = {
  height: 34,
  heightSm: 29,
  rowHeight: 52,
  cellPx: 16,
};

export const font = {
  sans: '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
};

/** 取某一主题下的完整色板；mode 只接受 'light' | 'dark'。 */
export function resolvePalette(mode = 'light') {
  return palette[mode === 'dark' ? 'dark' : 'light'];
}

export default { palette, radius, control, font, resolvePalette };
