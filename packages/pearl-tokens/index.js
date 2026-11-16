// 由 packages/pearl-tokens/generate.mjs 从 tokens.css 自动生成，请修改源文件后运行 npm run generate。

export const palette = {
  "light": {
    "ink": "#101418",
    "inkMuted": "#596368",
    "inkSoft": "#5f6b70",
    "inkFaint": "#637075",
    "blue": "#236de9",
    "blueHover": "#1d61d5",
    "lime": "#82dd2d",
    "leafText": "#3f7a12",
    "red": "#d63c33",
    "redText": "#cf3a31",
    "redSwatch": "#ff5a50",
    "amber": "#b26205",
    "violet": "#6b53c8",
    "teal": "#0f7f8f",
    "canvas": "#f4f6f5",
    "stage": "#dfe3e2",
    "surface": "#fbfcfc",
    "surfaceSolid": "#fbfcfc",
    "groove": "rgba(225, 231, 229, 0.5)",
    "inputBg": "rgba(255, 255, 255, 0.78)",
    "line": "rgba(46, 58, 62, 0.085)",
    "lineStrong": "rgba(46, 58, 62, 0.11)",
    "hover": "rgba(46, 58, 62, 0.045)"
  },
  "dark": {
    "ink": "#eef2f1",
    "inkMuted": "#b0babd",
    "inkSoft": "#8d979a",
    "inkFaint": "#8d979a",
    "blue": "#4c8dff",
    "blueHover": "#3d7ff2",
    "lime": "#82dd2d",
    "leafText": "#9be35a",
    "red": "#ff7a71",
    "redText": "#ff8a82",
    "redSwatch": "#ff5a50",
    "amber": "#e0a244",
    "violet": "#a993f0",
    "teal": "#58c3d2",
    "canvas": "#121517",
    "stage": "#090b0c",
    "surface": "#1b1f21",
    "surfaceSolid": "#1b1f21",
    "groove": "rgba(0, 0, 0, 0.22)",
    "inputBg": "rgba(255, 255, 255, 0.04)",
    "line": "rgba(255, 255, 255, 0.07)",
    "lineStrong": "rgba(255, 255, 255, 0.1)",
    "hover": "rgba(255, 255, 255, 0.05)"
  }
};

export const radius = {
  "xs": 8,
  "sm": 12,
  "md": 16,
  "lg": 20,
  "xl": 24
};

export const control = {
  "height": 34,
  "heightSm": 29,
  "heightLg": 40,
  "rowHeight": 52,
  "cellPx": 16,
  "tableHeadHeight": 40
};

export const typography = {
  "caption": 12.5,
  "label": 13,
  "body": 14,
  "control": 13,
  "table": 13,
  "tableHeader": 12.5
};

export const spacing = {
  "sm": 8,
  "md": 12,
  "lg": 16,
  "xl": 20
};

export const font = {
  "sans": "\"SF Pro Display\", \"SF Pro Text\", -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", \"Microsoft YaHei\", system-ui, sans-serif",
  "mono": "ui-monospace, \"SF Mono\", \"JetBrains Mono\", Menlo, Consolas, monospace"
};

export function resolvePalette(mode = 'light') {
  return palette[mode === 'dark' ? 'dark' : 'light'];
}

export default { palette, radius, control, typography, spacing, font, resolvePalette };
