"use strict";

// 学校 CAS 在密码校验后会强制短信二次验证，验证码只能由用户输入。
// 这里封装「手机号 + 短信验证码」登录通道，与 app.js 的主流程解耦。
(function initSmsLogin() {
  // 本脚本先于 app.js 执行，因此请求函数要延迟到调用时再取。
  function request(path, options) {
    const api = window.HguCampusApi;
    if (typeof api !== "function") throw new Error("页面尚未初始化完成，请刷新后重试。");
    return api(path, options);
  }

  const nodes = {
    toggle: document.querySelector("#smsLoginToggle"),
    form: document.querySelector("#smsLoginForm"),
    phone: document.querySelector("#smsPhoneInput"),
    code: document.querySelector("#smsCodeInput"),
    send: document.querySelector("#smsSendButton"),
    submit: document.querySelector("#smsLoginButton"),
    hint: document.querySelector("#smsLoginHint"),
    remember: document.querySelector("#rememberInput")
  };
  if (!nodes.form) return;

  const state = { pendingId: "", cooldownTimer: 0, onSuccess: null };

  function setHint(text, tone = "") {
    if (!nodes.hint) return;
    nodes.hint.textContent = text || "";
    nodes.hint.hidden = !text;
    nodes.hint.dataset.tone = tone;
  }

  function setVisible(visible) {
    nodes.form.hidden = !visible;
    if (nodes.toggle) nodes.toggle.hidden = visible;
    if (visible) nodes.phone?.focus();
  }

  function startCooldown(seconds) {
    window.clearInterval(state.cooldownTimer);
    let remaining = seconds;
    nodes.send.disabled = true;
    nodes.send.textContent = `${remaining} 秒后重发`;
    state.cooldownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(state.cooldownTimer);
        nodes.send.disabled = false;
        nodes.send.textContent = "获取验证码";
        return;
      }
      nodes.send.textContent = `${remaining} 秒后重发`;
    }, 1000);
  }

  async function sendCode() {
    const phone = nodes.phone.value.replace(/\D+/g, "");
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setHint("请输入与学校账号绑定的 11 位手机号。", "error");
      return;
    }
    nodes.send.disabled = true;
    nodes.send.textContent = "发送中";
    setHint("正在请求学校下发短信验证码...", "");
    try {
      const data = await request("/api/auth/login/sms/send", { method: "POST", body: { phone } });
      state.pendingId = data.pendingId;
      nodes.code?.focus();
      const minutes = Math.max(1, Math.round(data.expiresInSeconds / 60));
      setHint(`验证码已发送至 ${data.phone}，${minutes} 分钟内有效。`, "ok");
      startCooldown(60);
    } catch (error) {
      nodes.send.disabled = false;
      nodes.send.textContent = "获取验证码";
      setHint(error.message, "error");
    }
  }

  async function verify() {
    const code = nodes.code.value.replace(/\D+/g, "");
    if (!state.pendingId) {
      setHint("请先点击「获取验证码」。", "error");
      return;
    }
    if (!code) {
      setHint("请输入手机收到的短信验证码。", "error");
      return;
    }
    nodes.submit.disabled = true;
    nodes.submit.textContent = "验证中";
    setHint("正在用短信验证码换取学校登录票据，并同步学业、校园账户和能耗数据...", "");
    try {
      await request("/api/auth/login/sms/verify", {
        method: "POST",
        body: {
          pendingId: state.pendingId,
          code,
          rememberMe: nodes.remember ? nodes.remember.checked : true
        }
      });
      state.pendingId = "";
      nodes.code.value = "";
      setHint("", "");
      setVisible(false);
      await state.onSuccess?.();
    } catch (error) {
      setHint(error.message, "error");
    } finally {
      nodes.submit.disabled = false;
      nodes.submit.textContent = "验证并登录";
    }
  }

  nodes.toggle?.addEventListener("click", () => setVisible(true));
  nodes.send?.addEventListener("click", () => sendCode());
  nodes.form.addEventListener("submit", (event) => {
    event.preventDefault();
    verify();
  });

  window.HguSmsLogin = {
    mount({ onSuccess } = {}) {
      state.onSuccess = onSuccess || null;
    },
    reveal(hint) {
      setVisible(true);
      setHint(hint || "学校已启用短信二次验证。请输入绑定的手机号，获取验证码后完成连接。", "");
    }
  };
})();
