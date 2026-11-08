import { mapWithConcurrency } from "./bounded-concurrency.js";

/**
 * 图书馆座位「自动预约任务」：定点执行型。
 *
 * 与候补任务的区别（两者是不同功能，别混）：
 * - 自动预约任务：到用户设定的运行时刻（默认 21:55）启动短时快速尝试，
 *   抢到即成功；快速尝试窗口结束即停止。
 * - 候补任务：进入时段就持续监听，有人退座就抢，直到时段结束。
 *
 * 选座优先级（由高到低）：
 *   指定座位 → 指定座位的相邻号 → 座位号范围内（默认 1-45）→ 整个阅览区任意空位。
 */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const DEFAULT_MIN_LABEL = 1;
const DEFAULT_MAX_LABEL = 45;
const NEIGHBOUR_RADIUS = 20;

export const LIBRARY_SEAT_AUTO_TASK_DEFAULT_MIN_LABEL = DEFAULT_MIN_LABEL;
export const LIBRARY_SEAT_AUTO_TASK_DEFAULT_MAX_LABEL = DEFAULT_MAX_LABEL;

// 学校在「目标日前一天 21:55」放出次日座位，默认就按这个时刻跑。
export const LIBRARY_SEAT_AUTO_TASK_DEFAULT_RUN_MINUTE = 21 * 60 + 55;

export const LIBRARY_SEAT_AUTO_TASK_PREWARM_MS = 45_000;
export const LIBRARY_SEAT_AUTO_TASK_RETRY_INTERVAL_MS = 750;
export const LIBRARY_SEAT_AUTO_TASK_RETRY_WINDOW_MS = 60_000;

function fail(message, code = "INVALID_LIBRARY_SEAT_AUTO_TASK") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  throw error;
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function validDate(value, label) {
  const date = stringValue(value);
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    fail(`${label}格式不正确。`);
  }
  return date;
}

function safeId(value, label, code) {
  const id = stringValue(value);
  if (!id || !SAFE_ID.test(id)) fail(`${label}不正确。`, code);
  return id;
}

function safeName(value, label, maxLength) {
  const name = stringValue(value);
  if (!name || name.length > maxLength) fail(`${label}不能为空且不能超过 ${maxLength} 个字符。`);
  return name;
}

function minuteValue(value, label, code) {
  const minute = Number(value);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    fail(`${label}不正确。`, code);
  }
  return minute;
}

function labelValue(value, fallback, label) {
  const parsed = value === undefined || value === null || value === ""
    ? fallback
    : Number.isInteger(value) ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
    fail(`${label}需为 1 至 999 的整数。`);
  }
  return parsed;
}

function seatLabelsValue(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fail("指定座位号需为座位号数组。", "INVALID_LIBRARY_SEAT_AUTO_TASK_SEAT_LABELS");
  }
  const labels = value.map((item) => Number(item));
  if (labels.some((label) => !Number.isInteger(label) || label < 1 || label > 999) || new Set(labels).size !== labels.length) {
    fail("指定座位号需为 1 至 999 的不重复整数。", "INVALID_LIBRARY_SEAT_AUTO_TASK_SEAT_LABELS");
  }
  return labels;
}

function beijingInstantMs(date, minute) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60, 0, 0) - BEIJING_OFFSET_MS;
}

