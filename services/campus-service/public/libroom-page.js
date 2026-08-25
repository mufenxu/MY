"use strict";

(function initLibroomPage() {
  const api = window.HguCampusApi;
  if (typeof api !== "function") return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "./libroom-page.css?v=20260825-auto-v1";
  document.head.append(stylesheet);

  const nav = document.querySelector(".quick-nav");
  const campusLink = nav?.querySelector('a[href="#campus"]');
  const navLink = document.createElement("a");
  navLink.href = "#reservation";
  navLink.innerHTML = '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v17H5zM8 2v4M16 2v4M8 10h8M8 14h5"/></svg><span>预约</span>';
  nav?.insertBefore(navLink, campusLink || null);

  const section = document.createElement("section");
  section.id = "reservation";
  section.className = "app-section libroom-section";
  section.innerHTML = `
    <div class="section-head">
      <div><p class="eyebrow">图书馆空间</p><h2>单人研讨间预约</h2><p>选择空间和时段后，通过学校统一身份认证快速提交预约。</p></div>
      <button id="libroomReloadButton" class="ghost" type="button">刷新空间</button>
    </div>
    <div class="libroom-layout">
      <form id="libroomForm" class="libroom-panel libroom-form">
        <label class="libroom-wide"><span>预约空间</span><select id="libroomSpace" required><option value="">正在加载空间...</option></select></label>
        <label><span>预约日期</span><input id="libroomDate" type="date" required></label>
        <div class="libroom-time"><label><span>开始时间</span><input id="libroomStart" type="time" step="1800" value="09:00" required></label><label><span>结束时间</span><input id="libroomEnd" type="time" step="1800" value="11:00" required></label></div>
        <label class="libroom-wide"><span>申请主题</span><input id="libroomTitle" maxlength="80" placeholder="例如：个人课程研读" required></label>
        <label class="libroom-wide"><span>申请内容</span><textarea id="libroomContent" maxlength="500" rows="4" placeholder="简要说明使用研讨间的用途" required></textarea></label>
        <label><span>联系电话</span><input id="libroomMobile" inputmode="numeric" maxlength="11" pattern="\\d{11}" placeholder="11 位手机号" required></label>
        <label class="libroom-switch"><input id="libroomOpen" type="checkbox"><span>公开本次申请</span></label>
        <div class="libroom-actions libroom-wide"><button id="libroomQueryButton" class="ghost" type="button">查询规则和时段</button><button type="submit">核对预约信息</button></div>
      </form>
      <div class="libroom-side">
        <section class="libroom-panel"><h3>预约规则</h3><div id="libroomRules" class="libroom-output">选择空间后查询。</div></section>
        <section class="libroom-panel"><h3>空间与时段</h3><div id="libroomAvailability" class="libroom-output">尚未查询。</div></section>
        <section id="libroomConfirmPanel" class="libroom-panel libroom-confirm" hidden><h3>提交前确认</h3><dl id="libroomSummary"></dl><button id="libroomSubmitButton" type="button">确认并提交预约</button></section>
        <p id="libroomStatus" class="libroom-status" role="status" aria-live="polite"></p>
      </div>
    </div>`;
  document.querySelector(".main-content")?.append(section);
  const autoScript = document.createElement("script");
  autoScript.src = "./libroom-auto-page.js?v=20260825-auto-v1";
  autoScript.defer = true;
  document.head.append(autoScript);

  const nodes = {
    form: section.querySelector("#libroomForm"), space: section.querySelector("#libroomSpace"), date: section.querySelector("#libroomDate"),
    start: section.querySelector("#libroomStart"), end: section.querySelector("#libroomEnd"), title: section.querySelector("#libroomTitle"),
    content: section.querySelector("#libroomContent"), mobile: section.querySelector("#libroomMobile"), open: section.querySelector("#libroomOpen"),
    query: section.querySelector("#libroomQueryButton"), reload: section.querySelector("#libroomReloadButton"), rules: section.querySelector("#libroomRules"),
    availability: section.querySelector("#libroomAvailability"), confirm: section.querySelector("#libroomConfirmPanel"), summary: section.querySelector("#libroomSummary"),
    submit: section.querySelector("#libroomSubmitButton"), status: section.querySelector("#libroomStatus")
  };
  let loaded = false;
  let pendingReservation = null;

  function localDate(offset = 0) {
    const date = new Date(Date.now() + offset * 86400000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }

  function status(message, tone = "") {
    nodes.status.textContent = message;
    nodes.status.dataset.tone = tone;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function hideConfirmation() {
    pendingReservation = null;
    nodes.confirm.hidden = true;
  }

  function objectText(value) {
    if (value === null || value === undefined || value === "") return "暂无数据";
    if (typeof value !== "object") return String(value);
    if (Array.isArray(value)) return value.length ? value.map((item) => objectText(item)).join("\n") : "暂无数据";
    return Object.entries(value).map(([key, item]) => `${key}：${typeof item === "object" ? objectText(item) : item}`).join("\n");
  }

  function spaceCandidates(payload) {
    const queue = [payload];
    const arrays = [];
    const seen = new Set();
    while (queue.length) {
      const value = queue.shift();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (Array.isArray(value)) {
        if (value.some((item) => item && typeof item === "object" && Number(item.id ?? item.area_id ?? item.areaId) > 0)) arrays.push(value);
        value.forEach((item) => queue.push(item));
      } else Object.values(value).forEach((item) => queue.push(item));
    }
    return arrays.sort((a, b) => b.length - a.length)[0] || [];
  }

  function spaceOption(space) {
    const id = Number(space.id ?? space.area_id ?? space.areaId);
    const name = space.name ?? space.area_name ?? space.areaName ?? space.title ?? space.room_name ?? `空间 ${id}`;
    return { id, name: String(name) };
  }

  async function loadSpaces() {
    nodes.reload.disabled = true;
    nodes.space.innerHTML = '<option value="">正在加载空间...</option>';
    status("正在连接学校预约系统...");
    try {
      const payload = await api("/api/campus/libroom/spaces");
      const spaces = spaceCandidates(payload).map(spaceOption).filter((item) => item.id > 0);
      if (!spaces.length) throw new Error("学校预约系统没有返回可识别的空间列表。");
      nodes.space.innerHTML = '<option value="">请选择空间</option>' + spaces.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
      loaded = true;
      status(`已加载 ${spaces.length} 个可预约空间。`, "ok");
    } catch (error) {
      loaded = false;
      nodes.space.innerHTML = '<option value="">空间加载失败</option>';
      status(error.message || "空间加载失败。", "error");
    } finally {
      nodes.reload.disabled = false;
    }
  }

  async function querySpace() {
    const spaceId = nodes.space.value;
    const date = nodes.date.value;
    if (!spaceId || !date) {
      status("请先选择空间和日期。", "error");
      return;
    }
    nodes.query.disabled = true;
    nodes.rules.textContent = "查询中...";
    nodes.availability.textContent = "查询中...";
    status("正在查询学校预约规则和空间时段...");
    try {
      const query = `spaceId=${encodeURIComponent(spaceId)}&date=${encodeURIComponent(date)}`;
      const [rules, availability] = await Promise.all([
        api(`/api/campus/libroom/rules?spaceId=${encodeURIComponent(spaceId)}`),
        api(`/api/campus/libroom/availability?${query}`)
      ]);
      nodes.rules.textContent = objectText(rules);
      nodes.availability.textContent = objectText(availability?.availability ?? availability);
      status("规则和空间信息已更新。", "ok");
    } catch (error) {
      nodes.rules.textContent = "查询失败";
      nodes.availability.textContent = "查询失败";
      status(error.message || "查询失败。", "error");
    } finally {
      nodes.query.disabled = false;
    }
  }

  function reservationFromForm() {
    return {
      areaId: Number(nodes.space.value), date: nodes.date.value, startTime: nodes.start.value, endTime: nodes.end.value,
      title: nodes.title.value.trim(), content: nodes.content.value.trim(), mobile: nodes.mobile.value.trim(), open: nodes.open.checked
    };
  }

  function renderSummary(reservation) {
    const spaceName = nodes.space.selectedOptions[0]?.textContent || `空间 ${reservation.areaId}`;
    const rows = [
      ["空间", spaceName], ["日期", reservation.date], ["时段", `${reservation.startTime} - ${reservation.endTime}`],
      ["主题", reservation.title], ["联系电话", reservation.mobile], ["申请公开", reservation.open ? "是" : "否"]
    ];
    nodes.summary.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    nodes.confirm.hidden = false;
  }

  nodes.date.min = localDate(0);
  nodes.date.max = localDate(3);
  nodes.date.value = localDate(1);
  nodes.form.addEventListener("input", hideConfirmation);
  nodes.reload.addEventListener("click", loadSpaces);
  nodes.query.addEventListener("click", querySpace);
  nodes.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!nodes.form.reportValidity()) return;
    pendingReservation = reservationFromForm();
    renderSummary(pendingReservation);
    status("请核对预约信息，确认后将立即提交至学校系统。", "warning");
  });
  nodes.submit.addEventListener("click", async () => {
    if (!pendingReservation) return;
    nodes.submit.disabled = true;
    status("正在提交预约，请勿重复操作...");
    try {
      await api("/api/campus/libroom/reservations", { method: "POST", body: pendingReservation });
      status("预约已提交成功，请以学校预约系统记录为准。", "ok");
      hideConfirmation();
    } catch (error) {
      status(error.message || "预约提交失败。", "error");
    } finally {
      nodes.submit.disabled = false;
    }
  });

  function loadOnRoute() {
    if (window.location.hash === "#reservation" && !loaded) loadSpaces();
  }
  window.addEventListener("hashchange", loadOnRoute);
  loadOnRoute();
})();
