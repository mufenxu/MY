const TIME_ZONE = "Asia/Shanghai";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const BOOKABLE_START_MINUTE = 8 * 60;
const BOOKABLE_END_MINUTE = 21 * 60 + 45;
const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function fail(message, code = "INVALID_AUTO_RESERVATION_TASK") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  throw error;
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function utcDay(value) {
  const date = String(value || "").trim();
  if (!DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return formatUtcDate(parsed) === date ? parsed : null;
}

function dateDelta(date, baseDate) {
  const target = utcDay(date);
  const base = utcDay(baseDate);
  if (!target || !base) return null;
  return Math.round((target.getTime() - base.getTime()) / DAY_MS);
}

function addDays(date, days) {
  const base = utcDay(date);
  if (!base) return null;
  return formatUtcDate(new Date(base.getTime() + days * DAY_MS));
}

function parseDate(value, label) {
  const date = String(value || "").trim();
  if (!utcDay(date)) {
    fail(`${label}格式不正确。`);
  }
  return date;
}

function parseOptionalDate(value, label) {
  const date = String(value || "").trim();
  return date ? parseDate(date, label) : null;
}

function parseTime(value, label) {
  const time = String(value || "").trim();
  if (!TIME_PATTERN.test(time)) fail(`${label}格式不正确。`);
  return time;
}

function timeMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function cloneCandidate(candidate) {
  return {
    areaId: Number(candidate.areaId ?? candidate.area_id),
    startTime: String(candidate.startTime ?? candidate.start_time ?? "").trim(),
    endTime: String(candidate.endTime ?? candidate.end_time ?? "").trim()
  };
}

export function normalizeAutoReservationTaskInput(input = {}) {
  const name = String(input.name || "").trim();
  const enabled = input.enabled !== false;
  const reservationDate = parseDate(input.reservationDate ?? input.reservation_date ?? input.startDate ?? input.start_date, "预约日期");
  const executeDate = parseOptionalDate(input.executeDate ?? input.execute_date ?? input.runDate ?? input.run_date, "运行日期");
  const executeTime = parseTime(input.executeTime ?? input.execute_time, "开始预约时间");
  const candidates = Array.isArray(input.candidates) ? input.candidates.map(cloneCandidate) : [];
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  const mobile = String(input.mobile || input.phone || "").trim();

  if (executeDate) {
    const executeDelta = dateDelta(reservationDate, executeDate);
    if (!Number.isInteger(executeDelta) || executeDelta < 0 || executeDelta > 3) {
      fail("运行日期必须在预约目标日期前 3 天至预约当天内。", "AUTO_RESERVATION_EXECUTE_DATE_OUT_OF_RANGE");
    }
  }
  if (!name || name.length > 80) fail("任务名称不能为空且不能超过 80 个字符。", "INVALID_AUTO_RESERVATION_NAME");
  if (!candidates.length || candidates.length > 20) fail("至少设置一个候选空间和时段，最多 20 个。", "AUTO_RESERVATION_CANDIDATES_REQUIRED");
  candidates.forEach((candidate) => {
    if (!Number.isInteger(candidate.areaId) || candidate.areaId <= 0) fail("候选预约空间不正确。", "INVALID_RESERVATION_SPACE");
    parseTime(candidate.startTime, "候选开始时间");
    parseTime(candidate.endTime, "候选结束时间");
    if (timeMinutes(candidate.startTime) < BOOKABLE_START_MINUTE || timeMinutes(candidate.endTime) > BOOKABLE_END_MINUTE) {
      fail("候选可预约时间为 08:00 至 21:45。", "AUTO_RESERVATION_TIME_OUT_OF_RANGE");
    }
    const duration = timeMinutes(candidate.endTime) - timeMinutes(candidate.startTime);
    if (duration < 60 || duration > 240) fail("候选预约时长需为 1 至 4 小时。", "INVALID_RESERVATION_DURATION");
  });
  if (!title || title.length > 80) fail("申请主题不能为空且不能超过 80 个字符。", "RESERVATION_TITLE_REQUIRED");
  if (!content || content.length > 500) fail("申请内容不能为空且不能超过 500 个字符。", "RESERVATION_CONTENT_REQUIRED");
  if (!/^\d{11}$/.test(mobile)) fail("联系电话格式不正确。", "INVALID_RESERVATION_MOBILE");

  return {
    name,
    enabled,
    reservationDate,
    executeDate,
    executeTime,
    candidates,
    title,
    content,
    mobile,
    open: Boolean(input.open)
  };
}

function localParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(now).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday
  };
}

export function isAutoReservationDue(task, now = new Date()) {
  return autoReservationRunPlan(task, now).due;
}

function taskTargetDate(task) {
  return String(task?.reservationDate || task?.startDate || "").trim();
}