export function normalizeLibrarySeatAutoTaskInput(input = {}) {
  const venueId = safeId(input.venueId ?? input.venue_id, "场馆", "INVALID_LIBRARY_SEAT_AUTO_TASK_VENUE");
  const floorId = safeId(input.floorId ?? input.floor_id, "楼层", "INVALID_LIBRARY_SEAT_AUTO_TASK_FLOOR");
  const venueName = safeName(input.venueName ?? input.venue_name ?? input.venue?.name, "场馆名称", 80);
  const floorName = safeName(input.floorName ?? input.floor_name ?? input.floor?.name, "楼层名称", 80);
  const date = validDate(input.date ?? input.reservationDate, "预约目标日期");
  const startMinute = minuteValue(
    input.startMinute ?? input.start_minute ?? input.beginMinute,
    "开始时间",
    "INVALID_LIBRARY_SEAT_AUTO_TASK_START"
  );
  const endMinute = minuteValue(
    input.endMinute ?? input.end_minute,
    "结束时间",
    "INVALID_LIBRARY_SEAT_AUTO_TASK_END"
  );
  if (endMinute <= startMinute) {
    fail("结束时间必须晚于开始时间。", "INVALID_LIBRARY_SEAT_AUTO_TASK_TIME_RANGE");
  }
  if (endMinute - startMinute > 240) {
    fail("自动预约的座位时段不能超过 4 小时。", "INVALID_LIBRARY_SEAT_AUTO_TASK_DURATION");
  }
  const minLabel = labelValue(input.minLabel ?? input.min_label ?? input.minSeatNo, DEFAULT_MIN_LABEL, "最小座位号");
  const maxLabel = labelValue(input.maxLabel ?? input.max_label ?? input.maxSeatNo, DEFAULT_MAX_LABEL, "最大座位号");
  if (minLabel > maxLabel) {
    fail("最小座位号不能大于最大座位号。", "INVALID_LIBRARY_SEAT_AUTO_TASK_LABEL_RANGE");
  }
  const seatLabels = seatLabelsValue(input.seatLabels ?? input.seat_labels);
  const preferredAreaId = stringValue(input.preferredAreaId ?? input.preferred_area_id);
  if (preferredAreaId) safeId(preferredAreaId, "优先阅览区", "INVALID_LIBRARY_SEAT_AUTO_TASK_AREA");
  // 默认「目标日期的前一天」，也就是学校放号那一天。
  const runDate = validDate(
    input.runDate ?? input.run_date ?? previousDate(date),
    "运行日期"
  );
  const runMinute = minuteValue(
    input.runMinute ?? input.run_minute ?? LIBRARY_SEAT_AUTO_TASK_DEFAULT_RUN_MINUTE,
    "运行时间",
    "INVALID_LIBRARY_SEAT_AUTO_TASK_RUN_MINUTE"
  );
  if (runDate > date) {
    fail("运行日期不能晚于预约目标日期。", "INVALID_LIBRARY_SEAT_AUTO_TASK_RUN_DATE");
  }
  return {
    venueId,
    floorId,
    venueName,
    floorName,
    date,
    startMinute,
    endMinute,
    minLabel,
    maxLabel,
    seatLabels,
    preferredAreaId,
    runDate,
    runMinute,
    enabled: input.enabled !== false
  };
}

export function previousDate(date) {
  const text = stringValue(date);
  if (!DATE_PATTERN.test(text)) return "";
  const base = Date.parse(`${text}T00:00:00+08:00`);
  if (Number.isNaN(base)) return "";
  return new Date(base - 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

/** 任务运行时刻（北京时间）。 */
export function librarySeatAutoTaskRunAtMs(task) {
  const date = stringValue(task?.runDate ?? task?.run_date);
  const minute = Number(task?.runMinute ?? task?.run_minute ?? LIBRARY_SEAT_AUTO_TASK_DEFAULT_RUN_MINUTE);
  if (!DATE_PATTERN.test(date) || !Number.isInteger(minute)) return null;
  const at = beijingInstantMs(date, minute);
  return Number.isFinite(at) ? at : null;
}

function taskWindow(task) {
  const date = stringValue(task?.date ?? task?.reservationDate);
  const startMinute = Number(task?.startMinute ?? task?.start_minute);
  const endMinute = Number(task?.endMinute ?? task?.end_minute);
  if (!DATE_PATTERN.test(date)) return null;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) return null;
  return {
    startMs: beijingInstantMs(date, startMinute),
    endMs: beijingInstantMs(date, endMinute)
  };
}

/**
 * 执行计划：
 * - waiting：还没到运行时刻，静默等待
 * - due：已到运行时刻且目标时段未结束，可以扫
 * - expired：目标时段已结束，没机会了
 */
export function librarySeatAutoTaskRunPlan(task, now = new Date()) {
  const window = taskWindow(task);
  const runAtMs = librarySeatAutoTaskRunAtMs(task);
  const plan = { waiting: false, due: false, expired: false, runAtMs, startMs: null, endMs: null };
  if (!window) return plan;
  plan.startMs = window.startMs;
  plan.endMs = window.endMs;
  if (!task?.enabled || runAtMs === null) return plan;
  const nowMs = now.getTime();
  plan.waiting = nowMs < runAtMs;
  plan.expired = nowMs >= window.endMs;
  plan.due = !plan.waiting && !plan.expired;
  return plan;
}

export function librarySeatAutoTaskNextRunDelay(tasks = [], now = new Date(), config = {}) {
  const slowMs = Math.max(60_000, Math.trunc(Number(config.slowMs) || 10 * 60_000));
  const activeMs = Math.max(250, Math.trunc(Number(config.activeMs) || LIBRARY_SEAT_AUTO_TASK_RETRY_INTERVAL_MS));
  const nowMs = now.getTime();
  let delay = slowMs;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const plan = librarySeatAutoTaskRunPlan(task, now);
    if (plan.waiting && plan.runAtMs !== null) {
      const untilRunMs = plan.runAtMs - nowMs;
      if (untilRunMs <= slowMs) delay = Math.min(delay, Math.max(1, untilRunMs));
      continue;
    }
    if (!plan.due) continue;
    delay = Math.min(delay, activeMs);
  }
  return delay;
}

