"use strict";

(function attachPlatformRuntime(global) {
  const appBase = /^\/apps\/campus(?:\/|$)/.test(global.location.pathname)
    ? "/apps/campus"
    : "";

  function appUrl(path) {
    const normalized = String(path || "/");
    if (!appBase || !normalized.startsWith("/")) return normalized;
    if (normalized === appBase || normalized.startsWith(`${appBase}/`)) return normalized;
    return `${appBase}${normalized}`;
  }

  async function logout() {
    await global.fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Platform-Request": "console" }
    }).catch(() => {});
    global.location.replace("/");
  }

  function redirectToLogin() {
    const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
    global.location.replace(`/?returnTo=${encodeURIComponent(returnTo)}`);
  }

  function handleSessionError(status, code) {
    if (!appBase || status !== 401 || code !== "PLATFORM_SESSION_REQUIRED") return false;
    redirectToLogin();
    return true;
  }

  function isAppAccessError(error) {
    return error?.status === 401
      && /系统访问会话|请先登录系统账号|系统账号不存在或已停用/.test(error.message || "");
  }

  global.HguPlatformRuntime = {
    appBase,
    appUrl,
    logout,
    redirectToLogin,
    handleSessionError,
    isAppAccessError
  };
})(window);
