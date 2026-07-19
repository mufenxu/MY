(function () {
  "use strict";
  var legacySessionKey = "hgu_app_session_token";
  var persistentSessionKey = "hgu_wechat_app_session_v1";
  var embeddedWechat = /MicroMessenger/i.test(window.navigator && window.navigator.userAgent || "");

  function readStorage(storage, key) {
    try {
      return storage && storage.getItem(key) || "";
    } catch (_error) {
      return "";
    }
  }

  function removeStorage(storage, key) {
    try {
      if (storage) storage.removeItem(key);
    } catch (_error) {
      // Ignore storage restrictions in embedded browsers.
    }
  }

  function writeStorage(storage, key, value) {
    try {
      if (storage) storage.setItem(key, value);
    } catch (_error) {
      // The other storage or HttpOnly cookie may still be available.
    }
  }

  function persistentToken() {
    var raw = readStorage(window.localStorage, persistentSessionKey);
    if (!raw) return "";
    try {
      var record = JSON.parse(raw);
      if (!record.token) return "";
      if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
        removeStorage(window.localStorage, persistentSessionKey);
        return "";
      }
      return record.token;
    } catch (_error) {
      removeStorage(window.localStorage, persistentSessionKey);
      return "";
    }
  }

  function readSessionToken() {
    if (!embeddedWechat) return "";
    var tabToken = readStorage(window.sessionStorage, legacySessionKey);
    var token = tabToken || persistentToken();
    if (tabToken && !persistentToken()) {
      writeStorage(window.localStorage, persistentSessionKey, JSON.stringify({ token: tabToken }));
    }
    removeStorage(window.localStorage, legacySessionKey);
    return token;
  }

  function storeSessionToken(token, expiresAt) {
    removeStorage(window.localStorage, legacySessionKey);
    if (!embeddedWechat || !token) {
      removeStorage(window.localStorage, persistentSessionKey);
      removeStorage(window.sessionStorage, legacySessionKey);
      return;
    }
    writeStorage(window.localStorage, persistentSessionKey, JSON.stringify({ token: token, expiresAt: expiresAt || null }));
    writeStorage(window.sessionStorage, legacySessionKey, token);
  }

  window.__HGU_EMBEDDED_SESSION__ = {
    isEmbeddedWechat: function () {
      return embeddedWechat;
    },
    read: readSessionToken,
    store: storeSessionToken
  };

  window.setTimeout(function () {
    if (window.__HGU_APP_READY__) return;
    var status = document.getElementById("appAuthStatusText");
    if (status) {
      status.textContent = "当前浏览器将使用兼容登录方式，请稍候。";
    }
  }, 2500);
}());