/**
 * 分层选座：指定座位 → 相邻号 → 号码范围内 → 整个阅览区。
 * 返回 { seat, tier, label }，tier 用于告诉用户这一个是「怎么选中」的。
 */
export function pickLibrarySeatAutoTaskSeat(seats = [], options = {}) {
  const minLabel = Number(options.minLabel ?? options.min_label ?? DEFAULT_MIN_LABEL);
  const maxLabel = Number(options.maxLabel ?? options.max_label ?? DEFAULT_MAX_LABEL);
  const wanted = (Array.isArray(options.seatLabels ?? options.seat_labels)
    ? (options.seatLabels ?? options.seat_labels)
    : []).map(Number).filter((label) => Number.isInteger(label));

  const byLabel = new Map();
  for (const seat of Array.isArray(seats) ? seats : []) {
    if (!seat || seat.isFree !== true) continue;
    const label = Number(seat.label);
    if (!Number.isInteger(label) || byLabel.has(label)) continue;
    byLabel.set(label, seat);
  }
  if (!byLabel.size) return null;

  for (const label of wanted) {
    const seat = byLabel.get(label);
    if (seat) return { seat, tier: "preferred", label };
  }

  if (wanted.length) {
    const neighbours = [];
    for (const label of wanted) {
      for (let delta = 1; delta <= NEIGHBOUR_RADIUS; delta += 1) {
        neighbours.push({ label: label + delta, delta });
        neighbours.push({ label: label - delta, delta });
      }
    }
    neighbours.sort((a, b) => a.delta - b.delta || b.label - a.label);
    for (const item of neighbours) {
      const seat = byLabel.get(item.label);
      if (seat) return { seat, tier: "neighbour", label: item.label };
    }
  }

  const inRange = [...byLabel.values()]
    .filter((seat) => {
      const label = Number(seat.label);
      return label >= minLabel && label <= maxLabel;
    })
    .sort((a, b) => Number(a.label) - Number(b.label));
  if (inRange.length) {
    return { seat: inRange[0], tier: "range", label: Number(inRange[0].label) };
  }

  const anywhere = [...byLabel.values()].sort((a, b) => Number(a.label) - Number(b.label));
  return { seat: anywhere[0], tier: "fallback", label: Number(anywhere[0].label) };
}

function areaList(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.areas) ? payload.areas : [];
}

export function librarySeatAutoTaskTierText(tier, label) {
  const suffix = Number.isInteger(label) ? `（${label} 号）` : "";
  if (tier === "preferred") return `已按你指定的座位预约成功${suffix}。`;
  if (tier === "neighbour") return `指定座位已被占用，改为相邻的座位${suffix}。`;
  if (tier === "range") return `指定范围外的座位被占用，按号码顺序选了${suffix}。`;
  return `所选号段已满，改约同阅览区的空位${suffix}。`;
}

export async function prepareLibrarySeatAutoTaskSeats({ task, client, topology = false, maxAreas = 50 } = {}) {
  const input = normalizeLibrarySeatAutoTaskInput(task);
  const payload = await client.listAreas({ venueId: input.venueId, floorId: input.floorId,
    date: input.date, startMinute: input.startMinute, endMinute: input.endMinute, currentPage: 1, pageSize: 50 });
  const areas = areaList(payload).filter((area) => area && (topology || Number(area.seatFree) > 0))
    .sort((a, b) => Number(b.seatFree) - Number(a.seatFree)).slice(0, maxAreas);
  const groups = await mapWithConcurrency(areas, 2, async (area) => {
    let seats;
    if (topology && typeof client.getSeatLayout === "function") {
      const layout = await client.getSeatLayout({ roomId: area.id, version: 0 });
      // 布局只提供座位身份，能否预约最终由提交接口判断。
      seats = (layout?.seats || []).map((seat) => ({ ...seat, isFree: true }));
    } else {
      const result = await client.getSeats({ roomId: area.id, date: input.date,
        startMinute: input.startMinute, endMinute: input.endMinute, amPm: 0, refresh: true });
      seats = Array.isArray(result) ? result : result?.seats || [];
    }
    const remaining = seats.filter((seat) => seat?.isFree === true);
    const candidates = [];
    const seatLabels = !input.preferredAreaId || input.preferredAreaId === String(area.id) ? input.seatLabels : [];
    while (remaining.length) {
      const picked = pickLibrarySeatAutoTaskSeat(remaining, { ...input, seatLabels });
      if (!picked) break;
      candidates.push({ seatId: picked.seat.id, seatLabel: String(picked.label), label: picked.label,
        areaId: area.id, areaName: stringValue(area.name, "阅览区"), tier: picked.tier });
      remaining.splice(remaining.indexOf(picked.seat), 1);
    }
    return candidates;
  });
  const tiers = { preferred: 0, neighbour: 1, range: 2, fallback: 3 };
  const candidates = groups.flat().sort((a, b) => {
    const tier = tiers[a.tier] - tiers[b.tier];
    if (tier) return tier;
    if (a.tier === "preferred") return input.seatLabels.indexOf(a.label) - input.seatLabels.indexOf(b.label);
    if (a.tier === "neighbour") {
      const distance = (seat) => Math.min(...input.seatLabels.map((label) => Math.abs(seat.label - label)));
      const delta = distance(a) - distance(b);
      if (delta) return delta;
    }
    const area = Number(b.areaId === input.preferredAreaId) - Number(a.areaId === input.preferredAreaId);
    return area || a.label - b.label;
  });
  return { candidates, blocked: new Set(), pending: null };
}

