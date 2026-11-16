// 由 packages/pearl-tokens/generate.mjs 从 tokens.css 自动生成，请修改源文件后运行 npm run generate。
(function () {
const palette = {"light":{"stage":"#dfe3e2","canvas":"#f4f6f5","ink":"#101418"},"dark":{"stage":"#090b0c","canvas":"#121517","ink":"#eef2f1"}};

const STORAGE_KEY = 'my-platform-theme';
const CHANGE_EVENT = 'my-platform-theme-change';
const isPreference = (value) => ['light', 'dark', 'system'].includes(value);

function readPreference(key) {
  try {
    const value = window.localStorage.getItem(key);
    return isPreference(value) ? value : '';
  } catch {
    return '';
  }
}

function getThemePreference() {
  if (typeof window === 'undefined') return 'light';
  return document.documentElement.dataset.themePreference || readPreference(STORAGE_KEY) || 'light';
}

function resolveTheme(preference = getThemePreference()) {
  return preference === 'dark' || (preference === 'system' && typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function getCurrentTheme() {
  return typeof document === 'undefined' ? 'light' : document.documentElement.dataset.theme || 'light';
}

function applyTheme(preference = getThemePreference()) {
  if (typeof window === 'undefined') return 'light';
  const root = document.documentElement;
  const theme = resolveTheme(preference);
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  root.style.color = palette[theme].ink;
  root.style.backgroundColor = palette[theme][root.dataset.themeBackground === 'canvas' ? 'canvas' : 'stage'];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette[theme].stage);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return theme;
}

function setTheme(preference) {
  const next = isPreference(preference) ? preference : 'light';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存储受限时通过根元素记住本页选择，系统变化仍可跟随。
    }
  }
  return applyTheme(next);
}

function subscribeTheme(listener) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

function initTheme() {
  if (typeof window === 'undefined') return 'light';
  if (window.__myPlatformThemeInitialized) return getCurrentTheme();
  window.__myPlatformThemeInitialized = true;
  // 仅首次接入时迁移所在应用的旧选择，此后统一偏好优先。
  const legacyKey = document.documentElement.dataset.themeLegacyKey;
  const preference = readPreference(STORAGE_KEY) || (legacyKey && readPreference(legacyKey)) || 'light';
  const theme = setTheme(preference);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      applyTheme(isPreference(event.newValue) ? event.newValue : 'light');
    }
  });
  return theme;
}

window.myPlatformTheme = { getThemePreference, getCurrentTheme, setTheme, subscribeTheme, initTheme };
initTheme();
})();