function taskExecuteDate(task, currentDate, targetDate) {
  const configured = String(task?.executeDate ?? task?.execute_date ?? task?.runDate ?? task?.run_date ?? "").trim();
  if (configured) return configured;
  const targetDelta = dateDelta(targetDate, currentDate);
  if (Number.isInteger(targetDelta) && targetDelta >= 0 && targetDelta <= 3) return currentDate;
  return addDays(targetDate, -3) || "";
}

function taskExecuteTime(task) {
  return String(task?.executeTime ?? task?.execute_time ?? "").trim();
}

function beijingDateTimeMs(date, time) {
  if (!utcDay(date) || !TIME_PATTERN.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - BEIJING_OFFSET_MS;
}

export function autoReservationRunPlan(task, now = new Date()) {
  const current = localParts(now);
  const targetDate = taskTargetDate(task);
  const executeTime = taskExecuteTime(task);
  const executeDate = taskExecuteDate(task, current.date, targetDate);
  const targetDelta = dateDelta(targetDate, current.date);
  const executeDelta = dateDelta(targetDate, executeDate);
  const validTarget = Boolean(utcDay(targetDate));
  const validExecuteDate = Boolean(utcDay(executeDate));
  const validExecuteTime = TIME_PATTERN.test(executeTime);
  let state = "invalid";
  let reason = "任务配置不正确，无法自动预约。";

  if (!validTarget) {
    reason = "预约目标日期格式不正确。";
  } else if (!validExecuteDate) {
    reason = "任务运行日期格式不正确。";
  } else if (!validExecuteTime) {
    reason = "任务运行时间格式不正确。";
  } else if (!Number.isInteger(executeDelta) || executeDelta < 0 || executeDelta > 3) {
    reason = "任务运行日期不在预约目标日期前 3 天至预约当天内。";
  } else if (Number.isInteger(targetDelta) && targetDelta < 0) {
    state = "expired";
    reason = "预约目标日期已过期。";
  } else if (
    Number.isInteger(targetDelta)
    && targetDelta >= 0
    && targetDelta <= 3
    && `${current.date}T${current.time}` >= `${executeDate}T${executeTime}`
  ) {
    state = "ready";
    reason = null;
  } else if (Number.isInteger(targetDelta) && targetDelta > 3) {
    state = "waiting";
    reason = null;
  } else if (`${current.date}T${current.time}` < `${executeDate}T${executeTime}`) {
    state = "waiting";
    reason = null;
  }

  const runAtMs = validExecuteDate && validExecuteTime
    ? beijingDateTimeMs(executeDate, executeTime)
    : null;
  return {
    due: Boolean(task?.enabled) && state === "ready",
    state,
    reason,
    targetDate: targetDate || null,
    executeDate: executeDate || null,
    executeTime: executeTime || null,
    nextRunAt: state === "waiting" && Number.isFinite(runAtMs) ? new Date(runAtMs).toISOString() : null,
    runKey: targetDate && executeDate && executeTime ? `${targetDate}:${executeDate}T${executeTime}` : null
  };
}

export function autoReservationNextScanDelay(tasks = [], now = new Date(), { fallbackMs = 15_000 } = {}) {
  const fallbackDelay = Math.max(1, Math.trunc(Number(fallbackMs) || 15_000));
  const list = Array.isArray(tasks) ? tasks : [];
  const nowMs = now.getTime();
  let delay = fallbackDelay;

  for (const task of list) {
    const plan = autoReservationRunPlan(task, now);
    if (plan.due) return 0;
    if (!task?.enabled || !plan.targetDate || !plan.executeDate || !TIME_PATTERN.test(plan.executeTime || "")) continue;
    const executeDelta = dateDelta(plan.targetDate, plan.executeDate);
    if (!Number.isInteger(executeDelta) || executeDelta < 0 || executeDelta > 3) continue;
    const runAtMs = beijingDateTimeMs(plan.executeDate, plan.executeTime);
    if (!Number.isFinite(runAtMs) || runAtMs <= nowMs) continue;
    delay = Math.min(delay, runAtMs - nowMs);
  }

  return Math.max(0, Math.trunc(delay));
}

export const LIBROOM_AUTO_RESERVATION_PREWARM_MS = 45_000;
export const LIBROOM_AUTO_RESERVATION_RETRY_WINDOW_MS = 30_000;

export function autoReservationRunAtMs(task, now = new Date()) {
  const plan = autoReservationRunPlan(task, now);
  return ["waiting", "ready"].includes(plan.state)
    ? beijingDateTimeMs(plan.executeDate, plan.executeTime) : null;
}

function isConflictError(error) {
  return Number(error?.status) === 409
    || (error?.code === "LIBROOM_UPSTREAM_REJECTED" && Number(error?.status) === 409);
}

function isAuthReservationError(error) {
  return [401, 403].includes(Number(error?.status));
}

function isTransientReservationError(error) {
  if (error?.code === "LIBROOM_UPSTREAM_REJECTED") return false;
  const status = Number(error?.status);
  return ["LIBROOM_NOT_OPEN", "LIBROOM_BUSY", "LIBROOM_RATE_LIMITED", "UPSTREAM_CAPACITY_EXCEEDED"].includes(error?.code)
    || status === 429 || !Number.isFinite(status) || status >= 500;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export async function executeAutoReservationCandidates({
  task,
  date,
  submitReservation,
  maxTransientAttempts = 2,
  transientRetryDelayMs = 500,
  deadlineMs = Infinity,
  maxAttempts = 40,
  shouldContinue = async () => true,
  verifyReservation
}) {
  const attempts = [];
  for (let index = 0; index < task.candidates.length; index += 1) {
    const candidate = task.candidates[index];
    const transientLimit = Math.max(1, Math.trunc(Number(maxTransientAttempts) || 2));
    for (let attempt = 1; attempt <= transientLimit; attempt += 1) {
      if (!await shouldContinue()) return { status: "stopped", candidateIndex: index, message: "任务已停用或修改，已停止后续提交。", attempts };
      if (Date.now() >= deadlineMs || attempts.length >= maxAttempts) {
        return { status: "failed", candidateIndex: index, message: "快速尝试窗口内未能预约成功。", attempts };
      }
      const input = {
        areaId: candidate.areaId, date, startTime: candidate.startTime, endTime: candidate.endTime,
        title: task.title, content: task.content, mobile: task.mobile, open: task.open
      };
      const startedAtMs = Date.now();
      let requestedAt = null;
      let responseAt = null;
      const attemptTimings = () => ({
        startedAt: new Date(startedAtMs).toISOString(),
        requestedAt,
        responseAt,
        finishedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAtMs),
        requestDurationMs: requestedAt && responseAt ? Math.max(0, Date.parse(responseAt) - Date.parse(requestedAt)) : null
      });
      try {
        const result = await submitReservation(input, {
          onDispatch: () => { requestedAt ||= new Date().toISOString(); },
          onResponse: () => { responseAt ||= new Date().toISOString(); }
        });
        attempts.push({ candidateIndex: index, status: "succeeded", attempt, transient: false, message: null, ...attemptTimings() });
        return { status: "succeeded", candidateIndex: index, result, attempts };
      } catch (error) {
        const unknown = Boolean(error.libroomSubmissionUnknown);
        const conflict = !unknown && isConflictError(error);
        const transient = !conflict && isTransientReservationError(error);
        attempts.push({
          candidateIndex: index,
          status: "failed",
          conflict,
          transient,
          ...(unknown ? { uncertain: true } : {}),
          attempt,
          code: error.code || null,
          errorStatus: Number.isFinite(Number(error.status)) ? Number(error.status) : null,
          message: error.message || "预约失败。",
          ...attemptTimings()
        });
        if (error.code === "LIBROOM_TASK_STOPPED") return { status: "stopped", candidateIndex: index, message: error.message, attempts };
        if (unknown) {
          const confirmed = typeof verifyReservation === "function"
            ? await verifyReservation(input).catch(() => null) : null;
          if (confirmed) return { status: "succeeded", candidateIndex: index, result: confirmed, attempts,
            message: "已从学校预约记录确认成功。" };
          return { status: "unconfirmed", candidateIndex: index,
            message: "提交结果仍待学校确认，请查看我的预约，任务已停止重复提交。", attempts };
        }
        if (!conflict && !transient) {
          if (isAuthReservationError(error)) {
            return {
              status: "auth_required",
              candidateIndex: index,
              message: error.message || "预约失败。",
              attempts
            };
          }
          return { status: "failed", candidateIndex: index, message: error.message || "预约失败。", attempts };
        }
        if (conflict) break;
        if (transient && attempt < transientLimit) {
          const baseDelay = Math.max(0, Number(transientRetryDelayMs) || 0);
          const quickDelay = attempt <= 3 ? Math.min(baseDelay, 200) : baseDelay;
          const jitter = baseDelay > 0 ? Math.floor(Math.random() * 51) : 0;
          const delay = Math.max(quickDelay + jitter, Number(error?.details?.retryAfterMs) || 0, error.status === 429 ? 1000 : 0);
          attempts.at(-1).retryDelayMs = delay;
          if (Date.now() + delay >= deadlineMs) return { status: "failed", candidateIndex: index,
            message: "学校要求的重试等待已超过快速尝试窗口。", attempts };
          await wait(delay);
        }
        if (attempt === transientLimit) return { status: "failed", candidateIndex: index, message: error.message || "预约失败。", attempts };
      }
    }
  }
  return {
    status: "failed",
    candidateIndex: -1,
    message: "所有候选空间和时段均不可预约。",
    attempts
  };
}

export function localDateForTimeZone(now = new Date()) {
  return localParts(now).date;
}
