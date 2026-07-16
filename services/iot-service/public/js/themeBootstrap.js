(function applySavedTheme(global) {
  'use strict';

  const savedTheme = global.localStorage.getItem('mqttapi_theme') || 'light';
  if (savedTheme === 'light') {
    global.document.documentElement.setAttribute('data-theme', 'light');
  } else {
    global.document.documentElement.removeAttribute('data-theme');
  }
})(window);
