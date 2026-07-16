(function applySavedTheme(global) {
  try {
    const theme = global.localStorage.getItem('theme');
    const prefersDark = global.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = theme === 'dark' || (!theme && prefersDark);
    global.document.documentElement.classList.toggle('dark', dark);
    global.document.documentElement.style.backgroundColor = dark ? '#1e1e2d' : '#F5F7FB';
  } catch {
    global.document.documentElement.style.backgroundColor = '#F5F7FB';
  }
})(window);
