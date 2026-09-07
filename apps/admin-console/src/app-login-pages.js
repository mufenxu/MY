function escapeHtmlAttribute(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderAppLoginTransitionHtml(redirectUrl) {
  const safeUrl = escapeHtmlAttribute(redirectUrl || '/');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="refresh" content="1;url=${safeUrl}">
  <title>正在进入管理后台...</title>
  <style>
    :root {
      color-scheme: light dark;
      --page-background: #f6f8fd;
      --page-pattern: linear-gradient(rgba(37, 99, 235, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(37, 99, 235, 0.035) 1px, transparent 1px);
      --ambient-glow: radial-gradient(circle, rgba(37, 99, 235, 0.16) 0%, rgba(6, 182, 212, 0.09) 42%, transparent 72%);
      --ambient-size: min(520px, 96vw);
      --card-background: rgba(255, 255, 255, 0.92);
      --card-border: rgba(37, 99, 235, 0.14);
      --card-shadow: 0 24px 64px -32px rgba(15, 23, 42, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.88) inset;
      --title-color: #0f172a;
      --subtitle-color: #64748b;
      --ring-primary: #2563eb;
      --ring-secondary: #06b6d4;
      --ring-accent: #10b981;
      --core-start: #2563eb;
      --core-end: #0891b2;
      --core-shadow: 0 10px 28px rgba(37, 99, 235, 0.28);
      --progress-track: #e2e8f0;
      --status-color: #2563eb;
      --link-color: #64748b;
      --link-hover: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --page-background: #0b0f19;
        --page-pattern: none;
        --ambient-glow: radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(99, 102, 241, 0.14) 45%, transparent 70%);
        --ambient-size: 340px;
        --card-background: rgba(17, 24, 39, 0.88);
        --card-border: rgba(255, 255, 255, 0.1);
        --card-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
        --title-color: #ffffff;
        --subtitle-color: #94a3b8;
        --ring-primary: #38bdf8;
        --ring-secondary: #6366f1;
        --ring-accent: #34d399;
        --core-start: #1e3a8a;
        --core-end: #0369a1;
        --core-shadow: 0 0 24px rgba(56, 189, 248, 0.4);
        --progress-track: rgba(255, 255, 255, 0.08);
        --status-color: #38bdf8;
        --link-color: #64748b;
        --link-hover: #94a3b8;
      }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--page-background);
      background-image: var(--page-pattern);
      background-size: 24px 24px;
      color: var(--title-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow: hidden;
    }
    .ambient-glow {
      position: absolute;
      width: var(--ambient-size);
      height: var(--ambient-size);
      border-radius: 50%;
      background: var(--ambient-glow);
      pointer-events: none;
      animation: pulseGlow 3s ease-in-out infinite alternate;
    }
    @keyframes pulseGlow {
      0% { transform: scale(0.85); opacity: 0.6; }
      100% { transform: scale(1.15); opacity: 1; }
    }
    .card {
      position: relative;
      background: var(--card-background);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 38px 28px 30px;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: var(--card-shadow);
    }
    .anim-container {
      position: relative;
      width: 88px;
      height: 88px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 22px;
    }
    .ring-outer {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 3px solid transparent;
      border-top-color: var(--ring-primary);
      border-right-color: var(--ring-secondary);
      animation: spin 1.2s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
    }
    .ring-inner {
      position: absolute;
      inset: 8px;
      border-radius: 50%;
      border: 2px solid transparent;
      border-bottom-color: var(--ring-accent);
      animation: spin 1.8s linear infinite reverse;
    }
    .core-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--core-start), var(--core-end));
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--core-shadow);
      animation: iconFloat 2s ease-in-out infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes iconFloat {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-2px) scale(1.04); }
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.3px;
      color: var(--title-color);
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      color: var(--subtitle-color);
      margin-bottom: 22px;
      line-height: 1.5;
    }
    .progress-bar-wrapper {
      width: 100%;
      height: 4px;
      background: var(--progress-track);
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 14px;
      position: relative;
    }
    .progress-bar {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 40%;
      background: linear-gradient(90deg, var(--ring-primary), var(--ring-secondary));
      border-radius: 99px;
      animation: progressMove 1.4s ease-in-out infinite;
    }
    @keyframes progressMove {
      0% { left: -40%; width: 30%; }
      50% { width: 60%; }
      100% { left: 100%; width: 30%; }
    }
    .status-text {
      font-size: 12px;
      color: var(--status-color);
      font-weight: 500;
      letter-spacing: 0.2px;
    }
    .direct-link {
      margin-top: 18px;
      font-size: 12px;
      color: var(--link-color);
      text-decoration: none;
    }
    .direct-link:hover { color: var(--link-hover); text-decoration: underline; }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>
  <div class="card">
    <div class="anim-container">
      <div class="ring-outer"></div>
      <div class="ring-inner"></div>
      <div class="core-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      </div>
    </div>
    <div class="title">身份凭据验证成功</div>
    <div class="subtitle">已建立安全管理会话<br>正在前往管理后台...</div>
    <div class="progress-bar-wrapper">
      <div class="progress-bar"></div>
    </div>
    <div class="status-text" id="statusDesc">正在连接管理控制台...</div>
    <a class="direct-link" href="${safeUrl}" id="jumpLink">若未自动跳转，请点击此处</a>
  </div>
  <script>
    (function() {
      var target = ${JSON.stringify(redirectUrl)};
      setTimeout(function() {
        var status = document.getElementById('statusDesc');
        if (status) status.textContent = '正在进入系统...';
      }, 350);
      setTimeout(function() {
        window.location.replace(target);
      }, 300);
    })();
  </script>
</body>
</html>`;
}

export function renderAppLoginErrorHtml(title, message) {
  const safeTitle = escapeHtmlAttribute(title || '出错了');
  const safeMessage = escapeHtmlAttribute(message || '操作无法完成');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${safeTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(17, 24, 39, 0.88);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 24px;
      padding: 36px 28px 30px;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }
    .icon-box {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
    }
    .title { font-size: 18px; font-weight: 700; color: #ef4444; margin-bottom: 8px; }
    .message { font-size: 13.5px; color: #94a3b8; line-height: 1.5; margin-bottom: 20px; }
    .hint { font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-box">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <div class="title">${safeTitle}</div>
    <div class="message">${safeMessage}</div>
    <div class="hint">请返回安卓 App 重新发起跳转</div>
  </div>
</body>
</html>`;
}