function successfulSeat(candidate) {
  return { status: "success", tier: candidate.tier,
    message: librarySeatAutoTaskTierText(candidate.tier, candidate.label), seat: candidate };
}

async function confirmPendingReservation(prepared, task, client) {
  const candidate = prepared.pending;
  if (!candidate) return null;
  try {
    const rows = await client.getMyReservations();
    const minute = (text) => {
      const match = String(text || "").match(/(?:^|\s)(\d{1,2}):(\d{2})/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const matched = (Array.isArray(rows) ? rows : []).find((row) => row.seatId === candidate.seatId
      && row.date === task.date && minute(row.startTime) === task.startMinute && minute(row.endTime) === task.endMinute
      && ["RESERVE", "CHECK_IN", "LEAVE"].includes(row.status));
    if (matched) { prepared.pending = null; return successfulSeat(candidate); }
  } catch {
    // 查询暂时失败或记录尚未同步时保留待确认状态，避免重复预约。
  }
  return { status: "confirming", message: "预约提交结果待确认，正在核对我的预约，暂不重复提交。" };
}

export async function scanLibrarySeatAutoTask({
  task,
  client,
  now = new Date(),
  prepared,
  onAttempt = () => {},
  shouldStop = () => false,
  maxAreasPerScan = 50,
  maxAttemptsPerScan = 3
} = {}) {
  const plan = librarySeatAutoTaskRunPlan(task, now);
  if (plan.waiting) return { status: "waiting", message: "还没到运行时间。" };
  if (!plan.due) return { status: plan.expired ? "expired" : "inactive" };

  task = normalizeLibrarySeatAutoTaskInput(task);
  if (await shouldStop()) return { status: "stopped", message: "任务已停止，已取消后续尝试。" };
  prepared ||= await prepareLibrarySeatAutoTaskSeats({ task, client, maxAreas: maxAreasPerScan });
  prepared.blocked ||= new Set();
  if (prepared.pending) return confirmPendingReservation(prepared, task, client);
  let attempts = 0;
  const attemptLimit = Math.max(1, Math.trunc(maxAttemptsPerScan) || 1);
  for (const candidate of prepared.candidates) {
    if (prepared.blocked.has(candidate.seatId)) continue;
    if (attempts >= attemptLimit) break;
    if (await shouldStop()) return { status: "stopped", message: "任务已停止，已取消后续尝试。" };
    attempts++;
    onAttempt(candidate);
    try {
      await client.submitReservation({
        seatId: candidate.seatId,
        date: task.date,
        startMinute: task.startMinute,
        endMinute: task.endMinute
      });
      return successfulSeat(candidate);
    } catch (error) {
      if (error?.code === "LIBRARY_SEAT_OCCUPIED" || (error?.status === 409 && !error.code)) {
        prepared.blocked.add(candidate.seatId);
        continue;
      }
      if (["LIBRARY_SEAT_NOT_OPEN", "LIBRARY_SEAT_BUSY", "LIBRARY_SEAT_RATE_LIMITED", "UPSTREAM_CAPACITY_EXCEEDED"].includes(error?.code)
        || error?.status === 429) {
        return { status: "retry", message: error.message,
          retryAfterMs: Math.max(Number(error?.details?.retryAfterMs) || 0, error.status === 429 ? 2_000 : 750) };
      }
      if (error?.status >= 500 || !error?.status || /TIMEOUT|NETWORK/.test(error.code || "")) {
        prepared.pending = candidate;
        return confirmPendingReservation(prepared, task, client);
      }
      throw error;
    }
  }

  return { status: attempts >= attemptLimit ? "retry" : "empty", message: "本轮候选座位暂未预约成功，继续检测。" };
}

export function librarySeatAutoTaskTimes(startMinute, endMinute) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    startTime: `${pad(Math.floor(startMinute / 60))}:${pad(startMinute % 60)}`,
    endTime: `${pad(Math.floor(endMinute / 60))}:${pad(endMinute % 60)}`
  };
}
