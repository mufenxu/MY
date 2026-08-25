const TIME_ZONE = "Asia/Shanghai";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(message, code = "INVALID_AUTO_RESERVATION_TASK") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  throw error;
}

function parseDate(value, label) {
  const date = String(value || "").trim();
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    fail(`${label}格式不正确。`);
  }
  return date;
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
  const executeTime = parseTime(input.executeTime ?? input.execute_time, "开始预约时间");
  const candidates = Array.isArray(input.candidates) ? input.candidates.map(cloneCandidate) : [];
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  const mobile = String(input.mobile || input.phone || "").trim();

  if (!name || name.length > 80) fail("任务名称不能为空且不能超过 80 个字符。", "INVALID_AUTO_RESERVATION_NAME");
  if (!candidates.length || candidates.length > 20) fail("至少设置一个候选空间和时段，最多 20 个。", "AUTO_RESERVATION_CANDIDATES_REQUIRED");
  candidates.forEach((candidate) => {
    if (!Number.isInteger(candidate.areaId) || candidate.areaId <= 0) fail("候选预约空间不正确。", "INVALID_RESERVATION_SPACE");
    parseTime(candidate.startTime, "候选开始时间");
    parseTime(candidate.endTime, "候选结束时间");
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
  if (!task?.enabled) return false;
  const current = localParts(now);
  const reservationDate = task.reservationDate || task.startDate;
  return current.date === reservationDate && current.time >= task.executeTime;
}

function isConflictError(error) {
  return Number(error?.status) === 409
    || (error?.code === "LIBROOM_UPSTREAM_REJECTED" && Number(error?.status) === 409);
}

export async function executeAutoReservationCandidates({ task, date, submitReservation }) {
  const attempts = [];
  for (let index = 0; index < task.candidates.length; index += 1) {
    const candidate = task.candidates[index];
    try {
      const result = await submitReservation({
        areaId: candidate.areaId,
        date,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        title: task.title,
        content: task.content,
        mobile: task.mobile,
        open: task.open
      });
      attempts.push({ candidateIndex: index, status: "succeeded" });
      return { status: "succeeded", candidateIndex: index, result, attempts };
    } catch (error) {
      attempts.push({ candidateIndex: index, status: "failed", conflict: isConflictError(error), message: error.message || "预约失败。" });
      if (!isConflictError(error)) {
        return { status: "failed", candidateIndex: index, message: error.message || "预约失败。", attempts };
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
