const TIME_ZONE = "Asia/Shanghai";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const CHAOXING_AUTO_SIGN_MAX_TIMES = 12;

function fail(message, code = "CHAOXING_AUTO_SIGN_INVALID") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  throw error;
}

function trimmed(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Fixed clock times are stored as Asia/Shanghai wall-clock values so they survive DST-free 中国时区 changes.
export function chaoxingAutoSignLocalTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function normalizeChaoxingAutoSignTimes(value) {
  if (!Array.isArray(value)) throw fail("请设置签到时刻。", "CHAOXING_AUTO_SIGN_TIMES_REQUIRED");
  const times = new Set();
  for (const entry of value) {
    const time = trimmed(entry, 5);
    if (!TIME_PATTERN.test(time)) throw fail("签到时刻格式不正确，请使用 24 小时制的 HH:MM。", "CHAOXING_AUTO_SIGN_TIME_INVALID");
    times.add(time);
  }
  if (!times.size) throw fail("请至少设置一个签到时刻。", "CHAOXING_AUTO_SIGN_TIMES_REQUIRED");
  if (times.size > CHAOXING_AUTO_SIGN_MAX_TIMES) throw fail(`签到时刻最多设置 ${CHAOXING_AUTO_SIGN_MAX_TIMES} 个。`, "CHAOXING_AUTO_SIGN_TIMES_LIMIT");
  return [...times].sort();
}

// Only measured client fixes are accepted; the schedule reuses a stored fix, so freshness is not re-checked here.
export function normalizeChaoxingAutoSignLocation(value) {
  if (!value || typeof value !== "object") throw fail("请先保存签到位置。", "CHAOXING_AUTO_SIGN_LOCATION_REQUIRED");
  const latitude = finiteNumber(value.latitude);
  const longitude = finiteNumber(value.longitude);
  const accuracy = finiteNumber(value.accuracy);
  const address = trimmed(value.address);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || latitude === 0 && longitude === 0) {
    throw fail("签到位置坐标无效，请重新定位后再保存。", "CHAOXING_AUTO_SIGN_LOCATION_INVALID");
  }
  if (accuracy === null || accuracy <= 0 || accuracy > 1000) {
    throw fail("签到位置精度不足，请重新定位后再保存。", "CHAOXING_AUTO_SIGN_LOCATION_INVALID");
  }
  if (!address) throw fail("未获取到签到位置地址，请重新定位后再保存。", "CHAOXING_AUTO_SIGN_LOCATION_INVALID");
  return { latitude, longitude, accuracy, address, coordinateSystem: "bd09ll", isMock: value.isMock === true };
}

// 未保存课程表示在全部课程中查找；保存后只读取该课程，不再遍历其它课程。
export function normalizeChaoxingAutoSignCourse(value) {
  if (value === null || value === undefined) return null;
  const courseId = value && typeof value === "object" ? trimmed(value.courseId, 20) : "";
  const classId = value && typeof value === "object" ? trimmed(value.classId, 20) : "";
  if (!/^\d{1,20}$/.test(courseId) || !/^\d{1,20}$/.test(classId)) {
    throw fail("签到课程信息无效，请重新选择课程。", "CHAOXING_AUTO_SIGN_COURSE_INVALID");
  }
  return { courseId, classId, name: trimmed(value.name, 120) };
}

export function chaoxingAutoSignRunKey(now = new Date()) {
  const current = chaoxingAutoSignLocalTime(now);
  return `${current.date}|${current.time}`;
}

export function chaoxingAutoSignRunPlan(row, now = new Date()) {
  const current = chaoxingAutoSignLocalTime(now);
  const runKey = `${current.date}|${current.time}`;
  const plan = { runKey, date: current.date, time: current.time };
  if (!row?.enabled) return { ...plan, state: "disabled" };
  const times = Array.isArray(row.times) ? row.times : [];
  if (!times.includes(current.time)) return { ...plan, state: "idle" };
  if (String(row.last_run_key || "") === runKey) return { ...plan, state: "done" };
  const lockUntil = Date.parse(row.run_lock_until || "");
  if (Number.isFinite(lockUntil) && lockUntil > now.getTime()) return { ...plan, state: "locked" };
  return { ...plan, state: "ready" };
}

export function chaoxingAutoSignPublic(row, { signProviderConnected = false } = {}) {
  const times = Array.isArray(row?.times) ? row.times.filter((time) => TIME_PATTERN.test(String(time))) : [];
  const location = row?.location;
  let course = null;
  try { course = normalizeChaoxingAutoSignCourse(row?.course); } catch { course = null; }
  return {
    enabled: Boolean(row?.enabled),
    times,
    course,
    location: location && typeof location === "object" ? {
      address: trimmed(location.address),
      latitude: finiteNumber(location.latitude),
      longitude: finiteNumber(location.longitude),
      accuracy: finiteNumber(location.accuracy),
      isMock: location.isMock === true
    } : null,
    lastResult: row?.last_result && typeof row.last_result === "object" ? row.last_result : null,
    lastRunAt: row?.last_run_at || null,
    notifyConfigured: Boolean(trimmed(row?.notify_app_id) || trimmed(row?.notify_wecom_id)),
    updatedAt: row?.updated_at || null,
    signProviderConnected: Boolean(signProviderConnected),
    timeZone: TIME_ZONE
  };
}

// 失败通知走通知服务：优先 App 通道（需要平台账号），缺少 App 收件人时退回企业微信直发。
export function buildChaoxingAutoSignFailure(result, { userId = "", runKey = "", appId = "", wecomId = "" } = {}) {
  const message = trimmed(result?.message, 300) || "定时签到未能完成。";
  const courseName = trimmed(result?.courseName, 120);
  const activityName = trimmed(result?.activityName, 120);
  const key = trimmed(`chaoxing-auto-sign-${userId}-${runKey}`, 190);
  const lines = ["【定时签到失败】"];
  if (courseName) lines.push(`课程：${courseName}`);
  if (activityName) lines.push(`活动：${activityName}`);
  lines.push(`原因：${message}`);
  if (!appId) {
    if (!wecomId) return null;
    return {
      kind: "legacy",
      payload: {
        msgType: "text",
        content: lines.join("\n"),
        target: { touser: wecomId },
        dedupeKey: key,
        dedupeWindowSeconds: 3600,
        maxAttempts: 4
      }
    };
  }
  const items = [];
  if (courseName) items.push({ key: "课程", value: courseName });
  if (activityName) items.push({ key: "活动", value: activityName });
  items.push({ key: "原因", value: message });
  return {
    kind: "canonical",
    payload: {
      idempotencyKey: key,
      audience: { users: [appId] },
      channels: wecomId ? ["app", "wecom"] : ["app"],
      priority: "high",
      category: "campus.chaoxing.auto-sign",
      content: {
        kind: "text",
        title: "定时签到失败",
        summary: [courseName, activityName].filter(Boolean).join(" · ") || message,
        blocks: [{ type: "keyValue", items }]
      },
      source: { service: "campus-service", entityType: "chaoxingAutoSign", entityId: key },
      actions: [{ id: "open-chaoxing", label: "查看学习通签到", deepLink: "mycontrol://open?destination=chaoxing" }],
      ...(wecomId ? { wecom: { touser: wecomId } } : {}),
      dedupeKey: key,
      dedupeWindowSeconds: 3600,
      maxAttempts: 4
    }
  };
}
