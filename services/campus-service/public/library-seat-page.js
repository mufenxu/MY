"use strict";

// 图书馆座位：查询座位 / 我的预约 / 自动预约任务三个页签。
// 挂载点由 reservation-hub.js 提供：#resvSeatQuery、#resvSeatRecords、#resvSeatWaitlist。
(function initLibrarySeatPage() {
  const api = window.HguCampusApi;
  const queryMount = document.querySelector("#resvSeatQuery");
  const recordsMount = document.querySelector("#resvSeatRecords");
  const waitlistMount = document.querySelector("#resvSeatWaitlist");
  if (typeof api !== "function" || !queryMount || !recordsMount || !waitlistMount) return;

  if (!document.querySelector("link[data-library-seat-page]")) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "./library-seat-page.css?v=20261108-seat-overview-v6";
    stylesheet.dataset.librarySeatPage = "1";
    document.head.append(stylesheet);
  }

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const pad2 = (value) => String(value).padStart(2, "0");
  const minuteText = (minutes) => `${pad2(Math.floor(Number(minutes) / 60))}:${pad2(Number(minutes) % 60)}`;
  const clampMinute = (value) => Math.max(0, Math.min(1440, Math.trunc(Number(value) || 0)));
  const weekdayText = (value) => {
    const parsed = new Date(`${value}T12:00:00+08:00`);
    if (!value || Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(parsed);
  };
  const localDate = (offset = 0) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(Date.now() + offset * 86400000));

  // 座位自动预约任务默认在目标日期的前一天 21:55 执行（学校此时放出次日座位）。
  const shiftDate = (value, days) => {
    const parsed = new Date(`${value}T12:00:00+08:00`);
    if (!value || Number.isNaN(parsed.getTime())) return "";
    return new Date(parsed.getTime() + days * 86400000).toISOString().slice(0, 10);
  };

  const SCHOOL_HINT = '学校账号未连接或已过期，请先到 <a href="#campus">一卡通</a> 页面连接学校账号。';

  function errorText(error) {
    if (!error) return "操作失败。";
    if (error.code === "SCHOOL_ACCOUNT_REQUIRED") return SCHOOL_HINT;
    return esc(error.message || "操作失败。");
  }

  function setStatus(node, message, tone = "") {
    if (!node) return;
    node.innerHTML = message;
    node.dataset.tone = tone;
  }

  const shared = {
    overview: null,
    dates: [],
    venues: []
  };

  async function ensureOverview() {
    if (shared.overview) return shared.overview;
    shared.overview = await api("/api/campus/library-seat/overview");
    shared.venues = Array.isArray(shared.overview?.venues) ? shared.overview.venues : [];
    const schoolDates = (Array.isArray(shared.overview?.dates) ? shared.overview.dates : []).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
    // 学校 21:55 才放次日号，放号前接口不会返回明天，这里补上，方便提前挂定时任务。
    shared.dates = [...new Set([...schoolDates, localDate(0), localDate(1)])].sort();
    return shared.overview;
  }

  function startMinuteOptions() {
    const options = [];
    for (let minute = 480; minute <= 1320; minute += 15) options.push(minute);
    return options;
  }

  const DURATIONS = [
    { value: 60, label: "1 小时" },
    { value: 90, label: "1.5 小时" },
    { value: 120, label: "2 小时" },
    { value: 180, label: "3 小时" },
    { value: 240, label: "4 小时" }
  ];

  function defaultFloor(floors) {
    return floors.find((floor) => /^(?:第)?(?:二|2)(?:层|楼)$|^(?:2F|F2)$/i.test(String(floor.name || "").trim())) || floors[0];
  }

  /* ------------------------------------------------------------------ 查询座位 */

  queryMount.innerHTML = `
    <section class="resv-panel">
      <div class="resv-panel-head">
        <div><h3>查询空闲座位</h3><p>先选场馆和时段，再进入阅览区查看平面图或座位列表。</p></div>
        <div class="resv-actions"><button id="seatQueryButton" type="button">查询座位</button></div>
      </div>
      <div class="resv-fields">
        <label class="resv-field"><span>场馆</span><select id="seatVenue"></select></label>
        <label class="resv-field"><span>楼层</span><select id="seatFloor"></select></label>
        <label class="resv-field"><span>日期</span><select id="seatDate"></select></label>
        <label class="resv-field"><span>开始时间</span><select id="seatStart"></select></label>
        <label class="resv-field"><span>使用时长</span><select id="seatDuration">${DURATIONS.map((item) => `<option value="${item.value}"${item.value === 120 ? " selected" : ""}>${item.label}</option>`).join("")}</select></label>
        <div class="resv-field"><span>筛选</span><div class="resv-actions"><label class="resv-check"><input id="seatWindow" type="checkbox">靠窗</label><label class="resv-check"><input id="seatPower" type="checkbox">有电源</label></div></div>
      </div>
      <p id="seatQueryStatus" class="resv-status" role="status" aria-live="polite"></p>
      <div id="seatMetrics" class="resv-metrics"></div>
    </section>
    <section id="seatAreasPanel" class="resv-panel" hidden>
      <div class="resv-panel-head"><div><h3>阅览区</h3><p id="seatAreasHint"></p></div></div>
      <div id="seatAreas" class="resv-grid"></div>
    </section>
    <section id="seatSeatsPanel" class="resv-panel" hidden>
      <div class="resv-panel-head seat-plan-head">
        <div><h3 id="seatAreaTitle">座位</h3><p id="seatAreaMeta"></p></div>
        <button id="seatAreaChange" class="ghost seat-area-change" type="button">更换阅览区</button>
      </div>
      <div class="seat-view-toolbar">
        <div class="resv-switch is-small"><button type="button" data-seat-view="plan" class="is-active">平面图</button><button type="button" data-seat-view="grid">列表</button></div>
        <span id="seatPlanSummary" class="resv-muted"></span>
      </div>
      <div id="seatPlanWrap" class="seat-plan-wrap" hidden>
        <div class="seat-map-toolbar">
          <div class="seat-plan-legend"><span><i class="is-free" aria-hidden="true"></i>可预约</span><span><i aria-hidden="true"></i>不可预约</span></div>
          <div class="seat-plan-zoom"><button type="button" data-seat-zoom="out" aria-label="缩小平面图" disabled>−</button><button type="button" data-seat-zoom="fit">全貌</button><button type="button" data-seat-zoom="in" aria-label="放大平面图">＋</button></div>
        </div>
        <div id="seatPlan" class="seat-plan"></div>
        <p id="seatPlanNote" class="resv-muted">默认显示完整布局，可放大查看座位号。</p>
      </div>
      <div id="seatGrid" class="seat-grid"></div>
      <p id="seatPlanHint" class="resv-status"></p>
    </section>
    <section id="seatBookPanel" class="resv-panel" hidden>
      <div class="resv-panel-head">
        <div><h3>预约座位</h3><p id="seatBookMeta"></p></div>
        <button id="seatBookClose" class="ghost" type="button">取消选择</button>
      </div>
      <div id="seatTimeline" class="seat-timeline"></div>
      <p class="resv-notice">提交后请按学校规定时间签到，超时未签到会被记为违约。</p>
      <div class="resv-actions"><button id="seatBookButton" type="button">提交预约</button><button id="seatBookGoRecords" class="ghost" type="button">查看我的预约</button></div>
      <p id="seatBookStatus" class="resv-status" role="status" aria-live="polite"></p>
    </section>`;

  const q = {
    venue: queryMount.querySelector("#seatVenue"), floor: queryMount.querySelector("#seatFloor"),
    date: queryMount.querySelector("#seatDate"), start: queryMount.querySelector("#seatStart"),
    duration: queryMount.querySelector("#seatDuration"), window: queryMount.querySelector("#seatWindow"),
    power: queryMount.querySelector("#seatPower"), button: queryMount.querySelector("#seatQueryButton"),
    status: queryMount.querySelector("#seatQueryStatus"), metrics: queryMount.querySelector("#seatMetrics"),
    areasPanel: queryMount.querySelector("#seatAreasPanel"), areasHint: queryMount.querySelector("#seatAreasHint"),
    areas: queryMount.querySelector("#seatAreas"), seatsPanel: queryMount.querySelector("#seatSeatsPanel"),
    areaTitle: queryMount.querySelector("#seatAreaTitle"), areaMeta: queryMount.querySelector("#seatAreaMeta"),
    areaChange: queryMount.querySelector("#seatAreaChange"), planSummary: queryMount.querySelector("#seatPlanSummary"),
    planWrap: queryMount.querySelector("#seatPlanWrap"), plan: queryMount.querySelector("#seatPlan"),
    planNote: queryMount.querySelector("#seatPlanNote"),
    grid: queryMount.querySelector("#seatGrid"), planHint: queryMount.querySelector("#seatPlanHint"),
    bookPanel: queryMount.querySelector("#seatBookPanel"), bookMeta: queryMount.querySelector("#seatBookMeta"),
    timeline: queryMount.querySelector("#seatTimeline"), bookButton: queryMount.querySelector("#seatBookButton"),
    bookClose: queryMount.querySelector("#seatBookClose"), bookGoRecords: queryMount.querySelector("#seatBookGoRecords"),
    bookStatus: queryMount.querySelector("#seatBookStatus")
  };

  const queryState = {
    venueId: "", floorId: "", date: "", startMinute: 540, duration: 120,
    areas: [], area: null, seats: [], layout: null, view: "plan", planZoom: 1, seat: null,
    areasExpanded: false, sequence: 0, loaded: false, loading: false
  };

  function currentWindow() {
    const start = clampMinute(queryState.startMinute);
    const end = Math.min(1440, start + Number(queryState.duration || 60));
    return { start, end };
  }

  function fillOverviewSelects() {
    q.venue.innerHTML = shared.venues.map((venue) => `<option value="${esc(venue.id)}">${esc(venue.name)}</option>`).join("");
    q.date.innerHTML = shared.dates.map((date) => `<option value="${esc(date)}">${esc(date)}（${esc(weekdayText(date))}）</option>`).join("");
    q.start.innerHTML = startMinuteOptions().map((minute) => `<option value="${minute}"${minute === queryState.startMinute ? " selected" : ""}>${minuteText(minute)}</option>`).join("");
    q.duration.value = String(queryState.duration);
    queryState.venueId = shared.venues[0]?.id || "";
    queryState.date = shared.dates[0] || localDate(0);
    q.venue.value = queryState.venueId;
    q.date.value = queryState.date;
    q.start.value = String(queryState.startMinute);
    fillFloorSelect();
  }

  function fillFloorSelect() {
    const venue = shared.venues.find((item) => String(item.id) === String(queryState.venueId));
    const floors = Array.isArray(venue?.floors) ? venue.floors : [];
    q.floor.innerHTML = '<option value="">全部楼层</option>' + floors.map((floor) => `<option value="${esc(floor.id)}">${esc(floor.name)}</option>`).join("");
    queryState.floorId = String(defaultFloor(floors)?.id || "");
    q.floor.value = queryState.floorId;
  }

  function renderMetrics(areas) {
    const total = areas.reduce((sum, area) => sum + (Number(area.seatTotal) || 0), 0);
    const free = areas.reduce((sum, area) => sum + (Number(area.seatFree) || 0), 0);
    const rate = total > 0 ? Math.round((free / total) * 1000) / 10 : 0;
    q.metrics.innerHTML = [
      ["阅览区", `${areas.length} 个`], ["总座位", `${total}`], ["可预约", `${free}`], ["可用率", `${rate}%`]
    ].map(([label, value]) => `<div class="resv-metric"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("");
  }

  function renderAreas() {
    q.areasPanel.classList.toggle("has-seat-selection", Boolean(queryState.area) && !queryState.areasExpanded);
    if (!queryState.areas.length) {
      q.areasPanel.hidden = false;
      q.areasHint.textContent = "该条件下没有返回阅览区，试试换时段或取消筛选。";
      q.areas.classList.remove("is-collapsed");
      q.areas.innerHTML = '<div class="resv-empty">暂无可选阅览区。</div>';
      return;
    }
    q.areasPanel.hidden = false;
    const { start, end } = currentWindow();
    q.areasHint.textContent = `${queryState.date}（${weekdayText(queryState.date)}） ${minuteText(start)} - ${minuteText(end)} · 共 ${queryState.areas.length} 个阅览区`;
    // 选中阅览区后，其余卡片默认收起，免得列表把下面的座位推得太远。
    const others = queryState.areas.length - 1;
    const collapsed = Boolean(queryState.area) && others > 0 && !queryState.areasExpanded;
    q.areas.classList.toggle("is-collapsed", collapsed);
    const cards = queryState.areas.map((area) => {
      const active = queryState.area && String(queryState.area.id) === String(area.id);
      return `<article class="seat-area${active ? " is-active" : ""}" data-seat-area="${esc(area.id)}" tabindex="0" role="button">
        <div class="seat-area-head"><strong>${esc(area.name)}</strong><span class="resv-badge ${Number(area.seatFree) > 0 ? "is-ok" : "is-bad"}">可用 ${Number(area.seatFree) || 0}</span></div>
        <p class="resv-muted">${esc([area.buildingName, area.floorName].filter(Boolean).join(" · ") || "—")}</p>
        <div class="seat-area-metrics"><span>总座位 <b>${Number(area.seatTotal) || 0}</b></span><span>最长 <b>${Number(area.maxMinute) > 0 ? `${Math.round(Number(area.maxMinute) / 60 * 10) / 10}h` : "--"}</b></span></div>
      </article>`;
    }).join("");
    const toggle = queryState.area && others > 0
      ? `<button type="button" class="seat-areas-toggle" data-seat-areas-toggle aria-expanded="${queryState.areasExpanded}">${collapsed ? `展开其他 ${others} 个阅览区` : "收起其他阅览区"}</button>`
      : "";
    q.areas.innerHTML = cards + toggle;
    q.areas.querySelectorAll("[data-seat-area]").forEach((card) => {
      const open = () => selectArea(card.dataset.seatArea);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
    const toggleButton = q.areas.querySelector("[data-seat-areas-toggle]");
    if (toggleButton) {
      toggleButton.addEventListener("click", () => {
        queryState.areasExpanded = !queryState.areasExpanded;
        renderAreas();
      });
    }
  }

  async function runQuery() {
    const { start, end } = currentWindow();
    q.button.disabled = true;
    setStatus(q.status, "正在查询阅览区...");
    queryState.sequence += 1;
    const token = queryState.sequence;
    try {
      const params = new URLSearchParams({
        venueId: queryState.venueId, date: queryState.date, startMinute: String(start), endMinute: String(end),
        pageSize: "100", currentPage: "1", power: String(q.power.checked), window: String(q.window.checked)
      });
      if (queryState.floorId) params.set("floorId", queryState.floorId);
      const payload = await api(`/api/campus/library-seat/areas?${params.toString()}`);
      if (token !== queryState.sequence) return;
      queryState.areas = Array.isArray(payload?.areas) ? payload.areas : [];
      queryState.area = null;
      queryState.areasExpanded = false;
      queryState.seats = [];
      queryState.layout = null;
      queryState.seat = null;
      q.seatsPanel.hidden = true;
      q.bookPanel.hidden = true;
      renderMetrics(queryState.areas);
      renderAreas();
      const total = Number(payload?.paging?.total) || queryState.areas.length;
      setStatus(q.status, total > queryState.areas.length
        ? `共 ${total} 个阅览区，这里显示前 ${queryState.areas.length} 个。`
        : `查询到 ${queryState.areas.length} 个阅览区。`, "ok");
    } catch (error) {
      if (token !== queryState.sequence) return;
      queryState.areas = [];
      renderMetrics([]);
      q.areasPanel.hidden = true;
      setStatus(q.status, errorText(error), "error");
    } finally {
      if (token === queryState.sequence) q.button.disabled = false;
    }
  }

  async function selectArea(areaId) {
    const area = queryState.areas.find((item) => String(item.id) === String(areaId));
    if (!area) return;
    queryState.area = area;
    queryState.seat = null;
    queryState.planZoom = 1;
    queryState.areasExpanded = false;
    q.bookPanel.hidden = true;
    renderAreas();
    q.seatsPanel.hidden = false;
    q.areaTitle.textContent = area.name;
    const { start, end } = currentWindow();
    q.areaMeta.textContent = `${[area.buildingName, area.floorName].filter(Boolean).join(" · ") || "阅览区"} · ${queryState.date} ${minuteText(start)} - ${minuteText(end)}`;
    q.grid.innerHTML = '<div class="resv-empty">正在查询座位...</div>';
    setStatus(q.planHint, "");
    const token = ++queryState.sequence;
    try {
      const params = new URLSearchParams({
        roomId: String(area.id), date: queryState.date, startMinute: String(start), endMinute: String(end)
      });
      const seatsPromise = api(`/api/campus/library-seat/seats?${params.toString()}`);
      const layoutPromise = api(`/api/campus/library-seat/layout?roomId=${encodeURIComponent(area.id)}`).catch(() => null);
      const [seats, layout] = await Promise.all([seatsPromise, layoutPromise]);
      if (token !== queryState.sequence) return;
      queryState.seats = Array.isArray(seats) ? seats : [];
      queryState.layout = layout && Array.isArray(layout.seats) && layout.seats.length ? layout : null;
      renderSeats();
      if (window.matchMedia("(max-width: 640px)").matches) q.seatsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (token !== queryState.sequence) return;
      queryState.seats = [];
      q.grid.innerHTML = `<div class="resv-empty">${errorText(error)}</div>`;
    }
  }

  function seatStatusClass(seat) {
    if (!seat) return "is-unknown";
    if (seat.isFree) return "is-free";
    return String(seat.status || "").toUpperCase() === "IN_USE" ? "is-used" : "is-locked";
  }

  function seatByLabel() {
    const map = new Map();
    queryState.seats.forEach((seat) => {
      map.set(String(seat.label), seat);
      map.set(String(seat.id), seat);
    });
    return map;
  }

  function renderSeats() {
    const seats = queryState.seats;
    const freeCount = seats.filter((seat) => seat.isFree).length;
    q.planSummary.textContent = `${seats.length} 个座位 · 可约 ${freeCount}`;
    const usePlan = queryState.view === "plan" && queryState.layout;
    q.planWrap.hidden = !usePlan;
    q.grid.hidden = Boolean(usePlan);
    queryMount.querySelectorAll("[data-seat-view]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.seatView === (usePlan ? "plan" : "grid"));
    });
    if (!seats.length && !usePlan) {
      q.grid.innerHTML = '<div class="resv-empty">该时段没有返回座位数据。</div>';
      return;
    }
    if (usePlan) renderPlan();
    else {
      q.grid.innerHTML = seats.map((seat) => `<button type="button" class="seat-chip ${seatStatusClass(seat)}${queryState.seat && queryState.seat.id === seat.id ? " is-selected" : ""}" data-seat-id="${esc(seat.id)}"${seat.isFree ? "" : " disabled"}>
        <span class="seat-chip-label">${esc(seat.label)}</span><span class="seat-chip-status">${esc(seat.statusText || "未知")}</span>
      </button>`).join("");
      bindSeatClicks(q.grid);
    }
    setStatus(q.planHint, queryState.layout ? "" : "该阅览区未返回平面布局，已显示座位列表。");
  }

  // 座位坐标里的最小间距，用来推算「不重叠」需要多大的画布。
  function coordinateGap(values, span) {
    const sorted = [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
    if (sorted.length < 2) return span || 1;
    // 忽略同一列或行的细微坐标偏差，避免把它们当成座位间距。
    const floor = Math.max(0.01, span * 0.01);
    let gap = Infinity;
    for (let index = 1; index < sorted.length; index += 1) {
      const diff = sorted[index] - sorted[index - 1];
      if (diff > floor && diff < gap) gap = diff;
    }
    return Number.isFinite(gap) ? gap : (span || 1);
  }

  function renderPlan() {
    const seats = queryState.layout?.seats || [];
    const xs = seats.map((seat) => Number(seat.left)).filter((value) => Number.isFinite(value));
    const ys = seats.map((seat) => Number(seat.top)).filter((value) => Number.isFinite(value));
    if (!xs.length || !ys.length) {
      queryState.layout = null;
      renderSeats();
      return;
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    const hostW = q.plan.clientWidth || q.planWrap.clientWidth || 360;
    const maxH = Math.min(360, Math.max(200, window.innerHeight * 0.4));
    const pad = 16;
    const colGap = coordinateGap(xs, spanX);
    const rowGap = coordinateGap(ys, spanY);
    // 同一个比例缩放横纵坐标，先完整适配可见区域，再由用户放大选座。
    const fitScale = Math.min((hostW - pad * 2 - 36) / spanX, (maxH - pad * 2 - 30) / spanY);
    const scale = fitScale * queryState.planZoom;
    const dotW = Math.max(8, Math.min(36, colGap * scale - 3));
    const dotH = Math.max(8, Math.min(30, rowGap * scale - 3));
    const width = Math.ceil(spanX * scale + pad * 2 + dotW);
    const height = Math.ceil(spanY * scale + pad * 2 + dotH);
    const scrollLeft = q.plan.scrollLeft;
    const scrollTop = q.plan.scrollTop;
    q.plan.style.height = `${Math.max(180, Math.ceil(spanY * fitScale + pad * 2 + 30)) + 2}px`;
    const lookup = seatByLabel();
    const dots = seats.map((item) => {
      const seat = lookup.get(String(item.id)) || lookup.get(String(item.label));
      const left = pad + dotW / 2 + (Number(item.left) - minX) * scale;
      const top = pad + dotH / 2 + (Number(item.top) - minY) * scale;
      const selected = seat && queryState.seat && queryState.seat.id === seat.id;
      const label = seat ? `${seat.label} · ${seat.statusText}` : `${item.label} · 状态未知`;
      return `<button type="button" class="seat-dot ${seatStatusClass(seat)}${selected ? " is-selected" : ""}" data-seat-id="${esc(seat ? seat.id : item.id)}" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${dotW}px;height:${dotH}px;font-size:${Math.max(8, Math.min(12, dotW * 0.42))}px" title="${esc(label)}" aria-label="${esc(label)}"${seat && seat.isFree ? "" : " disabled"}><span>${esc(item.label)}</span></button>`;
    }).join("");
    q.plan.innerHTML = `<div class="seat-plan-canvas" style="width:${width}px;height:${height}px">${dots}</div>`;
    bindSeatClicks(q.plan);
    q.plan.scrollLeft = queryState.planZoom === 1 ? 0 : scrollLeft;
    q.plan.scrollTop = queryState.planZoom === 1 ? 0 : scrollTop;
    q.planNote.textContent = queryState.planZoom === 1 ? "已显示完整布局；可放大查看座位号，点击绿色座位预约。" : "已放大，可滑动查看；点击“全貌”恢复完整布局。";
    queryMount.querySelectorAll("[data-seat-zoom]").forEach((button) => {
      button.disabled = (button.dataset.seatZoom === "out" && queryState.planZoom === 1)
        || (button.dataset.seatZoom === "in" && queryState.planZoom === 4);
    });
  }

  function bindSeatClicks(root) {
    root.querySelectorAll("[data-seat-id]").forEach((button) => {
      button.addEventListener("click", () => selectSeat(button.dataset.seatId));
    });
  }

  async function selectSeat(seatId) {
    const seat = queryState.seats.find((item) => String(item.id) === String(seatId));
    if (!seat || !seat.isFree) return;
    queryState.seat = seat;
    renderSeats();
    q.bookPanel.hidden = false;
    const { start, end } = currentWindow();
    q.bookMeta.textContent = `${queryState.area?.name || "阅览区"} · ${seat.label} · ${queryState.date} ${minuteText(start)} - ${minuteText(end)}`;
    setStatus(q.bookStatus, "");
    q.timeline.innerHTML = '<p class="resv-muted">正在读取该座位当天的时间轴...</p>';
    q.bookPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
      const payload = await api(`/api/campus/library-seat/timeline?seatId=${encodeURIComponent(seat.id)}&date=${encodeURIComponent(queryState.date)}`);
      renderTimeline(payload);
    } catch (error) {
      q.timeline.innerHTML = `<p class="resv-muted">${errorText(error)}</p>`;
    }
  }

  function renderTimeline(payload) {
    const free = Array.isArray(payload?.free) ? payload.free : [];
    const marks = Array.isArray(payload?.marks) ? payload.marks : [];
    if (!free.length) {
      q.timeline.innerHTML = '<p class="resv-muted">该座位当天没有返回可预约时间轴。</p>';
      return;
    }
    q.timeline.innerHTML = `
      <p class="resv-muted">当天可预约区间（绿色为可预约）：</p>
      <div class="seat-timeline-track">${free.map((item) => `<span class="seat-timeline-free" style="left:${Number(item.left).toFixed(2)}%;width:${Number(item.width).toFixed(2)}%"></span>`).join("")}${marks.map((item) => `<span class="seat-timeline-mark" style="left:${Number(item.left).toFixed(2)}%" title="${esc(item.label || "")}"></span>`).join("")}</div>
      <div class="seat-timeline-axis"><span>08:00</span><span>12:00</span><span>16:00</span><span>22:00</span></div>`;
  }

  async function submitSeatBooking() {
    if (!queryState.seat) return;
    const { start, end } = currentWindow();
    q.bookButton.disabled = true;
    setStatus(q.bookStatus, "正在提交预约...");
    try {
      await api("/api/campus/library-seat/reservations", {
        method: "POST",
        body: { seatId: queryState.seat.id, date: queryState.date, startMinute: start, endMinute: end, capToken: "" }
      });
      setStatus(q.bookStatus, "预约提交成功，请按时签到。", "ok");
      queryState.seat = null;
      q.bookPanel.hidden = true;
      if (queryState.area) await selectArea(queryState.area.id);
    } catch (error) {
      setStatus(q.bookStatus, errorText(error), "error");
    } finally {
      q.bookButton.disabled = false;
    }
  }

  function markQueryStale() {
    if (!queryState.areas.length && !queryState.seat) return;
    queryState.areas = [];
    queryState.area = null;
    queryState.seat = null;
    queryState.layout = null;
    queryState.seats = [];
    q.areasPanel.hidden = true;
    q.seatsPanel.hidden = true;
    q.bookPanel.hidden = true;
    q.metrics.innerHTML = "";
    setStatus(q.status, "查询条件已变化，请重新点击“查询座位”。", "warning");
  }

  q.venue.addEventListener("change", () => {
    queryState.venueId = q.venue.value;
    fillFloorSelect();
    markQueryStale();
  });
  q.floor.addEventListener("change", () => { queryState.floorId = q.floor.value; markQueryStale(); });
  q.date.addEventListener("change", () => { queryState.date = q.date.value; markQueryStale(); });
  q.start.addEventListener("change", () => { queryState.startMinute = Number(q.start.value); markQueryStale(); });
  q.duration.addEventListener("change", () => { queryState.duration = Number(q.duration.value); markQueryStale(); });
  q.window.addEventListener("change", markQueryStale);
  q.power.addEventListener("change", markQueryStale);
  q.button.addEventListener("click", runQuery);
  q.areaChange.addEventListener("click", () => {
    queryState.areasExpanded = true;
    renderAreas();
    q.areasPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  q.bookButton.addEventListener("click", submitSeatBooking);
  q.bookClose.addEventListener("click", () => {
    queryState.seat = null;
    q.bookPanel.hidden = true;
    renderSeats();
  });
  q.bookGoRecords.addEventListener("click", () => window.HguReservation?.activate("seat", "records"));
  queryMount.querySelectorAll("[data-seat-view]").forEach((button) => {
    button.addEventListener("click", () => {
      queryState.view = button.dataset.seatView;
      queryMount.querySelectorAll("[data-seat-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      if (queryState.area) renderSeats();
    });
  });
  queryMount.querySelectorAll("[data-seat-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      queryState.planZoom = button.dataset.seatZoom === "fit" ? 1
        : Math.max(1, Math.min(4, queryState.planZoom + (button.dataset.seatZoom === "in" ? 0.5 : -0.5)));
      renderPlan();
    });
  });
  window.addEventListener("resize", () => {
    if (!q.planWrap.hidden && q.plan.clientWidth > 0 && queryState.layout) renderPlan();
  });

  async function initQuery() {
    if (queryState.loaded || queryState.loading) return;
    queryState.loading = true;
    q.venue.innerHTML = '<option value="">正在加载场馆...</option>';
    setStatus(q.status, "正在读取图书馆座位配置...");
    try {
      await ensureOverview();
      queryState.loaded = true;
      fillOverviewSelects();
      setStatus(q.status, shared.venues.length ? "选择条件后点击“查询座位”。" : "学校接口没有返回场馆配置。", shared.venues.length ? "" : "warning");
      if (shared.venues.length) await runQuery();
    } catch (error) {
      setStatus(q.status, errorText(error), "error");
    } finally {
      queryState.loading = false;
    }
  }

  /* ------------------------------------------------------------------ 我的预约 */

  recordsMount.innerHTML = `
    <section id="seatCurrentPanel" class="resv-panel" hidden>
      <div class="resv-panel-head"><div><h3>当前使用中</h3><p id="seatCurrentMeta"></p></div><span id="seatCurrentBadge" class="resv-badge is-info">使用中</span></div>
      <div class="resv-actions"><button id="seatCheckIn" class="ghost" type="button">签到</button><button id="seatLeave" class="ghost" type="button">暂离</button><button id="seatStop" class="ghost" type="button">结束使用</button></div>
      <p id="seatCurrentStatus" class="resv-status"></p>
    </section>
    <section class="resv-panel">
      <div class="resv-panel-head">
        <div><h3>我的座位预约</h3><p>今日预约可取消并查看变更记录；历史、违约与门禁记录用于自查。</p></div>
        <div class="resv-actions"><button id="seatRecordsReload" class="ghost" type="button">刷新</button></div>
      </div>
      <div class="resv-tabs" role="tablist" aria-label="座位预约记录">
        <button type="button" role="tab" data-seat-record-tab="today" class="is-active">今日预约</button>
        <button type="button" role="tab" data-seat-record-tab="history">历史预约</button>
        <button type="button" role="tab" data-seat-record-tab="breaches">违约记录</button>
        <button type="button" role="tab" data-seat-record-tab="doors">门禁记录</button>
      </div>
      <div id="seatRecordsBody" class="resv-list"></div>
      <p id="seatRecordsStatus" class="resv-status" role="status" aria-live="polite"></p>
    </section>`;

  const r = {
    currentPanel: recordsMount.querySelector("#seatCurrentPanel"), currentMeta: recordsMount.querySelector("#seatCurrentMeta"),
    currentBadge: recordsMount.querySelector("#seatCurrentBadge"), checkIn: recordsMount.querySelector("#seatCheckIn"),
    leave: recordsMount.querySelector("#seatLeave"), stop: recordsMount.querySelector("#seatStop"),
    currentStatus: recordsMount.querySelector("#seatCurrentStatus"), reload: recordsMount.querySelector("#seatRecordsReload"),
    body: recordsMount.querySelector("#seatRecordsBody"), status: recordsMount.querySelector("#seatRecordsStatus")
  };

  const recordsState = { tab: "today", loaded: false, historyPage: 0, breachPage: 0, historyDone: false, breachDone: false, doorDate: localDate(0) };

  function recordCard(record, { cancellable = false } = {}) {
    const meta = [
      record.date ? `${record.date}（${weekdayText(record.date)}）` : "",
      record.startTime && record.endTime ? `${record.startTime} - ${record.endTime}` : "",
      record.location || ""
    ].filter(Boolean).join(" · ");
    const seat = record.seatLabel ? `座位 ${record.seatLabel}` : "";
    return `<article class="resv-item" data-record="${esc(record.id)}">
      <div class="resv-item-head"><span class="resv-item-title">${esc([record.buildName, record.roomName, seat].filter(Boolean).join(" · ") || "座位预约")}</span><span class="resv-badge${record.status === "USING" ? " is-info" : ""}">${esc(record.statusText || record.status || "未知")}</span></div>
      <p class="resv-item-meta">${esc(meta || "—")}</p>
      ${record.message ? `<p class="resv-item-meta">${esc(record.message)}</p>` : ""}
      <div class="resv-item-actions">
        ${cancellable ? `<button class="ghost" type="button" data-record-cancel="${esc(record.id)}">取消预约</button>` : ""}
        <button class="ghost" type="button" data-record-life="${esc(record.id)}">变更记录</button>
      </div>
      <div class="resv-item-meta" data-record-life-body hidden></div>
    </article>`;
  }

  function bindRecordActions() {
    r.body.querySelectorAll("[data-record-cancel]").forEach((button) => {
      button.addEventListener("click", () => cancelRecord(button.dataset.recordCancel, button));
    });
    r.body.querySelectorAll("[data-record-life]").forEach((button) => {
      button.addEventListener("click", () => loadLife(button.dataset.recordLife, button));
    });
  }

  async function cancelRecord(id, button) {
    if (!window.confirm("确定取消这条座位预约吗？取消次数按学校规则扣除。")) return;
    button.disabled = true;
    setStatus(r.status, "正在取消预约...");
    try {
      const payload = await api(`/api/campus/library-seat/reservations/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      const remaining = payload?.remainingCancelCount;
      setStatus(r.status, Number.isFinite(Number(remaining)) ? `预约已取消，本月剩余取消次数 ${remaining} 次。` : "预约已取消。", "ok");
      await loadCurrentUse();
      await loadRecordTab(recordsState.tab, true);
    } catch (error) {
      setStatus(r.status, errorText(error), "error");
      button.disabled = false;
    }
  }

  async function loadLife(id, button) {
    const body = button.closest("[data-record]")?.querySelector("[data-record-life-body]");
    if (!body) return;
    if (!body.hidden) {
      body.hidden = true;
      return;
    }
    button.disabled = true;
    try {
      const list = await api(`/api/campus/library-seat/reservations/${encodeURIComponent(id)}/life`);
      body.hidden = false;
      body.innerHTML = Array.isArray(list) && list.length
        ? list.map((item) => `<div>· ${esc(item.stageName || "变更")} ${esc(item.createdDate || "")} ${esc(item.sourceName || "")}</div>`).join("")
        : "暂无变更记录。";
    } catch (error) {
      body.hidden = false;
      body.innerHTML = errorText(error);
    } finally {
      button.disabled = false;
    }
  }

  async function loadCurrentUse() {
    try {
      const current = await api("/api/campus/library-seat/current-use");
      if (!current) {
        r.currentPanel.hidden = true;
        return;
      }
      r.currentPanel.hidden = false;
      r.currentBadge.textContent = current.statusText || "使用中";
      r.currentMeta.textContent = [
        [current.buildName, current.roomName, current.seatLabel ? `座位 ${current.seatLabel}` : ""].filter(Boolean).join(" · "),
        current.date ? `${current.date} ${current.startTime || ""} - ${current.endTime || ""}` : "",
        current.awayRange ? `暂离 ${current.awayRange}` : ""
      ].filter(Boolean).join(" · ");
    } catch {
      r.currentPanel.hidden = true;
    }
  }

  async function loadRecordTab(tab, force = false) {
    recordsState.tab = tab;
    if (tab === "today") {
      r.body.innerHTML = '<div class="resv-empty">正在加载今日预约...</div>';
      try {
        const list = await api("/api/campus/library-seat/reservations");
        r.body.innerHTML = Array.isArray(list) && list.length
          ? list.map((record) => recordCard(record, { cancellable: record.status !== "USING" })).join("")
          : '<div class="resv-empty">今天没有座位预约。</div>';
        bindRecordActions();
        setStatus(r.status, Array.isArray(list) && list.length ? `共 ${list.length} 条预约。` : "");
      } catch (error) {
        r.body.innerHTML = `<div class="resv-empty">${errorText(error)}</div>`;
      }
      return;
    }
    if (tab === "history") {
      if (force) {
        recordsState.historyPage = 0;
        recordsState.historyDone = false;
      }
      await loadPaged("history");
      return;
    }
    if (tab === "breaches") {
      if (force) {
        recordsState.breachPage = 0;
        recordsState.breachDone = false;
      }
      await loadPaged("breaches");
      return;
    }
    await loadDoors();
  }

  async function loadPaged(kind) {
    const isHistory = kind === "history";
    const page = isHistory ? recordsState.historyPage : recordsState.breachPage;
    const done = isHistory ? recordsState.historyDone : recordsState.breachDone;
    if (done) return;
    const append = page > 0;
    if (!append) r.body.innerHTML = `<div class="resv-empty">正在加载${isHistory ? "历史预约" : "违约记录"}...</div>`;
    try {
      const payload = isHistory
        ? await api(`/api/campus/library-seat/reservations/history?page=${page}&size=10`)
        : await api(`/api/campus/library-seat/breaches?page=${page}&size=10`);
      const records = Array.isArray(payload?.records) ? payload.records : [];
      const total = Number(payload?.total) || records.length;
      const html = records.map((record) => recordCard(record)).join("");
      if (append) {
        r.body.querySelectorAll("[data-load-more]").forEach((button) => button.remove());
        r.body.insertAdjacentHTML("beforeend", html);
      } else {
        r.body.innerHTML = html || `<div class="resv-empty">没有${isHistory ? "历史预约" : "违约记录"}。</div>`;
      }
      const nextPage = page + 1;
      const hasMore = records.length >= 10 && nextPage * 10 < total;
      if (hasMore) {
        r.body.insertAdjacentHTML("beforeend", `<button class="ghost" type="button" data-load-more="1">加载更多（已显示 ${(page + 1) * records.length} / ${total}）</button>`);
        r.body.querySelector("[data-load-more]").addEventListener("click", () => {
          if (isHistory) recordsState.historyPage = nextPage;
          else recordsState.breachPage = nextPage;
          loadPaged(kind);
        });
      } else if (isHistory) recordsState.historyDone = true;
      else recordsState.breachDone = true;
      bindRecordActions();
      setStatus(r.status, `共 ${total} 条记录。`);
    } catch (error) {
      r.body.innerHTML = `<div class="resv-empty">${errorText(error)}</div>`;
    }
  }

  async function loadDoors() {
    r.body.innerHTML = `<div class="resv-actions"><label class="resv-field"><span>日期</span><input id="seatDoorDate" type="date" value="${esc(recordsState.doorDate)}"></label><button id="seatDoorQuery" class="ghost" type="button">查询</button></div><div id="seatDoorList" class="resv-list"><div class="resv-empty">正在加载门禁记录...</div></div>`;
    const input = r.body.querySelector("#seatDoorDate");
    const list = r.body.querySelector("#seatDoorList");
    const query = async () => {
      recordsState.doorDate = input.value || localDate(0);
      list.innerHTML = '<div class="resv-empty">正在加载...</div>';
      try {
        const rows = await api(`/api/campus/library-seat/door-logs?date=${encodeURIComponent(recordsState.doorDate)}`);
        list.innerHTML = Array.isArray(rows) && rows.length
          ? rows.map((row) => `<article class="resv-item"><div class="resv-item-head"><span class="resv-item-title">${esc(row.doorName || "门禁")}</span><span class="resv-badge${row.direction === 0 ? " is-ok" : ""}">${esc(row.directionText)}</span></div><p class="resv-item-meta">${esc(row.dateTime || "")}</p></article>`).join("")
          : '<div class="resv-empty">该日期没有门禁记录。</div>';
        setStatus(r.status, "");
      } catch (error) {
        list.innerHTML = `<div class="resv-empty">${errorText(error)}</div>`;
      }
    };
    r.body.querySelector("#seatDoorQuery").addEventListener("click", query);
    await query();
  }

  async function runCurrentAction(kind) {
    const labels = { checkIn: "签到", leave: "暂离", stop: "结束使用" };
    const button = kind === "checkIn" ? r.checkIn : kind === "leave" ? r.leave : r.stop;
    button.disabled = true;
    setStatus(r.currentStatus, `正在${labels[kind]}...`);
    try {
      await api(`/api/campus/library-seat/current-use/${kind === "checkIn" ? "check-in" : kind}`, { method: "POST" });
      setStatus(r.currentStatus, `${labels[kind]}成功。`, "ok");
      await loadCurrentUse();
      await loadRecordTab(recordsState.tab, true);
    } catch (error) {
      setStatus(r.currentStatus, errorText(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  recordsMount.querySelectorAll("[data-seat-record-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      recordsMount.querySelectorAll("[data-seat-record-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
      loadRecordTab(button.dataset.seatRecordTab, true);
    });
  });
  r.reload.addEventListener("click", () => {
    loadCurrentUse();
    loadRecordTab(recordsState.tab, true);
  });
  r.checkIn.addEventListener("click", () => runCurrentAction("checkIn"));
  r.leave.addEventListener("click", () => runCurrentAction("leave"));
  r.stop.addEventListener("click", () => runCurrentAction("stop"));

  async function initRecords() {
    if (recordsState.loaded) return;
    recordsState.loaded = true;
    setStatus(r.status, "");
    await loadCurrentUse();
    await loadRecordTab(recordsState.tab);
  }

  /* ------------------------------------------------------------------ 自动预约任务 */

  waitlistMount.innerHTML = `
    <section class="resv-panel">
      <div class="resv-panel-head">
        <div><h3>新建自动预约任务</h3><p>提前准备，到点优先提交指定座位；已被占用时立即换相邻座位，再按号段和其他空位尝试。提交结果待确认时暂停重复预约。</p></div>
      </div>
      <form id="seatWaitlistForm" class="resv-fields is-waitlist">
        <label class="resv-field"><span>场馆</span><select id="seatWaitlistVenue" required></select></label>
        <label class="resv-field"><span>楼层</span><select id="seatWaitlistFloor" required></select></label>
        <label class="resv-field"><span>优先阅览区</span><select id="seatAutoPreferredArea"><option value="">不指定（所选楼层）</option></select></label>
        <label class="resv-field"><span>预约目标日期</span><select id="seatWaitlistDate" required></select></label>
        <label class="resv-field"><span>开始时间</span><select id="seatWaitlistStart" required></select></label>
        <label class="resv-field"><span>使用时长</span><select id="seatWaitlistDuration">${DURATIONS.map((item) => `<option value="${item.value}"${item.value === 120 ? " selected" : ""}>${item.label}</option>`).join("")}</select></label>
        <label class="resv-field"><span>任务运行日期</span><input id="seatAutoRunDate" type="date" required></label>
        <label class="resv-field"><span>任务运行时间</span><input id="seatAutoRunTime" type="time" step="60" value="21:55" required></label>
        <label class="resv-field is-wide"><span>指定座位号 <small>可选，填了就先抢这些号</small></span><input id="seatWaitlistLabels" placeholder="逗号分隔，例如 8,12,15；没抢到会自动换相邻号"></label>
        <fieldset class="seat-auto-range">
          <legend>换座优先号段</legend>
          <div class="seat-auto-range-inputs">
            <label class="resv-field"><span>最小座位号（含）</span><input id="seatWaitlistMin" type="number" min="1" max="999" value="1" aria-describedby="seatAutoRangeHint" required></label>
            <label class="resv-field"><span>最大座位号（含）</span><input id="seatWaitlistMax" type="number" min="1" max="999" value="45" aria-describedby="seatAutoRangeHint" required></label>
          </div>
          <p id="seatAutoRangeHint" class="resv-muted"></p>
        </fieldset>
        <p id="seatWaitlistOpenHint" class="resv-open-hint" role="status"></p>
        <div class="resv-actions is-waitlist-actions">
          <label class="resv-check"><input id="seatWaitlistEnabled" type="checkbox" checked>创建后立即启用</label>
          <button id="seatWaitlistSubmit" type="submit">创建自动预约任务</button>
        </div>
      </form>
      <p id="seatWaitlistStatus" class="resv-status" role="status" aria-live="polite"></p>
    </section>
    <section class="resv-panel">
      <div class="resv-panel-head"><div><h3>我的自动预约任务</h3><p>到点开始快速尝试，成功立即停止。可随时停用或删除；结果待确认时请先查看我的预约。</p></div><button id="seatWaitlistReload" class="ghost" type="button">刷新</button></div>
      <div id="seatWaitlistList" class="resv-list"><div class="resv-empty">打开本页签后自动加载。</div></div>
    </section>`;

  const w = {
    venue: waitlistMount.querySelector("#seatWaitlistVenue"), floor: waitlistMount.querySelector("#seatWaitlistFloor"),
    preferredArea: waitlistMount.querySelector("#seatAutoPreferredArea"),
    date: waitlistMount.querySelector("#seatWaitlistDate"), start: waitlistMount.querySelector("#seatWaitlistStart"),
    duration: waitlistMount.querySelector("#seatWaitlistDuration"), min: waitlistMount.querySelector("#seatWaitlistMin"),
    max: waitlistMount.querySelector("#seatWaitlistMax"), labels: waitlistMount.querySelector("#seatWaitlistLabels"),
    runDate: waitlistMount.querySelector("#seatAutoRunDate"), runTime: waitlistMount.querySelector("#seatAutoRunTime"),
    enabled: waitlistMount.querySelector("#seatWaitlistEnabled"), form: waitlistMount.querySelector("#seatWaitlistForm"),
    submit: waitlistMount.querySelector("#seatWaitlistSubmit"), status: waitlistMount.querySelector("#seatWaitlistStatus"),
    openHint: waitlistMount.querySelector("#seatWaitlistOpenHint"),
    rangeHint: waitlistMount.querySelector("#seatAutoRangeHint"),
    reload: waitlistMount.querySelector("#seatWaitlistReload"), list: waitlistMount.querySelector("#seatWaitlistList")
  };

  function syncSeatRangeHint() {
    const range = `${w.min.value || "最小号"}～${w.max.value || "最大号"}`;
    w.rangeHint.textContent = `${range} 号（包含两端）是换座优先范围，不是预约数量。先抢指定号，再换相邻号，再在此范围内从小到大选座；都没抢到时，可换所选楼层其他座位。每次只预约 1 个座位。`;
  }
  w.min.addEventListener("input", syncSeatRangeHint);
  w.max.addEventListener("input", syncSeatRangeHint);
  syncSeatRangeHint();

  function syncWaitlistOpenHint() {
    if (!w.openHint) return;
    const target = w.date.value;
    const runDate = w.runDate.value || shiftDate(target, -1);
    const runTime = w.runTime.value || "21:55";
    if (!target || !runDate || !runTime) {
      w.openHint.textContent = "";
      return;
    }
    const runMs = new Date(`${runDate}T${runTime}:00+08:00`).getTime();
    const passed = Number.isFinite(runMs) && Date.now() >= runMs;
    w.openHint.dataset.waiting = passed ? "false" : "true";
    w.openHint.textContent = passed
      ? `运行时间 ${runDate} ${runTime} 已过，保存后会自动执行一次，抢 ${target} 的座位。`
      : `将在 ${runDate} ${runTime} 自动执行，抢 ${target} 的座位。`;
  }

  const waitlistState = { loaded: false, loading: false, tasks: [] };

  function fillWaitlistSelects() {
    w.venue.innerHTML = shared.venues.map((venue) => `<option value="${esc(venue.id)}">${esc(venue.name)}</option>`).join("");
    w.date.innerHTML = shared.dates.map((date) => `<option value="${esc(date)}">${esc(date)}（${esc(weekdayText(date))}）</option>`).join("");
    w.start.innerHTML = startMinuteOptions().map((minute) => `<option value="${minute}"${minute === 540 ? " selected" : ""}>${minuteText(minute)}</option>`).join("");
    w.runDate.value = shiftDate(w.date.value, -1) || localDate(0);
    fillWaitlistFloors();
    loadPreferredAreas();
    syncWaitlistOpenHint();
  }

  let preferredAreaRequest = 0;
  async function loadPreferredAreas() {
    const request = ++preferredAreaRequest;
    const selected = w.preferredArea.value;
    w.preferredArea.innerHTML = '<option value="">不指定（所选楼层）</option>';
    if (!w.venue.value || !w.floor.value || !w.date.value) return;
    try {
      const start = Number(w.start.value);
      const query = new URLSearchParams({ venueId: w.venue.value, floorId: w.floor.value, date: w.date.value,
        startMinute: String(start), endMinute: String(Math.min(1440, start + Number(w.duration.value))), pageSize: "50" });
      const payload = await api(`/api/campus/library-seat/areas?${query}`);
      if (request !== preferredAreaRequest) return;
      const areas = Array.isArray(payload) ? payload : payload?.areas || [];
      w.preferredArea.insertAdjacentHTML("beforeend", areas.map((area) => `<option value="${esc(area.id)}">${esc(area.name || "阅览区")}</option>`).join(""));
      if (areas.some((area) => String(area.id) === selected)) w.preferredArea.value = selected;
    } catch { /* 查询失败时仍可按楼层创建任务。 */ }
  }

  function fillWaitlistFloors() {
    const venue = shared.venues.find((item) => String(item.id) === String(w.venue.value));
    const floors = Array.isArray(venue?.floors) ? venue.floors : [];
    w.floor.innerHTML = floors.length
      ? floors.map((floor) => `<option value="${esc(floor.id)}">${esc(floor.name)}</option>`).join("")
      : '<option value="">该场馆没有楼层信息</option>';
    w.floor.value = String(defaultFloor(floors)?.id || "");
  }

  function renderWaitlistTasks() {
    if (!waitlistState.tasks.length) {
      w.list.innerHTML = '<div class="resv-empty">还没有自动预约任务。</div>';
      return;
    }
    w.list.innerHTML = waitlistState.tasks.map((task) => {
      const slotText = `${task.date || ""} ${minuteText(task.startMinute || 0)} - ${minuteText(task.endMinute || 0)}`;
      const range = Array.isArray(task.seatLabels) && task.seatLabels.length
        ? `指定 ${task.seatLabels.join("、")} 号优先`
        : `座位号 ${task.minLabel} - ${task.maxLabel}`;
      const tone = task.status === "success" ? "is-ok" : ["failed", "expired"].includes(task.status) ? "is-bad" : task.enabled ? "is-info" : "";
      const runAtMs = task.runAt ? Date.parse(task.runAt) : NaN;
      const waitingForRun = task.enabled && Number.isFinite(runAtMs) && Date.now() < runAtMs;
      const runText = Number.isFinite(runAtMs)
        ? new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        }).format(new Date(runAtMs)).replace(/\//g, "-")
        : `${task.runDate || ""} ${minuteText(task.runMinute || 0)}`.trim();
      const headBadge = waitingForRun
        ? `<span class="resv-badge is-info">等待 ${esc(runText)} 执行</span>`
        : `<span class="resv-badge ${tone}">${esc(task.statusText || task.status || "")}</span>`;
      const failure = ["failed", "unconfirmed"].includes(task.status) ? task.lastFailure : null;
      const failureDetails = failure ? [failure.message,
        failure.areaName && `阅览区：${failure.areaName}`,
        failure.seatLabel && `座位：${failure.seatLabel} 号`,
        failure.upstreamCode != null && `学校返回码：${failure.upstreamCode}`,
        failure.upstreamStatus != null && `HTTP 状态：${failure.upstreamStatus}`]
        .filter(Boolean).join(" · ") : "";
      return `<article class="resv-item" data-task="${esc(task.id)}">
        <div class="resv-item-head"><span class="resv-item-title">${esc(task.venueName || "")} ${esc(task.floorName || "")}</span>${headBadge}${task.enabled ? "" : '<span class="resv-badge">已停用</span>'}</div>
        <p class="resv-item-meta">${esc(slotText)} · ${esc(range)}</p>
        <p class="resv-item-meta">运行时间：${esc(runText)}${waitingForRun ? "（到点自动执行一次）" : ""}</p>
        <p class="resv-item-meta">最近结果：${esc(task.lastMessage || "尚未执行")}${task.lastSeatLabel ? `（座位 ${esc(task.lastSeatLabel)}）` : ""}${task.timings?.firstRequestDelayMs != null ? ` · 首发延迟 ${esc(task.timings.firstRequestDelayMs)} 毫秒` : ""}</p>
        ${failureDetails ? `<p class="resv-item-meta">最近异常：${esc(failureDetails)}</p>` : ""}
        <div class="resv-item-actions"><button class="ghost" type="button" data-task-toggle="${esc(task.id)}"${["success", "unconfirmed"].includes(task.status) ? " disabled" : ""}>${task.enabled ? "停用" : "启用"}</button><button class="ghost" type="button" data-task-delete="${esc(task.id)}">删除</button></div>
      </article>`;
    }).join("");
    w.list.querySelectorAll("[data-task-toggle]").forEach((button) => {
      button.addEventListener("click", () => toggleTask(button.dataset.taskToggle, button));
    });
    w.list.querySelectorAll("[data-task-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteTask(button.dataset.taskDelete, button));
    });
  }

  async function loadWaitlistTasks() {
    try {
      const payload = await api("/api/campus/library-seat/auto-tasks");
      waitlistState.tasks = Array.isArray(payload) ? payload : [];
      renderWaitlistTasks();
    } catch (error) {
      w.list.innerHTML = `<div class="resv-empty">${errorText(error)}</div>`;
    }
  }

  async function toggleTask(id, button) {
    const task = waitlistState.tasks.find((item) => String(item.id) === String(id));
    if (!task) return;
    button.disabled = true;
    try {
      await api(`/api/campus/library-seat/auto-tasks/${encodeURIComponent(id)}`, { method: "PUT", body: { enabled: !task.enabled } });
      await loadWaitlistTasks();
    } catch (error) {
      setStatus(w.status, errorText(error), "error");
      button.disabled = false;
    }
  }

  async function deleteTask(id, button) {
    const task = waitlistState.tasks.find((item) => String(item.id) === String(id));
    if (!window.confirm(`确定删除${task ? `「${task.venueName} ${task.floorName}」的` : "这条"}自动预约任务吗？`)) return;
    button.disabled = true;
    try {
      await api(`/api/campus/library-seat/auto-tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadWaitlistTasks();
    } catch (error) {
      setStatus(w.status, errorText(error), "error");
      button.disabled = false;
    }
  }

  function parseSeatLabels(value) {
    const text = String(value || "").trim();
    if (!text) return [];
    const labels = text.split(/[,，\s]+/).filter(Boolean).map((item) => Number(item));
    if (labels.some((label) => !Number.isInteger(label) || label < 1 || label > 999)) return null;
    return [...new Set(labels)];
  }

  w.venue.addEventListener("change", fillWaitlistFloors);
  w.venue.addEventListener("change", loadPreferredAreas);
  w.floor.addEventListener("change", loadPreferredAreas);
  w.start.addEventListener("change", loadPreferredAreas);
  w.duration.addEventListener("change", loadPreferredAreas);
  w.reload.addEventListener("click", loadWaitlistTasks);
  w.date.addEventListener("change", () => {
    // 换目标日期时运行日期跟回「前一天」，用户仍然可以手动改成别的日子。
    w.runDate.value = shiftDate(w.date.value, -1) || w.runDate.value;
    syncWaitlistOpenHint();
    loadPreferredAreas();
  });
  w.runDate.addEventListener("change", syncWaitlistOpenHint);
  w.runTime.addEventListener("change", syncWaitlistOpenHint);
  w.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const venue = shared.venues.find((item) => String(item.id) === String(w.venue.value));
    const floor = (venue?.floors || []).find((item) => String(item.id) === String(w.floor.value));
    if (!venue || !floor) {
      setStatus(w.status, "请选择场馆和楼层。", "error");
      return;
    }
    const labels = parseSeatLabels(w.labels.value);
    if (labels === null) {
      setStatus(w.status, "指定座位号需为 1 至 999 的整数，用逗号分隔。", "error");
      return;
    }
    const start = clampMinute(w.start.value);
    const end = Math.min(1440, start + Number(w.duration.value || 60));
    const runDate = w.runDate.value || shiftDate(w.date.value, -1);
    const runTime = w.runTime.value || "21:55";
    if (!runDate) {
      setStatus(w.status, "请选择任务运行日期。", "error");
      return;
    }
    if (runDate > w.date.value) {
      setStatus(w.status, "运行日期不能晚于预约目标日期。", "error");
      return;
    }
    const runParts = runTime.split(":");
    const runMinute = Number(runParts[0]) * 60 + Number(runParts[1]);
    if (!Number.isInteger(runMinute) || runMinute < 0 || runMinute > 1440) {
      setStatus(w.status, "任务运行时间格式不正确。", "error");
      return;
    }
    w.submit.disabled = true;
    setStatus(w.status, "正在创建自动预约任务...");
    try {
      await api("/api/campus/library-seat/auto-tasks", {
        method: "POST",
        body: {
          venueId: venue.id, venueName: venue.name, floorId: floor.id, floorName: floor.name,
          date: w.date.value, startMinute: start, endMinute: end,
          minLabel: Number(w.min.value) || 1, maxLabel: Number(w.max.value) || 45,
          seatLabels: labels, preferredAreaId: w.preferredArea.value, runDate, runMinute, enabled: w.enabled.checked
        }
      });
      setStatus(w.status, "自动预约任务已创建。", "ok");
      w.labels.value = "";
      await loadWaitlistTasks();
    } catch (error) {
      setStatus(w.status, errorText(error), "error");
    } finally {
      w.submit.disabled = false;
    }
  });

  async function initWaitlist() {
    if (waitlistState.loaded || waitlistState.loading) return;
    waitlistState.loading = true;
    w.venue.innerHTML = '<option value="">正在加载场馆...</option>';
    setStatus(w.status, "正在读取场馆配置...");
    try {
      await ensureOverview();
      waitlistState.loaded = true;
      fillWaitlistSelects();
      setStatus(w.status, "");
      await loadWaitlistTasks();
    } catch (error) {
      setStatus(w.status, errorText(error), "error");
    } finally {
      waitlistState.loading = false;
    }
  }

  /* ------------------------------------------------------------------ 路由 */

  document.addEventListener("resv:activate", (event) => {
    if (event.detail?.view !== "seat") return;
    if (event.detail.tab === "query") initQuery();
    if (event.detail.tab === "records") initRecords();
    if (event.detail.tab === "waitlist") initWaitlist();
  });
  document.addEventListener("resv:refresh", (event) => {
    if (event.detail?.view !== "seat") return;
    if (event.detail.tab === "query") {
      if (queryState.area) selectArea(queryState.area.id);
      else if (queryState.loaded) runQuery();
    }
    if (event.detail.tab === "records") {
      loadCurrentUse();
      loadRecordTab(recordsState.tab, true);
    }
    if (event.detail.tab === "waitlist") loadWaitlistTasks();
  });
})();
