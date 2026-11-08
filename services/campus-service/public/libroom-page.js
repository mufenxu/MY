"use strict";

// 研讨间 · 单次预约页签。挂载点由 reservation-hub.js 提供（#resvLibroomBook）。
(function initLibroomPage() {
  const api = window.HguCampusApi;
  const mount = document.querySelector("#resvLibroomBook");
  if (typeof api !== "function" || !mount) return;

  if (!document.querySelector("link[data-libroom-page]")) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./libroom-page.css?v=20261107-libroom-v2";
    stylesheet.dataset.libroomPage = "1";
    document.head.append(stylesheet);
  }

  mount.innerHTML = `
    <div class="libroom-layout">
      <form id="libroomForm" class="resv-panel libroom-form">
        <p class="libroom-hint libroom-wide">进入研讨间需要使用校园身份码，可在 <a href="#campus">一卡通</a> 页面查看。</p>
        <label class="libroom-wide"><span>预约空间</span><select id="libroomSpace" required><option value="">正在加载空间...</option></select><small id="libroomSpaceSchedule" class="libroom-space-schedule">选择空间和日期后查询空闲时段。</small></label>
        <label><span>预约日期</span><input id="libroomDate" type="date" required></label>
        <div class="libroom-time"><label><span>开始时间</span><input id="libroomStart" type="time" min="08:00" max="21:45" step="900" value="09:00" required></label><label><span>结束时间</span><input id="libroomEnd" type="time" min="08:00" max="21:45" step="900" value="11:00" required></label></div>
        <label class="libroom-wide"><span>申请主题</span><input id="libroomTitle" maxlength="80" placeholder="例如：个人课程研读" required></label>
        <label class="libroom-wide"><span>申请内容</span><textarea id="libroomContent" maxlength="500" rows="4" placeholder="简要说明使用研讨间的用途" required></textarea></label>
        <label><span>联系电话</span><input id="libroomMobile" inputmode="numeric" maxlength="11" pattern="\\d{11}" placeholder="11 位手机号" required></label>
        <label class="libroom-switch"><input id="libroomOpen" type="checkbox"><span>公开本次申请</span></label>
        <div class="libroom-actions libroom-wide"><button id="libroomFreeButton" class="ghost" type="button">查该时段空闲房间</button><button id="libroomQueryButton" class="ghost" type="button">查询规则和空闲时段</button><button type="submit">核对预约信息</button></div>
      </form>
      <div class="libroom-side">
        <section class="resv-panel"><h3>该时段可用房间</h3><div id="libroomFreeSpaces" class="libroom-output">先选择日期和时段，再点击“查该时段空闲房间”。</div></section>
        <section class="resv-panel"><h3>预约规则</h3><div id="libroomRules" class="libroom-output">选择空间后查询。</div></section>
        <section class="resv-panel"><h3>空闲时段</h3><div id="libroomAvailability" class="libroom-output">尚未查询。</div></section>
        <section id="libroomConfirmPanel" class="resv-panel libroom-confirm" hidden><h3>提交前确认</h3><dl id="libroomSummary"></dl><button id="libroomSubmitButton" type="button">确认并提交预约</button></section>
        <p id="libroomStatus" class="resv-status" role="status" aria-live="polite"></p>
      </div>
    </div>`;

  const nodes = {
    form: mount.querySelector("#libroomForm"), space: mount.querySelector("#libroomSpace"), date: mount.querySelector("#libroomDate"),
    start: mount.querySelector("#libroomStart"), end: mount.querySelector("#libroomEnd"), title: mount.querySelector("#libroomTitle"),
    content: mount.querySelector("#libroomContent"), mobile: mount.querySelector("#libroomMobile"), open: mount.querySelector("#libroomOpen"),
    query: mount.querySelector("#libroomQueryButton"), free: mount.querySelector("#libroomFreeButton"), rules: mount.querySelector("#libroomRules"),
    spaceSchedule: mount.querySelector("#libroomSpaceSchedule"), freeSpaces: mount.querySelector("#libroomFreeSpaces"),
    availability: mount.querySelector("#libroomAvailability"), confirm: mount.querySelector("#libroomConfirmPanel"), summary: mount.querySelector("#libroomSummary"),
    submit: mount.querySelector("#libroomSubmitButton"), status: mount.querySelector("#libroomStatus")
  };

  let loaded = false;
  let loadingSpaces = false;
  let pendingReservation = null;
  let spaces = [];
  let queriedAvailabilityKey = "";
  let queriedFreeWindows = [];
  let freeSlotSpaces = [];
  // 按时段反查已经由后端逐个房间确认过可用性，命中的房间在同一个时段可以直接提交，
  // 不必再点一次「查询规则和空闲时段」。
  let freeSlotProof = { key: "", ids: new Set() };
  const timeFieldKeys = {
    start: ["startTime", "start_time", "start", "beginTime", "begin_time", "begin", "openTime", "open_time", "startMinute", "start_minute"],
    end: ["endTime", "end_time", "end", "closeTime", "close_time", "finishTime", "finish_time", "endMinute", "end_minute"]
  };

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

  function parseTime(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value >= 0 && value <= 1440 ? value : null;
    const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value || "").trim());
    if (!match) return null;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes >= 0 && minutes <= 1440 ? minutes : null;
  }

  function timeText(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function firstTimeValue(value, keys) {
    if (!value || typeof value !== "object") return null;
    for (const key of keys) {
      if (value[key] !== undefined) {
        const minutes = parseTime(value[key]);
        if (minutes !== null) return minutes;
      }
    }
    return null;
  }

  function extractTimeWindows(value, found = []) {
    if (!value || typeof value !== "object") return found;
    if (Array.isArray(value)) {
      value.forEach((item) => extractTimeWindows(item, found));
      return found;
    }
    const start = firstTimeValue(value, timeFieldKeys.start);
    const end = firstTimeValue(value, timeFieldKeys.end);
    if (start !== null && end !== null && end > start) found.push({ start: timeText(start), end: timeText(end) });
    Object.values(value).forEach((item) => extractTimeWindows(item, found));
    return found;
  }

  function scheduleWindows(value) {
    const seen = new Set();
    return extractTimeWindows(value).filter((item) => {
      const key = `${item.start}-${item.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function windowText(windows) {
    return windows.length ? windows.map((item) => `${item.start} - ${item.end}`).join("、") : "暂无可预约空闲时段";
  }

  function renderWindowChips(windows) {
    if (!windows.length) return '<p class="resv-muted">暂无可预约空闲时段。</p>';
    return `<div class="libroom-time-windows">${windows.map((item) => `<span>${escapeHtml(`${item.start} - ${item.end}`)}</span>`).join("")}</div>`;
  }

  function updateSelectedSpaceSchedule() {
    nodes.spaceSchedule.textContent = "选择空间和日期后查询该空间当天空闲时段。";
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
    return Array.isArray(payload) ? payload : [];
  }

  function spaceOption(space) {
    const id = Number(space.id ?? space.area_id ?? space.areaId);
    const name = space.name ?? space.area_name ?? space.areaName ?? space.title ?? space.room_name ?? `空间 ${id}`;
    return { id, name: String(name) };
  }

  async function loadSpaces() {
    if (loadingSpaces) return;
    loadingSpaces = true;
    nodes.space.innerHTML = '<option value="">正在加载空间...</option>';
    status("正在连接学校预约系统...");
    try {
      const payload = await api("/api/campus/libroom/spaces");
      spaces = spaceCandidates(payload).map(spaceOption).filter((item) => item.id > 0);
      if (!spaces.length) throw new Error("学校预约系统没有返回可识别的空间列表。");
      nodes.space.innerHTML = '<option value="">请选择空间</option>' + spaces.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
      updateSelectedSpaceSchedule();
      loaded = true;
      status(`已加载 ${spaces.length} 个可预约空间。`, "ok");
    } catch (error) {
      loaded = false;
      spaces = [];
      nodes.space.innerHTML = '<option value="">空间加载失败</option>';
      updateSelectedSpaceSchedule();
      status(error.message || "空间加载失败。", "error");
    } finally {
      loadingSpaces = false;
    }
  }

  function slotReady() {
    const start = parseTime(nodes.start.value);
    const end = parseTime(nodes.end.value);
    if (!nodes.date.value || start === null || end === null || end <= start) {
      status("请先选择日期和有效时段。", "error");
      return null;
    }
    return { date: nodes.date.value, startTime: nodes.start.value, endTime: nodes.end.value };
  }

  function renderFreeSpaces(list) {
    if (!list.length) {
      nodes.freeSpaces.innerHTML = '<div class="resv-empty">该时段没有查询到空闲研讨间，换个时段再试。</div>';
      return;
    }
    const selectedId = Number(nodes.space.value);
    nodes.freeSpaces.innerHTML = `<p class="resv-muted">共 ${list.length} 间在该时段空闲，点击即可选用。</p><div class="libroom-free-list">${list.map((space) => `
      <button type="button" class="libroom-free-item${space.id === selectedId ? " is-active" : ""}" data-libroom-space="${space.id}">
        <span class="libroom-free-name">${escapeHtml(space.name)}</span><span class="resv-badge is-ok">该时段空闲</span>
      </button>`).join("")}</div>`;
    nodes.freeSpaces.querySelectorAll("[data-libroom-space]").forEach((button) => {
      button.addEventListener("click", () => selectSpace(Number(button.dataset.libroomSpace), true));
    });
  }

  async function queryFreeSpaces() {
    const slot = slotReady();
    if (!slot) return;
    nodes.free.disabled = true;
    nodes.freeSpaces.textContent = "正在逐个房间确认该时段占用情况，可能需要十几秒...";
    status("正在查询该时段可用房间...");
    try {
      const query = `date=${encodeURIComponent(slot.date)}&startTime=${encodeURIComponent(slot.startTime)}&endTime=${encodeURIComponent(slot.endTime)}`;
      const payload = await api(`/api/campus/libroom/spaces?${query}`);
      freeSlotSpaces = spaceCandidates(payload).map(spaceOption).filter((item) => item.id > 0);
      freeSlotProof = {
        key: `${slot.date}|${slot.startTime}|${slot.endTime}`,
        ids: new Set(freeSlotSpaces.map((item) => item.id))
      };
      renderFreeSpaces(freeSlotSpaces);
      status(freeSlotSpaces.length ? `该时段有 ${freeSlotSpaces.length} 间空闲。` : "该时段没有空闲房间。", freeSlotSpaces.length ? "ok" : "");
    } catch (error) {
      nodes.freeSpaces.textContent = "查询失败。";
      status(error.message || "查询该时段可用房间失败。", "error");
    } finally {
      nodes.free.disabled = false;
    }
  }

  function selectSpace(spaceId, fromSlot) {
    if (!Number.isInteger(spaceId) || spaceId <= 0) return;
    if (!spaces.some((item) => item.id === spaceId)) {
      const found = freeSlotSpaces.find((item) => item.id === spaceId);
      if (!found) return;
      spaces.push(found);
      nodes.space.insertAdjacentHTML("beforeend", `<option value="${found.id}">${escapeHtml(found.name)}</option>`);
    }
    nodes.space.value = String(spaceId);
    updateSelectedSpaceSchedule();
    clearQueriedAvailability();
    validateSelectedTime();
    hideConfirmation();
    if (fromSlot) {
      nodes.freeSpaces.querySelectorAll("[data-libroom-space]").forEach((button) => {
        button.classList.toggle("is-active", Number(button.dataset.libroomSpace) === spaceId);
      });
      status("已选用该房间，该时段已确认空闲，可直接核对提交。", "ok");
    }
  }

  function renderAvailability(value) {
    const freeWindows = Array.isArray(value?.freeWindows) ? scheduleWindows(value.freeWindows) : scheduleWindows(value);
    const busyWindows = Array.isArray(value?.busyWindows) ? scheduleWindows(value.busyWindows) : [];
    queriedAvailabilityKey = `${nodes.space.value}|${nodes.date.value}`;
    queriedFreeWindows = freeWindows;
    nodes.availability.innerHTML = `<div class="libroom-availability-block"><strong>可预约空闲时段</strong>${renderWindowChips(freeWindows)}${busyWindows.length ? `<strong>已占用时段</strong>${renderWindowChips(busyWindows)}` : ""}<pre>${escapeHtml(value?.detail || "空闲时段已按学校接口返回结果更新。")}</pre></div>`;
  }

  function clearQueriedAvailability() {
    queriedAvailabilityKey = "";
    queriedFreeWindows = [];
    nodes.availability.textContent = "空间或日期已变化，请重新查询空闲时段。";
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
      renderAvailability(availability?.availability ?? availability);
      status("规则和空闲时段已更新。", "ok");
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

  function validateSelectedTime() {
    const start = parseTime(nodes.start.value);
    const end = parseTime(nodes.end.value);
    const windows = queriedAvailabilityKey === `${nodes.space.value}|${nodes.date.value}` ? queriedFreeWindows : [];
    const inWindow = start !== null && end !== null && windows.some((item) => {
      const windowStart = parseTime(item.start);
      const windowEnd = parseTime(item.end);
      return windowStart !== null && windowEnd !== null && start >= windowStart && end <= windowEnd;
    });
    const slotKey = `${nodes.date.value}|${nodes.start.value}|${nodes.end.value}`;
    const provenBySlot = freeSlotProof.key === slotKey && freeSlotProof.ids.has(Number(nodes.space.value));
    const validDuration = start !== null && end !== null && end - start >= 60 && end - start <= 240;
    const message = (inWindow || provenBySlot) && validDuration ? "" : windows.length ? `请选择 ${windowText(windows)} 内 1 至 4 小时的预约时段。` : "请先查询该空间的空闲时段，或点击“查该时段空闲房间”。";
    nodes.start.setCustomValidity(message);
    nodes.end.setCustomValidity(message);
    return !message;
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

  function resetSlotResults() {
    freeSlotSpaces = [];
    freeSlotProof = { key: "", ids: new Set() };
    nodes.freeSpaces.textContent = "日期或时段已变化，请重新查询该时段空闲房间。";
  }

  nodes.date.min = localDate(0);
  nodes.date.max = localDate(3);
  nodes.date.value = localDate(1);
  nodes.form.addEventListener("input", hideConfirmation);
  nodes.space.addEventListener("change", () => { updateSelectedSpaceSchedule(); clearQueriedAvailability(); validateSelectedTime(); });
  nodes.date.addEventListener("change", () => { clearQueriedAvailability(); resetSlotResults(); validateSelectedTime(); });
  nodes.start.addEventListener("input", () => { resetSlotResults(); validateSelectedTime(); });
  nodes.end.addEventListener("input", () => { resetSlotResults(); validateSelectedTime(); });
  nodes.free.addEventListener("click", queryFreeSpaces);
  nodes.query.addEventListener("click", querySpace);
  nodes.form.addEventListener("submit", (event) => {
    event.preventDefault();
    validateSelectedTime();
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

  function onActivate(event) {
    if (event.detail?.view !== "libroom" || event.detail?.tab !== "book") return;
    if (!loaded) loadSpaces();
  }
  document.addEventListener("resv:activate", onActivate);
  document.addEventListener("resv:refresh", (event) => {
    if (event.detail?.view !== "libroom" || event.detail?.tab !== "book") return;
    loadSpaces();
  });
  if (window.HguReservation?.isRoute()) loadSpaces();
})();
