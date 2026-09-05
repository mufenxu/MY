const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const DEFAULT_MIN_LABEL = 1;
const DEFAULT_MAX_LABEL = 45;

export const LIBRARY_SEAT_WAITLIST_DEFAULT_MIN_LABEL = DEFAULT_MIN_LABEL;
export const LIBRARY_SEAT_WAITLIST_DEFAULT_MAX_LABEL = DEFAULT_MAX_LABEL;

function fail(message, code = "INVALID_LIBRARY_SEAT_WAITLIST") {
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

function validDate(value, label = "预约日期") {
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
    fail("指定座位号需为座位号数组。", "INVALID_LIBRARY_SEAT_WAITLIST_SEAT_LABELS");
  }
  const labels = value
    .map((item) => Number(item))
    .filter((label) => Number.isInteger(label));
  if (!labels.length || labels.some((label) => label < 1 || label > 999) || new Set(labels).size !== labels.length) {
    fail("指定座位号需为 1 至 999 的不重复整数。", "INVALID_LIBRARY_SEAT_WAITLIST_SEAT_LABELS");
  }
  return labels.sort((a, b) => a - b);
}

export function normalizeLibrarySeatWaitlistInput(input = {}) {
  const venueId = safeId(input.venueId ?? input.venue_id, "场馆", "INVALID_LIBRARY_SEAT_WAITLIST_VENUE");
  const floorId = safeId(input.floorId ?? input.floor_id, "楼层", "INVALID_LIBRARY_SEAT_WAITLIST_FLOOR");
  const venueName = safeName(input.venueName ?? input.venue_name ?? input.venue?.name, "场馆名称", 80);
  const floorName = safeName(input.floorName ?? input.floor_name ?? input.floor?.name, "楼层名称", 80);
  const date = validDate(input.date, "预约日期");
  const startMinute = minuteValue(
    input.startMinute ?? input.start_minute ?? input.beginMinute,
    "开始时间",
    "INVALID_LIBRARY_SEAT_WAITLIST_START"
  );
  const endMinute = minuteValue(
    input.endMinute ?? input.end_minute,
    "结束时间",
    "INVALID_LIBRARY_SEAT_WAITLIST_END"
  );
  if (endMinute <= startMinute) {
    fail("候补预约结束时间必须晚于开始时间。", "INVALID_LIBRARY_SEAT_WAITLIST_TIME_RANGE");
  }
  if (endMinute - startMinute > 240) {
    fail("座位候补时段不能超过 4 小时。", "INVALID_LIBRARY_SEAT_WAITLIST_DURATION");
  }
  const minLabel = labelValue(input.minLabel ?? input.min_label ?? input.minSeatNo, DEFAULT_MIN_LABEL, "最小座位号");
  const maxLabel = labelValue(input.maxLabel ?? input.max_label ?? input.maxSeatNo, DEFAULT_MAX_LABEL, "最大座位号");
  const seatLabels = seatLabelsValue(input.seatLabels ?? input.seat_labels);
  if (minLabel > maxLabel) {
    fail("最小座位号不能大于最大座位号。", "INVALID_LIBRARY_SEAT_WAITLIST_LABEL_RANGE");
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
    enabled: input.enabled !== false
  };
}

function beijingInstantMs(date, minute) {
  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(minute / 60);
  const minuteOfHour = minute % 60;
  return Date.UTC(year, month - 1, day, hour, minuteOfHour, 0, 0) - BEIJING_OFFSET_MS;
}

function taskWindow(task) {
  const date = stringValue(task?.date || task?.reservationDate);
  const startMinute = Number(task?.startMinute ?? task?.start_minute ?? task?.beginMinute);
  const endMinute = Number(task?.endMinute ?? task?.end_minute);
  if (!DATE_PATTERN.test(date)) return null;
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) return null;
  return {
    startMs: beijingInstantMs(date, startMinute),
    endMs: beijingInstantMs(date, endMinute)
  };
}

export function librarySeatWaitlistRunPlan(task, now = new Date()) {
  const enabled = Boolean(task?.enabled);
  const window = taskWindow(task);
  if (!enabled || !window) {
    return { due: false, active: false, expired: false, startMs: null, endMs: null };
  }
  const nowMs = now.getTime();
  return {
    due: nowMs < window.endMs,
    active: nowMs < window.endMs,
    expired: nowMs >= window.endMs,
    startMs: window.startMs,
    endMs: window.endMs
  };
}

