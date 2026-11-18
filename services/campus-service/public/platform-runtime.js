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

  // 与 packages/platform-browser-runtime 的 logoutPlatformSession 保持同一语义：
  // 服务端没有确认撤销会话就抛错，调用方不能把用户带离页面并让其误以为已退出。
  async function logout() {
    const response = await global.fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Platform-Request": "console" }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "统一平台退出失败，请稍后重试。");
    }
    global.location.replace("/");
  }

  function redirectToLogin() {
    const returnTo = `${global.location.pathname}${global.location.search}${global.location.hash}`;
    global.location.replace(`/console?returnTo=${encodeURIComponent(returnTo)}`);
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
