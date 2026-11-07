"use strict";

// 研讨间 · 已约空间页签。挂载点 #resvLibroomRecords。
(function initLibroomRecordsPage() {
  const api = window.HguCampusApi;
  const mount = document.querySelector("#resvLibroomRecords");
  if (typeof api !== "function" || !mount) return;

  mount.innerHTML = `
    <section class="resv-panel">
      <div class="resv-panel-head">
        <div><h3>已约空间</h3><p>学校系统中当前仍有效的研讨间预约，可取消、结束使用或改期。进楼需要校园身份码，可在 <a href="#campus">一卡通</a> 页面查看。</p></div>
        <div class="resv-actions"><button id="libroomRecordsReload" class="ghost" type="button">刷新列表</button></div>
      </div>
      <p id="libroomRecordsStatus" class="resv-status" role="status" aria-live="polite"></p>
      <div id="libroomRecordsList" class="resv-list"><div class="resv-empty">打开本页签后自动加载。</div></div>
    </section>
    <section id="libroomReschedulePanel" class="resv-panel" hidden>
      <div class="resv-panel-head">
        <div><h3>改期</h3><p id="libroomRescheduleTarget"></p></div>
        <button id="libroomRescheduleClose" class="ghost" type="button">收起</button>
      </div>
      <p class="resv-notice is-warning">改期的做法是「先取消原预约、再立即提交新预约」。如果新预约被学校系统拒绝，原预约已经失效，需要重新预约，请确认后再提交。</p>
      <form id="libroomRescheduleForm" class="resv-fields">
        <label class="resv-field"><span>预约日期</span><input id="libroomRescheduleDate" type="date" required></label>
        <label class="resv-field"><span>开始时间</span><input id="libroomRescheduleStart" type="time" min="08:00" max="21:45" step="900" required></label>
        <label class="resv-field"><span>结束时间</span><input id="libroomRescheduleEnd" type="time" min="08:00" max="21:45" step="900" required></label>
        <label class="resv-field"><span>预约空间</span><select id="libroomRescheduleSpace" required><option value="">请先查询该时段空闲房间</option></select></label>
        <label class="resv-field is-wide"><span>申请主题</span><input id="libroomRescheduleTitle" maxlength="80" required></label>
        <label class="resv-field is-wide"><span>申请内容 <small>改期相当于重新提交申请，需要重新填写</small></span><textarea id="libroomRescheduleContent" maxlength="500" rows="3" required></textarea></label>
        <label class="resv-field"><span>联系电话</span><input id="libroomRescheduleMobile" inputmode="numeric" maxlength="11" required></label>
        <div class="resv-actions is-wide"><button id="libroomRescheduleQuery" class="ghost" type="button">查该时段空闲房间</button><button id="libroomRescheduleSubmit" type="submit">确认改期</button></div>
      </form>
      <div id="libroomRescheduleFree" class="resv-muted"></div>
      <p id="libroomRescheduleStatus" class="resv-status" role="status" aria-live="polite"></p>
    </section>`;

  const nodes = {
    reload: mount.querySelector("#libroomRecordsReload"), list: mount.querySelector("#libroomRecordsList"),
    status: mount.querySelector("#libroomRecordsStatus"), panel: mount.querySelector("#libroomReschedulePanel"),
    target: mount.querySelector("#libroomRescheduleTarget"), close: mount.querySelector("#libroomRescheduleClose"),
    form: mount.querySelector("#libroomRescheduleForm"), date: mount.querySelector("#libroomRescheduleDate"),
    start: mount.querySelector("#libroomRescheduleStart"), end: mount.querySelector("#libroomRescheduleEnd"),
    space: mount.querySelector("#libroomRescheduleSpace"), title: mount.querySelector("#libroomRescheduleTitle"),
    content: mount.querySelector("#libroomRescheduleContent"), mobile: mount.querySelector("#libroomRescheduleMobile"),
    query: mount.querySelector("#libroomRescheduleQuery"), submit: mount.querySelector("#libroomRescheduleSubmit"),
    free: mount.querySelector("#libroomRescheduleFree"), formStatus: mount.querySelector("#libroomRescheduleStatus")
  };

  let records = [];
  let spaces = [];
  let editing = null;
  let loaded = false;
  let loading = false;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function localDate(offset = 0) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(Date.now() + offset * 86400000));
  }

  function weekday(value) {
    if (!value) return "";
    const parsed = new Date(`${value}T12:00:00+08:00`);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(parsed);
  }

  function status(message, tone = "") {
    nodes.status.textContent = message;
    nodes.status.dataset.tone = tone;
  }

  function formStatus(message, tone = "") {
    nodes.formStatus.textContent = message;
    nodes.formStatus.dataset.tone = tone;
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

  function mergeSpaces(list) {
    list.forEach((item) => {
      if (!spaces.some((space) => space.id === item.id)) spaces.push(item);
    });
  }

  function render() {
    if (!records.length) {
      nodes.list.innerHTML = '<div class="resv-empty">当前没有进行中的研讨间预约。</div>';
      return;
    }
    nodes.list.innerHTML = records.map((record) => {
      const badge = record.canEndUse
        ? '<span class="resv-badge is-info">使用中</span>'
        : '<span class="resv-badge is-ok">待使用</span>';
      const actions = [
        record.canReschedule ? `<button class="ghost" type="button" data-record-action="reschedule" data-record-id="${esc(record.id)}">改期</button>` : "",
        record.canEndUse ? `<button class="ghost" type="button" data-record-action="end" data-record-id="${esc(record.id)}">结束使用</button>` : "",
        record.canCancel ? `<button class="ghost" type="button" data-record-action="cancel" data-record-id="${esc(record.id)}">取消预约</button>` : ""
      ].filter(Boolean).join("");
      const meta = [
        record.date ? `${esc(record.date)}（${esc(weekday(record.date))}）` : "日期未知",
        `${esc(record.startTime || "--:--")} - ${esc(record.endTime || "--:--")}`
      ].join(" · ");
      return `<article class="resv-item" data-record="${esc(record.id)}">
        <div class="resv-item-head"><span class="resv-item-title">${esc(record.spaceName || "研讨间")}</span><span class="resv-badge">${esc(record.statusText || "预约成功")}</span>${badge}</div>
        <p class="resv-item-meta">${meta}</p>
        <p class="resv-item-meta">主题：${esc(record.title || "未填写")}</p>
        ${actions ? `<div class="resv-item-actions">${actions}</div>` : '<p class="resv-muted">该预约当前不可取消或改期。</p>'}
      </article>`;
    }).join("");

    nodes.list.querySelectorAll("[data-record-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.recordAction, button.dataset.recordId, button));
    });
  }

  async function load(force = false) {
    if (loading) return;
    if (!force && loaded) return;
    loading = true;
    nodes.reload.disabled = true;
    if (!records.length) nodes.list.innerHTML = '<div class="resv-empty">正在加载已约空间...</div>';
    status("正在读取学校预约系统...");
    try {
      const payload = await api("/api/campus/libroom/reservations");
      records = Array.isArray(payload) ? payload : [];
      loaded = true;
      render();
      status(records.length ? `共 ${records.length} 条进行中的预约。` : "当前没有进行中的预约。", records.length ? "ok" : "");
    } catch (error) {
      records = [];
      nodes.list.innerHTML = `<div class="resv-empty">${esc(error.message || "已约空间加载失败。")}</div>`;
      status(error.message || "已约空间加载失败。", "error");
    } finally {
      loading = false;
      nodes.reload.disabled = false;
    }
  }

  async function handleAction(action, id, button) {
    const record = records.find((item) => String(item.id) === String(id));
    if (!record) return;
    if (action === "edit" || action === "reschedule") {
      openReschedule(record);
      return;
    }
    const label = action === "cancel" ? "取消" : "结束";
    const message = action === "cancel"
      ? `确定取消「${record.spaceName}」${record.date} ${record.startTime} - ${record.endTime} 的预约吗？取消后名额不会保留。`
      : `确定结束「${record.spaceName}」的本次使用吗？结束后需要重新预约才能继续使用。`;
    if (!window.confirm(message)) return;
    button.disabled = true;
    status(`正在${label}预约...`);
    try {
      await api(`/api/campus/libroom/reservations/${encodeURIComponent(record.id)}/${action === "cancel" ? "cancel" : "end"}`, { method: "POST" });
      status(action === "cancel" ? "预约已取消。" : "已结束使用。", "ok");
      await load(true);
    } catch (error) {
      status(error.message || `${label}失败。`, "error");
      button.disabled = false;
    }
  }

  async function ensureSpaces() {
    if (spaces.length) return;
    try {
      const payload = await api("/api/campus/libroom/spaces");
      mergeSpaces(spaceCandidates(payload).map(spaceOption).filter((item) => item.id > 0));
    } catch {
      /* 空间列表失败不影响手填改期，查询时段时会再补 */
    }
  }

  function renderSpaceOptions(selectedId) {
    nodes.space.innerHTML = '<option value="">请选择空间</option>'
      + spaces.map((item) => `<option value="${item.id}"${Number(item.id) === Number(selectedId) ? " selected" : ""}>${esc(item.name)}</option>`).join("");
  }

  async function openReschedule(record) {
    editing = record;
    nodes.panel.hidden = false;
    nodes.target.textContent = `${record.spaceName} · ${record.date}（${weekday(record.date)}） ${record.startTime} - ${record.endTime}`;
    nodes.date.min = localDate(0);
    nodes.date.max = localDate(3);
    nodes.date.value = record.date && record.date >= localDate(0) ? record.date : localDate(1);
    nodes.start.value = record.startTime || "09:00";
    nodes.end.value = record.endTime || "11:00";
    nodes.title.value = record.title || "";
    nodes.content.value = "";
    nodes.mobile.value = "";
    nodes.free.textContent = "改动时段后点击“查该时段空闲房间”。";
    formStatus("");
    await ensureSpaces();
    renderSpaceOptions(record.spaceId > 0 ? record.spaceId : "");
    nodes.panel.scrollIntoView({ behavior: "smooth", block: "start" });
    nodes.title.focus({ preventScroll: true });
  }

  function closeReschedule() {
    editing = null;
    nodes.panel.hidden = true;
    formStatus("");
  }

  async function queryFreeSpaces() {
    if (!editing) return;
    if (!nodes.date.value || !nodes.start.value || !nodes.end.value) {
      formStatus("请先选择日期和时段。", "error");
      return;
    }
    nodes.query.disabled = true;
    nodes.free.textContent = "正在逐个房间确认占用情况，可能需要十几秒...";
    formStatus("正在查询该时段可用房间...");
    try {
      const query = `date=${encodeURIComponent(nodes.date.value)}&startTime=${encodeURIComponent(nodes.start.value)}`
        + `&endTime=${encodeURIComponent(nodes.end.value)}&excludeReservationId=${encodeURIComponent(editing.id)}`;
      const payload = await api(`/api/campus/libroom/spaces?${query}`);
      const list = spaceCandidates(payload).map(spaceOption).filter((item) => item.id > 0);
      mergeSpaces(list);
      renderSpaceOptions(list.length ? list[0].id : "");
      if (!list.length) {
        nodes.free.innerHTML = '<p class="resv-muted">该时段没有空闲研讨间，请换个时间。</p>';
        formStatus("该时段没有空闲房间，原预约未做改动。", "warning");
        return;
      }
      nodes.free.innerHTML = `<p class="resv-muted">共 ${list.length} 间可用，已默认选中第一间，可切换：</p>`
        + `<div class="libroom-free-list">${list.map((item) => `<button type="button" class="libroom-free-item" data-reschedule-space="${item.id}"><span class="libroom-free-name">${esc(item.name)}</span><span class="resv-badge is-ok">空闲</span></button>`).join("")}</div>`;
      nodes.free.querySelectorAll("[data-reschedule-space]").forEach((button) => {
        button.addEventListener("click", () => {
          nodes.space.value = button.dataset.rescheduleSpace;
          nodes.free.querySelectorAll("[data-reschedule-space]").forEach((item) => item.classList.toggle("is-active", item === button));
        });
      });
      nodes.free.querySelector("[data-reschedule-space]")?.classList.add("is-active");
      formStatus(`该时段有 ${list.length} 间可用。`, "ok");
    } catch (error) {
      nodes.free.textContent = "查询失败。";
      formStatus(error.message || "查询该时段可用房间失败。", "error");
    } finally {
      nodes.query.disabled = false;
    }
  }

  nodes.reload.addEventListener("click", () => load(true));
  nodes.close.addEventListener("click", closeReschedule);
  nodes.query.addEventListener("click", queryFreeSpaces);
  nodes.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editing) return;
    const start = nodes.start.value;
    const end = nodes.end.value;
    const toMinutes = (value) => {
      const match = /^(\d{1,2}):([0-5]\d)$/.exec(value || "");
      return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
    };
    const span = toMinutes(end) - toMinutes(start);
    if (!Number.isFinite(span) || span < 60 || span > 240) {
      formStatus("预约时长需为 1 至 4 小时。", "error");
      return;
    }
    if (!nodes.space.value) {
      formStatus("请先查询并选择目标空间。", "error");
      return;
    }
    if (!/^\d{11}$/.test(nodes.mobile.value.trim())) {
      formStatus("联系电话需为 11 位手机号。", "error");
      return;
    }
    if (!window.confirm("改期会先取消原预约再重新提交，确认继续吗？")) return;
    nodes.submit.disabled = true;
    formStatus("正在改期...");
    try {
      await api(`/api/campus/libroom/reservations/${encodeURIComponent(editing.id)}/reschedule`, {
        method: "POST",
        body: {
          areaId: Number(nodes.space.value), date: nodes.date.value, startTime: start, endTime: end,
          title: nodes.title.value.trim(), content: nodes.content.value.trim(), mobile: nodes.mobile.value.trim(), open: true
        }
      });
      formStatus("改期成功。", "ok");
      closeReschedule();
      status("改期成功，请以学校预约系统记录为准。", "ok");
      await load(true);
    } catch (error) {
      formStatus(error.message || "改期失败。", "error");
      if (error.code === "LIBROOM_RESCHEDULE_PARTIAL") await load(true);
    } finally {
      nodes.submit.disabled = false;
    }
  });

  document.addEventListener("resv:activate", (event) => {
    if (event.detail?.view !== "libroom" || event.detail?.tab !== "records") return;
    load();
  });
  document.addEventListener("resv:refresh", (event) => {
    if (event.detail?.view !== "libroom" || event.detail?.tab !== "records") return;
    load(true);
  });
})();
