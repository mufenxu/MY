"use strict";

// 学校 CAS 已全面启用短信二次验证：页面只保留「手机号 + 验证码」这一条登录通道，
// 不再收集学号与密码。这里封装该通道，与 app.js 的主流程解耦。
(function initSmsLogin() {
  // 本脚本先于 app.js 执行，因此请求函数要延迟到调用时再取。
  function request(path, options) {
    const api = window.HguCampusApi;
    if (typeof api !== "function") throw new Error("页面尚未初始化完成，请刷新后重试。");
    return api(path, options);
  }

  const nodes = {
    block: document.querySelector("#schoolLoginBlock"),
    form: document.querySelector("#smsLoginForm"),
    phone: document.querySelector("#smsPhoneInput"),
    code: document.querySelector("#smsCodeInput"),
    send: document.querySelector("#smsSendButton"),
    submit: document.querySelector("#smsLoginButton"),
    hint: document.querySelector("#smsLoginHint"),
    remember: document.querySelector("#rememberInput")
  };
  if (!nodes.form) return;

  const state = {
    pendingId: "",
    pendingPhone: "",
    cooldownUntil: 0,
    cooldownTimer: 0,
    sending: false,
    verifying: false,
    onSuccess: null
  };

  function digitsOnly(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function maskPhone(phone) {
    const value = digitsOnly(phone);
    return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(7)}` : value;
  }

  function setHint(text, tone = "") {
    if (!nodes.hint) return;
    nodes.hint.textContent = text || "";
    nodes.hint.hidden = !text;
    nodes.hint.dataset.tone = tone;
  }

  function setBusy(kind, busy, label) {
    if (kind === "send") {
      state.sending = busy;
      nodes.send.disabled = busy || state.cooldownUntil > Date.now();
      nodes.send.classList.toggle("is-busy", busy);
      if (!busy) renderCooldown();
      else nodes.send.textContent = label || "发送中";
      return;
    }
    state.verifying = busy;
    nodes.submit.disabled = busy;
    nodes.submit.classList.toggle("is-busy", busy);
    nodes.submit.setAttribute("aria-busy", busy ? "true" : "false");
    const text = nodes.submit.querySelector("span");
    if (text) text.textContent = busy ? (label || "验证中") : "验证并登录";
  }

  function setVisible(visible) {
    if (nodes.block) nodes.block.hidden = !visible;
    if (visible) {
      window.requestAnimationFrame(() => {
        if (document.activeElement === document.body) nodes.phone?.focus();
      });
    }
  }

  function remainingSeconds() {
    return Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
  }

  function renderCooldown() {
    if (!nodes.send || state.sending) return;
    const remaining = remainingSeconds();
    nodes.send.disabled = remaining > 0;
    nodes.send.classList.toggle("is-counting", remaining > 0);
    nodes.send.textContent = remaining > 0 ? `${remaining} 秒后重发` : "获取验证码";
  }

  function startCooldown(seconds) {
    window.clearInterval(state.cooldownTimer);
    state.cooldownUntil = Date.now() + Math.max(1, seconds) * 1000;
    renderCooldown();
    state.cooldownTimer = window.setInterval(() => {
      renderCooldown();
      if (remainingSeconds() <= 0) {
        window.clearInterval(state.cooldownTimer);
        state.cooldownTimer = 0;
      }
    }, 1000);
  }

  function resetPending(message) {
    state.pendingId = "";
    state.pendingPhone = "";
    if (message) setHint(message, "warning");
  }

  async function sendCode() {
    if (state.sending || remainingSeconds() > 0) return;
    const phone = digitsOnly(nodes.phone.value);
    nodes.phone.value = phone;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setHint("请输入与学校账号绑定的 11 位手机号。", "error");
      nodes.phone.focus();
      return;
    }
    setBusy("send", true);
    setHint("正在请求学校下发短信验证码…", "");
    try {
      const data = await request("/api/auth/login/sms/send", { method: "POST", body: { phone } });
      state.pendingId = data.pendingId;
      state.pendingPhone = phone;
      const minutes = Math.max(1, Math.round((data.expiresInSeconds || 300) / 60));
      setHint(`验证码已发送至 ${maskPhone(data.phone || phone)}，${minutes} 分钟内有效。`, "ok");
      startCooldown(data.retryAfterSeconds || 60);
      nodes.code?.focus();
    } catch (error) {
      setHint(error.message || "验证码发送失败，请稍后重试。", "error");
      nodes.send.disabled = false;
    } finally {
      setBusy("send", false);
    }
  }

  async function verify() {
    if (state.verifying) return;
    const code = digitsOnly(nodes.code.value);
    nodes.code.value = code;
    if (!state.pendingId) {
      setHint("请先点击「获取验证码」，再输入手机收到的验证码。", "error");
      if (!digitsOnly(nodes.phone.value)) nodes.phone.focus();
      else nodes.send?.focus();
      return;
    }
    if (code.length < 4) {
      setHint("请输入手机收到的短信验证码。", "error");
      nodes.code.focus();
      return;
    }
    setBusy("submit", true);
    setHint("正在用短信验证码换取学校登录票据，并同步学业、校园账户和能耗数据…", "");
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
      state.pendingPhone = "";
      window.clearInterval(state.cooldownTimer);
      state.cooldownTimer = 0;
      state.cooldownUntil = 0;
      nodes.code.value = "";
      setHint("", "");
      setVisible(false);
      await state.onSuccess?.();
    } catch (error) {
      setHint(error.message || "验证失败，请确认验证码后重试。", "error");
      // 验证码过期或待验证会话丢失时，引导用户重新获取，避免反复提交同一串数字。
      if (/过期|失效|超时|重新获取|expired/i.test(error.message || "")) resetPending(error.message);
    } finally {
      setBusy("submit", false);
    }
  }

  nodes.phone?.addEventListener("input", () => {
    const phone = digitsOnly(nodes.phone.value).slice(0, 11);
    if (nodes.phone.value !== phone) nodes.phone.value = phone;
    if (state.pendingPhone && phone !== state.pendingPhone) {
      resetPending("手机号已修改，请重新获取验证码。");
    }
  });

  nodes.code?.addEventListener("input", () => {
    const code = digitsOnly(nodes.code.value).slice(0, 8);
    if (nodes.code.value !== code) nodes.code.value = code;
  });

  nodes.phone?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (state.pendingId) nodes.code?.focus();
    else sendCode();
  });

  nodes.code?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!state.pendingId) sendCode();
    else verify();
  });

  nodes.send?.addEventListener("click", () => sendCode());
  nodes.form.addEventListener("submit", (event) => {
    event.preventDefault();
    verify();
  });

  // 切回标签页时按真实时间校正倒计时，避免后台节流导致读秒停住。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderCooldown();
  });

  window.HguSmsLogin = {
    mount({ onSuccess } = {}) {
      state.onSuccess = onSuccess || null;
    },
    reveal(hint) {
      setVisible(true);
      setHint(hint || "学校已启用短信验证。请输入绑定的手机号，获取验证码后完成连接。", "");
    }
  };
})();
