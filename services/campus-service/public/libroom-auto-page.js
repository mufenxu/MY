"use strict";

(function initLibroomAutoPage() {
  const api = window.HguCampusApi;
  const section = document.querySelector("#reservation");
  if (typeof api !== "function" || !section) return;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400000));
  const bookableStart = "08:00";
  const bookableEnd = "21:45";
  let spaces = [];
  let tasks = [];
  let editing = "";

  section.insertAdjacentHTML("beforeend", `<section class="libroom-panel libroom-auto-panel"><div class="libroom-auto-head"><div><h3>自动预约任务</h3><p class="libroom-auto-hint">设置预约目标日期和任务运行时间，系统会按候选空间和时段顺序自动尝试一次。</p></div><button id="autoCreate" type="button">新建任务</button></div><div id="autoTasks" class="libroom-auto-tasks"><p class="libroom-output">正在加载自动预约任务...</p></div><form id="autoForm" class="libroom-auto-form" hidden><div class="libroom-auto-form-head"><h4 id="autoFormTitle">新建自动预约任务</h4><button id="autoCancel" class="ghost" type="button">取消</button></div><div class="libroom-auto-grid"><label><span>任务名称</span><input id="autoName" maxlength="80" required></label><label class="libroom-switch"><input id="autoEnabled" type="checkbox" checked><span>启用任务</span></label><label><span>预约目标日期 <small id="autoDateWeekday" class="libroom-auto-weekday"></small></span><input id="autoDate" type="date" required></label><label><span>任务运行日期 <small id="autoExecuteDateWeekday" class="libroom-auto-weekday"></small></span><input id="autoExecuteDate" type="date" required></label><label><span>运行时间</span><input id="autoTime" type="time" step="60" value="08:30" required></label></div><p class="libroom-auto-form-note">到达任务运行日期和运行时间后，系统会预约目标日期的候选空间；候选预约时段限定在 ${bookableStart} - ${bookableEnd}。</p><div class="libroom-auto-candidates-head"><h4>候选空间和时段（按顺序尝试）</h4><button id="autoAdd" class="ghost" type="button">添加候选</button></div><div id="autoCandidates" class="libroom-auto-candidates"></div><div class="libroom-auto-grid"><label><span>申请主题</span><input id="autoTitle" maxlength="80" required></label><label><span>联系电话</span><input id="autoMobile" inputmode="numeric" maxlength="11" pattern="\\d{11}" required></label><label class="libroom-wide"><span>申请内容</span><textarea id="autoContent" maxlength="500" rows="3" required></textarea></label><label class="libroom-switch"><input id="autoOpen" type="checkbox"><span>公开本次申请</span></label></div><div class="libroom-actions"><button id="autoSave" type="submit">保存任务</button></div><p id="autoStatus" class="libroom-status" role="status" aria-live="polite"></p></form></section>`);

  const n = Object.fromEntries(["tasks", "create", "form", "formTitle", "cancel", "name", "enabled", "date", "dateWeekday", "executeDate", "executeDateWeekday", "time", "candidates", "add", "title", "content", "mobile", "open", "save", "status"].map((key) => [key, section.querySelector(`#auto${key[0].toUpperCase()}${key.slice(1)}`)]));
  const status = (message, tone = "") => { n.status.textContent = message; n.status.dataset.tone = tone; };
  const optionHtml = (selected) => spaces.map((space) => `<option value="${space.id}"${Number(space.id) === Number(selected) ? " selected" : ""}>${esc(space.name)}</option>`).join("");
  const weekday = (value) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date(`${value}T12:00:00+08:00`)) : "";
  const ymd = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  };
  const addDate = (value, offset) => {
    const parsed = ymd(value);
    return parsed ? new Date(parsed.getTime() + offset * 86400000).toISOString().slice(0, 10) : date();
  };
  const defaultExecuteDate = (targetDate) => {
    const earliest = addDate(targetDate, -3);
    return earliest > date() ? earliest : date();
  };
  const updateDateWeekday = () => { n.dateWeekday.textContent = n.date.value ? `（${weekday(n.date.value)}）` : ""; };
  const updateExecuteDateWeekday = () => { n.executeDateWeekday.textContent = n.executeDate.value ? `（${weekday(n.executeDate.value)}）` : ""; };
  const syncExecuteDateBounds = () => {
    n.executeDate.min = defaultExecuteDate(n.date.value);
    n.executeDate.max = n.date.value || "";
    updateDateWeekday();
    updateExecuteDateWeekday();
  };
  const timeMinutes = (value) => {
    const match = /^(\d{2}):([0-5]\d)$/.exec(String(value || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };

  function candidateRow(value = {}) {
    const row = document.createElement("div");
    row.className = "libroom-auto-candidate";
    row.innerHTML = `<span class="libroom-auto-order"></span><select class="auto-space" required>${optionHtml(value.areaId)}</select><input class="auto-start" type="time" min="${bookableStart}" max="${bookableEnd}" step="900" value="${esc(value.startTime || "09:00")}" required><input class="auto-end" type="time" min="${bookableStart}" max="${bookableEnd}" step="900" value="${esc(value.endTime || "11:00")}" required><button class="ghost auto-up" type="button">上移</button><button class="ghost auto-down" type="button">下移</button><button class="ghost auto-remove" type="button">删除</button>`;
    row.querySelector(".auto-up").onclick = () => { if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling); order(); };
    row.querySelector(".auto-down").onclick = () => { if (row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row); order(); };
    row.querySelector(".auto-remove").onclick = () => { if (n.candidates.children.length === 1) return status("至少保留一个候选空间和时段。", "error"); row.remove(); order(); };
    n.candidates.append(row); order();
  }
  function order() { [...n.candidates.children].forEach((row, index) => { row.querySelector(".libroom-auto-order").textContent = `${index + 1}.`; }); }
  function fill(task = null) {
    n.name.value = task?.name || ""; n.enabled.checked = task ? Boolean(task.enabled) : true; n.date.value = task?.reservationDate || task?.startDate || date(); n.executeDate.value = task?.executeDate || task?.execute_date || task?.runDate || task?.run_date || defaultExecuteDate(n.date.value); n.time.value = task?.executeTime || "08:30"; n.title.value = task?.title || ""; n.content.value = task?.content || ""; n.mobile.value = task?.mobile || ""; n.open.checked = Boolean(task?.open);
    n.candidates.replaceChildren(); (task?.candidates?.length ? task.candidates : [{ areaId: spaces[0]?.id, startTime: "09:00", endTime: "11:00" }]).forEach(candidateRow); syncExecuteDateBounds();
  }
  function validateCandidates() {
    for (const row of n.candidates.children) {
      const startInput = row.querySelector(".auto-start");
      const endInput = row.querySelector(".auto-end");
      const start = timeMinutes(startInput.value);
      const end = timeMinutes(endInput.value);
      const message = start >= timeMinutes(bookableStart) && end <= timeMinutes(bookableEnd) && end - start >= 60 && end - start <= 240
        ? ""
        : `候选时段需在 ${bookableStart} - ${bookableEnd} 内，且预约 1 至 4 小时。`;
      startInput.setCustomValidity(message);
      endInput.setCustomValidity(message);
      if (message) return false;
    }
    return true;
  }
  function value() { return { name: n.name.value.trim(), enabled: n.enabled.checked, reservationDate: n.date.value, executeDate: n.executeDate.value, executeTime: n.time.value, candidates: [...n.candidates.children].map((row) => ({ areaId: Number(row.querySelector(".auto-space").value), startTime: row.querySelector(".auto-start").value, endTime: row.querySelector(".auto-end").value })), title: n.title.value.trim(), content: n.content.value.trim(), mobile: n.mobile.value.trim(), open: n.open.checked }; }
  function resultText(task) { return !task.lastStatus ? "尚未执行" : task.lastStatus === "succeeded" ? `最近执行成功（第 ${(task.lastCandidateIndex ?? 0) + 1} 个候选）` : `最近执行失败：${task.lastMessage || "未返回具体原因"}`; }
  function render() {
    if (!tasks.length) { n.tasks.innerHTML = '<p class="libroom-output">还没有自动预约任务，点击“新建任务”开始设置。</p>'; return; }
    n.tasks.innerHTML = tasks.map((task) => { const reservationDate = task.reservationDate || task.startDate || ""; const executeDate = task.executeDate || task.execute_date || task.runDate || task.run_date || ""; const executeText = executeDate ? `${executeDate}（${weekday(executeDate)}） ${task.executeTime}` : `进入 3 天窗口后 ${task.executeTime}`; const badge = task.enabled ? "待执行" : task.lastStatus === "succeeded" ? "已完成" : task.lastStatus ? "已结束" : "已停用"; return `<article class="libroom-auto-task" data-id="${esc(task.id)}"><div><div class="libroom-auto-task-title"><strong>${esc(task.name)}</strong><span class="libroom-auto-badge${task.enabled ? " is-enabled" : ""}">${badge}</span></div><p>目标日期：${esc(reservationDate || "未设置")}${reservationDate ? `（${esc(weekday(reservationDate))}）` : ""} · 运行：${esc(executeText)} · 候选 ${Array.isArray(task.candidates) ? task.candidates.length : 0} 个</p><p class="libroom-auto-result">最近执行结果：${esc(resultText(task))}</p></div><div class="libroom-auto-task-actions"><button class="ghost" data-action="edit">编辑</button><button class="ghost" data-action="toggle">${task.enabled ? "停用" : "启用"}</button><button class="ghost" data-action="delete">删除</button></div></article>`; }).join("");
    n.tasks.querySelectorAll("[data-action]").forEach((button) => { button.onclick = async () => { const task = tasks.find((item) => item.id === button.closest("[data-id]").dataset.id); if (!task) return; if (button.dataset.action === "edit") { editing = task.id; n.formTitle.textContent = "编辑自动预约任务"; fill(task); n.form.hidden = false; return; } if (button.dataset.action === "delete") { if (!window.confirm(`确定删除“${task.name}”吗？`)) return; await api(`/api/campus/libroom/auto-reservations/${encodeURIComponent(task.id)}`, { method: "DELETE" }); } else await api(`/api/campus/libroom/auto-reservations/${encodeURIComponent(task.id)}`, { method: "PUT", body: { ...task, enabled: !task.enabled } }); load(); }; });
  }
  async function load() { try { tasks = await api("/api/campus/libroom/auto-reservations"); render(); } catch (error) { n.tasks.innerHTML = `<p class="libroom-status" data-tone="error">${esc(error.message || "自动预约任务加载失败。")}</p>`; } }
  async function loadSpaces() { try { const payload = await api("/api/campus/libroom/spaces"); const queue = [payload]; const found = []; while (queue.length) { const item = queue.shift(); if (Array.isArray(item)) { if (item.some((space) => Number(space?.id ?? space?.area_id) > 0)) found.push(...item); item.forEach((child) => queue.push(child)); } else if (item && typeof item === "object") Object.values(item).forEach((child) => queue.push(child)); } spaces = found.map((space) => ({ id: Number(space.id ?? space.area_id ?? space.areaId), name: `${String(space.name ?? space.area_name ?? space.areaName ?? `空间 ${space.id}`)}（${bookableStart} - ${bookableEnd}）` })).filter((space) => space.id > 0); } catch { spaces = []; } }
  n.date.min = date(); n.executeDate.min = date(); n.date.addEventListener("input", () => { if (!editing) n.executeDate.value = defaultExecuteDate(n.date.value); syncExecuteDateBounds(); }); n.executeDate.addEventListener("input", updateExecuteDateWeekday); n.candidates.addEventListener("input", validateCandidates); n.add.onclick = () => candidateRow(); n.cancel.onclick = () => { n.form.hidden = true; status(""); }; n.create.onclick = () => { editing = ""; n.formTitle.textContent = "新建自动预约任务"; fill(); n.form.hidden = false; n.form.scrollIntoView({ behavior: "smooth", block: "start" }); }; n.form.onsubmit = async (event) => { event.preventDefault(); validateCandidates(); if (!n.form.reportValidity()) return; n.save.disabled = true; status("正在保存自动预约任务..."); try { const path = editing ? `/api/campus/libroom/auto-reservations/${encodeURIComponent(editing)}` : "/api/campus/libroom/auto-reservations"; await api(path, { method: editing ? "PUT" : "POST", body: value() }); n.form.hidden = true; status("自动预约任务已保存。", "ok"); await load(); } catch (error) { status(error.message || "自动预约任务保存失败。", "error"); } finally { n.save.disabled = false; } };
  function route() { if (window.location.hash === "#reservation") { loadSpaces().then(load); } }
  window.addEventListener("hashchange", route); route();
})();