export function librarySeatWaitlistNextScanDelay(tasks = [], now = new Date(), config = {}) {
  const fastMs = Math.max(1_000, Math.trunc(Number(config.fastMs) || 20_000));
  const mediumMs = Math.max(10_000, Math.trunc(Number(config.mediumMs) || 2 * 60_000));
  const slowMs = Math.max(60_000, Math.trunc(Number(config.slowMs) || 10 * 60_000));
  const hotWindowMs = Math.max(0, Math.trunc(Number(config.hotWindowMs) || 2 * 60 * 60 * 1000));
  const mediumWindowMs = Math.max(hotWindowMs, Math.trunc(Number(config.mediumWindowMs) || 24 * 60 * 60 * 1000));
  const nowMs = now.getTime();
  let delay = slowMs;
  const list = Array.isArray(tasks) ? tasks : [];
  for (const task of list) {
    const plan = librarySeatWaitlistRunPlan(task, now);
    if (!plan.due) continue;
    const beforeStartMs = plan.startMs - nowMs;
    const afterStartMs = nowMs - plan.startMs;
    let tier = slowMs;
    if (beforeStartMs <= hotWindowMs || (afterStartMs >= 0 && afterStartMs <= hotWindowMs)) {
      tier = fastMs;
    } else if (beforeStartMs <= mediumWindowMs || afterStartMs >= 0) {
      tier = mediumMs;
    }
    delay = Math.min(delay, tier);
  }
  return delay;
}

export function pickLibrarySeatWaitlistFreeSeat(
  seats = [],
  minLabel = DEFAULT_MIN_LABEL,
  maxLabel = DEFAULT_MAX_LABEL,
  selectedLabels = []
) {
  const rows = Array.isArray(seats) ? seats : [];
  const labels = new Set(Array.isArray(selectedLabels) ? selectedLabels : []);
  const candidates = rows.filter((seat) => {
    if (!seat || seat.isFree !== true) return false;
    const label = Number(seat.label);
    return Number.isInteger(label) && label >= minLabel && label <= maxLabel && (!labels.size || labels.has(label));
  });
  candidates.sort((a, b) => Number(a.label) - Number(b.label));
  return candidates[0] || null;
}

function areaList(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.areas) ? payload.areas : [];
}

export async function scanLibrarySeatWaitlist({
  task,
  client,
  now = new Date(),
  maxAreasPerScan = 5,
  maxAttemptsPerScan = 3
} = {}) {
  const plan = librarySeatWaitlistRunPlan(task, now);
  if (!plan.due) return { status: plan.expired ? "expired" : "inactive" };

  const areasPayload = await client.listAreas({
    venueId: task.venueId,
    date: task.date,
    startMinute: task.startMinute,
    endMinute: task.endMinute,
    floorId: task.floorId,
    currentPage: 1,
    pageSize: 50
  });
  const candidates = areaList(areasPayload)
    .filter((area) => Number(area?.seatFree) > 0)
    .slice(0, Math.max(1, Math.trunc(maxAreasPerScan) || 1));

  if (!candidates.length) {
    return { status: "listening", message: "所选范围暂无释放座位，继续监听。" };
  }

  let attempts = 0;
  let lastConflictMessage = null;
  const attemptLimit = Math.max(1, Math.trunc(maxAttemptsPerScan) || 1);
  for (const area of candidates) {
    if (attempts >= attemptLimit) break;
    const seats = await client.getSeats({
      roomId: area.id,
      date: task.date,
      startMinute: task.startMinute,
      endMinute: task.endMinute,
      amPm: 0
    });
    const freeSeat = pickLibrarySeatWaitlistFreeSeat(
      seats,
      task.minLabel,
      task.maxLabel,
      task.seatLabels ?? task.seat_labels
    );
    if (!freeSeat) continue;
    try {
      await client.submitReservation({
        seatId: freeSeat.id,
        date: task.date,
        startMinute: task.startMinute,
        endMinute: task.endMinute
      });
      return {
        status: "success",
        message: "已自动预约成功。",
        seat: {
          areaId: area.id,
          areaName: stringValue(area.name, "阅览区"),
          seatId: freeSeat.id,
          seatLabel: stringValue(freeSeat.label, freeSeat.id)
        }
      };
    } catch (error) {
      attempts += 1;
      if (error?.status === 409) {
        lastConflictMessage = error.message || "所选座位刚被他人预约，继续监听其他座位。";
        continue;
      }
      throw error;
    }
  }
  return {
    status: "listening",
    message: lastConflictMessage || "所选范围暂无可预约座位，继续监听。"
  };
}

export function librarySeatWaitlistTimes(startMinute, endMinute) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    startTime: `${pad(Math.floor(startMinute / 60))}:${pad(startMinute % 60)}`,
    endTime: `${pad(Math.floor(endMinute / 60))}:${pad(endMinute % 60)}`
  };
}
