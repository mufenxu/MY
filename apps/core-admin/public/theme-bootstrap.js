(function applySavedTheme(global) {
  try {
    const theme = global.localStorage.getItem('theme');
    const prefersDark = global.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = theme === 'dark' || (!theme && prefersDark);
    const root = global.document.documentElement;
    // data-theme 驱动珍珠令牌，dark 类保留给 antd 与历史选择器
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('dark', dark);
    root.style.backgroundColor = dark ? '#090b0c' : '#dfe3e2';
  } catch {
    global.document.documentElement.style.backgroundColor = '#dfe3e2';
  }
})(window);
