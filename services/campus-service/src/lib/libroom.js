import { HttpError } from "./http.js";
import { createDecipheriv } from "node:crypto";

export const LIBROOM_ORIGIN = "https://libroom.hgu.edu.cn";
// CAS registers the legacy HTTP service URL; transport is upgraded to HTTPS by
// the school URL policy after CAS returns the ticket.
export const LIBROOM_SERVICE_URL = "http://libroom.hgu.edu.cn/v4/login/cas";
const LIBROOM_CONFIG_IV = "ZZWBKJ_ZHIHUAWEI";
const AUTH_ERROR_CODES = new Set([401, 403, 10001, 10002, 10003]);
export const LIBROOM_BOOKABLE_START_MINUTE = 8 * 60;
export const LIBROOM_BOOKABLE_END_MINUTE = 21 * 60 + 45;
export const LIBROOM_DEFAULT_BOOKABLE_WINDOWS = Object.freeze([{ start: "08:00", end: "21:45" }]);
const LIBROOM_FREE_WINDOW_HINT = /free|available|idle|vacant|optional|可约|可预约|空闲|剩余/iu;
const LIBROOM_BUSY_WINDOW_HINT = /reserve|reservation|reserved|order|book|booking|occupied|occupy|used|apply|appointment|record|period|times?|list|占用|已约|预约|申请|记录|时段/iu;
const LIBROOM_BUSY_EXCLUDE_HINT = /free|available|idle|vacant|open|close|rule|config|setting|可约|可预约|空闲|开放|规则|配置/iu;
const LIBROOM_TIME_FIELD_KEYS = {
  start: ["startTime", "start_time", "start", "beginTime", "begin_time", "begin", "openTime", "open_time", "startMinute", "start_minute"],
  end: ["endTime", "end_time", "end", "closeTime", "close_time", "finishTime", "finish_time", "endMinute", "end_minute"]
};

function fail(status, message, code = "LIBROOM_REQUEST_FAILED", details = null) {
  throw new HttpError(status, message, details, code);
}

function parseTime(value) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(String(value || ""));
  if (!match) return null;
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function parseLooseTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value >= 0 && value <= 1440 ? value : null;
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value || "").trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1440 ? minutes : null;
}

function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function firstLooseTime(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of keys) {
    if (value[key] === undefined || value[key] === null) continue;
    const minutes = parseLooseTime(value[key]);
    if (minutes !== null) return minutes;
  }
  return null;
}

function normalizeTimeWindows(windows = []) {
  const normalized = windows.map((window) => {
    const start = parseLooseTime(window?.start ?? window?.startTime ?? window?.start_time);
    const end = parseLooseTime(window?.end ?? window?.endTime ?? window?.end_time);
    return start !== null && end !== null && end > start ? { start, end } : null;
  }).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const window of normalized) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  return merged.map((window) => ({ start: formatTime(window.start), end: formatTime(window.end) }));
}

function parseTimestampMinute(value, { roundEnd = false } = {}) {
  const match = /(?:^|\s)(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/.exec(String(value || "").trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 0 || minutes > 1440) return null;
  if (roundEnd && Number(match[3] || 0) > 0) return Math.min(1440, minutes + 1);
  return minutes;
}

function minutesWindow(start, end) {
  return start !== null && end !== null && end > start ? { start: formatTime(start), end: formatTime(end) } : null;
}

function officialAxisBaseWindows(info, fallback) {
  const start = parseTimestampMinute(info?.start_timestamp)
    ?? parseLooseTime(info?.start_num ?? info?.begin_num ?? info?.start_time ?? info?.startTime);
  const end = parseTimestampMinute(info?.end_timestamp, { roundEnd: true })
    ?? parseLooseTime(info?.end_num ?? info?.end_time ?? info?.endTime);
  const window = minutesWindow(start, end);
  return window ? [window] : fallback;
}

function officialAxisBusyWindow(period) {
  const start = parseTimestampMinute(period?.begin_timestamp ?? period?.start_timestamp)
    ?? parseLooseTime(period?.begin_num ?? period?.start_num ?? period?.start_time ?? period?.begin_time ?? period?.startTime);
  const end = parseTimestampMinute(period?.end_timestamp, { roundEnd: true })
    ?? parseLooseTime(period?.end_num ?? period?.end_time ?? period?.endTime);
  return minutesWindow(start, end);
}

function isTruthyFlag(value) {
  return value === true || value === 1 || String(value).trim().toLowerCase() === "1" || String(value).trim().toLowerCase() === "true";
}

function summarizeLibroomAxisAvailability(raw, { date = "", bookableWindows = LIBROOM_DEFAULT_BOOKABLE_WINDOWS } = {}) {
  const list = Array.isArray(raw?.axis?.list) ? raw.axis.list : null;
  if (!list) return null;

  const targetDate = String(date || "").trim();
  const entry = targetDate ? list.find((item) => String(item?.date || "") === targetDate) : (list.length === 1 ? list[0] : null);
  if (!entry) {
    return {
      freeWindows: [],
      busyWindows: [],
      source: "unrecognized",
      detail: targetDate
        ? "学校接口未返回目标日期的空间占用轴，请以官网查询结果为准。"
        : "学校接口返回多个日期的空间占用轴，但未指定目标日期，请以官网查询结果为准。",
      raw
    };
  }

  const info = entry.info && typeof entry.info === "object" ? entry.info : entry;
  const baseWindows = officialAxisBaseWindows(info, bookableWindows);
  const busyWindows = isTruthyFlag(info.fully_booked)
    ? normalizeTimeWindows(baseWindows)
    : normalizeTimeWindows((Array.isArray(info.list) ? info.list : []).map(officialAxisBusyWindow).filter(Boolean));

  return {
    freeWindows: subtractBusyWindows(baseWindows, busyWindows),
    busyWindows,
    source: "official-axis",
    detail: "根据学校接口返回的目标日期占用轴计算空闲时段。",
    raw
  };
}

function isOfficialSpaceListRecord(raw) {
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && (
    raw.id !== undefined
    || raw.areaId !== undefined
    || raw.area_id !== undefined
    || raw.name !== undefined
    || raw.nameMerge !== undefined
  ));
}

function officialPeriodDate(period) {
  const text = String(period?.begin_timestamp ?? period?.start_timestamp ?? period?.end_timestamp ?? "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})\s+/.exec(text);
  return match?.[1] || "";
}

function summarizeLibroomListAvailability(raw, { date = "", bookableWindows = LIBROOM_DEFAULT_BOOKABLE_WINDOWS } = {}) {
  const periods = Array.isArray(raw?.date) ? raw.date : null;
  if (!periods || !isOfficialSpaceListRecord(raw)) return null;

  const targetDate = String(date || "").trim();
  const periodObjects = periods.filter((period) => period && typeof period === "object" && !Array.isArray(period));
  if (periods.length > 0 && periodObjects.length === 0) return null;

  const baseWindows = officialAxisBaseWindows(raw, bookableWindows);
  const busyWindows = normalizeTimeWindows(periodObjects
    .filter((period) => {
      const periodDate = officialPeriodDate(period);
      return !targetDate || !periodDate || periodDate === targetDate;
    })
    .map(officialAxisBusyWindow)
    .filter(Boolean));

  return {
    freeWindows: subtractBusyWindows(baseWindows, busyWindows),
    busyWindows,
    source: "official-list-date",
    detail: "根据学校空间列表返回的占用时段计算空闲时段。",
    raw
  };
}

function collectAvailabilityWindows(value, path = "", result = { free: [], busy: [] }, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAvailabilityWindows(item, `${path}.${index}`, result, seen));
    return result;
  }

  const start = firstLooseTime(value, LIBROOM_TIME_FIELD_KEYS.start);
  const end = firstLooseTime(value, LIBROOM_TIME_FIELD_KEYS.end);
  if (start !== null && end !== null && end > start) {
    const text = path.toLowerCase();
    const window = { start: formatTime(start), end: formatTime(end) };
    if (LIBROOM_FREE_WINDOW_HINT.test(text)) {
      result.free.push(window);
    } else if (LIBROOM_BUSY_WINDOW_HINT.test(text) && !LIBROOM_BUSY_EXCLUDE_HINT.test(text)) {
      result.busy.push(window);
    }
  }

  for (const [key, item] of Object.entries(value)) {
    collectAvailabilityWindows(item, path ? `${path}.${key}` : key, result, seen);
  }
  return result;
}

function subtractBusyWindows(baseWindows, busyWindows) {
  let free = normalizeTimeWindows(baseWindows).map((window) => ({
    start: parseLooseTime(window.start),
    end: parseLooseTime(window.end)
  }));
  for (const busy of normalizeTimeWindows(busyWindows)) {
    const busyStart = parseLooseTime(busy.start);
    const busyEnd = parseLooseTime(busy.end);
    if (busyStart === null || busyEnd === null) continue;
    free = free.flatMap((window) => {
      if (busyEnd <= window.start || busyStart >= window.end) return [window];
      return [
        busyStart > window.start ? { start: window.start, end: busyStart } : null,
        busyEnd < window.end ? { start: busyEnd, end: window.end } : null
      ].filter(Boolean);
    });
  }
  return normalizeTimeWindows(free);
}

export function summarizeLibroomAvailability(raw, { bookableWindows = LIBROOM_DEFAULT_BOOKABLE_WINDOWS, date = "" } = {}) {
  const axisAvailability = summarizeLibroomAxisAvailability(raw, { date, bookableWindows });
  if (axisAvailability) return axisAvailability;

  const listAvailability = summarizeLibroomListAvailability(raw, { date, bookableWindows });
  if (listAvailability) return listAvailability;

  const collected = collectAvailabilityWindows(raw);
  const explicitFreeWindows = normalizeTimeWindows(collected.free);
  const busyWindows = normalizeTimeWindows(collected.busy);
  if (explicitFreeWindows.length) {
    return {
      freeWindows: explicitFreeWindows,
      busyWindows,
      source: "upstream-free",
      detail: "学校接口返回了可识别的空闲时段。",
      raw
    };
  }
  if (busyWindows.length) {
    return {
      freeWindows: subtractBusyWindows(bookableWindows, busyWindows),
      busyWindows,
      source: "derived-from-busy",
      detail: "根据学校接口返回的占用时段计算空闲时段。",
      raw
    };
  }
  return {
    freeWindows: [],
    busyWindows: [],
    source: "unrecognized",
    detail: "学校接口未返回可识别的空闲或占用时段，请以官网查询结果为准。",
    raw
  };
}

function localDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function libroomConfigKey(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now).replaceAll("-", "");
  return `${date}${date.split("").reverse().join("")}`;
}

export function decryptLibroomConfigPayload(value, { now = new Date() } = {}) {
  const encrypted = String(value || "");
  if (!encrypted) return null;
  try {
    const decipher = createDecipheriv("aes-128-cbc", Buffer.from(libroomConfigKey(now), "utf8"), Buffer.from(LIBROOM_CONFIG_IV, "utf8"));
    const decrypted = Buffer.concat([decipher.update(encrypted, "base64"), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function libroomCasLoginOptionsFromConfig(config = {}) {
  const casUrl = String(config?.cas_url || "");
  if (!casUrl) return { loginBaseUrl: `${new URL("/cas/login", "https://cas.hgu.edu.cn").href}`, serviceUrl: LIBROOM_SERVICE_URL };
  const parsed = new URL(casUrl);
  const serviceUrl = parsed.searchParams.get("service") || LIBROOM_SERVICE_URL;
  return { loginBaseUrl: parsed.href, serviceUrl };
}

function dateDelta(date, today) {
  const start = Date.parse(`${today}T00:00:00+08:00`);
  const target = Date.parse(`${date}T00:00:00+08:00`);
  return Number.isFinite(start) && Number.isFinite(target) ? Math.round((target - start) / 86_400_000) : NaN;
}

export function normalizeReservationInput(input = {}, { now = new Date() } = {}) {
  const areaId = Number(input.areaId ?? input.area_id);
  const date = String(input.date || input.start_date || "").trim();
  const startTime = String(input.startTime || input.start_time || "").trim();
  const endTime = String(input.endTime || input.end_time || "").trim();
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  const mobile = String(input.mobile || input.phone || "").trim();
  const start = parseTime(startTime);
  const end = parseTime(endTime);

  if (!Number.isInteger(areaId) || areaId <= 0) fail(400, "预约空间不正确。", "INVALID_RESERVATION_SPACE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    fail(400, "预约日期格式不正确。", "INVALID_RESERVATION_DATE");
  }
  const delta = dateDelta(date, localDate(now));
  if (!Number.isInteger(delta) || delta < 0 || delta > 3) {
    fail(400, "预约日期必须是今天起 3 日内。", "RESERVATION_DATE_OUT_OF_RANGE");
  }
  if (start === null || end === null || end <= start) fail(400, "预约时间不正确。", "INVALID_RESERVATION_TIME");
  if (start < LIBROOM_BOOKABLE_START_MINUTE || end > LIBROOM_BOOKABLE_END_MINUTE) {
    fail(400, "可预约时间为 08:00 至 21:45。", "RESERVATION_TIME_OUT_OF_RANGE");
  }
  if (end - start < 60 || end - start > 240) fail(400, "预约时长需为 1 至 4 小时。", "INVALID_RESERVATION_DURATION");
  if (!title) fail(400, "请填写申请主题。", "RESERVATION_TITLE_REQUIRED");
  if (!content) fail(400, "请填写申请内容。", "RESERVATION_CONTENT_REQUIRED");
  if (!/^\d{11}$/.test(mobile)) fail(400, "联系电话格式不正确。", "INVALID_RESERVATION_MOBILE");

  return {
    date,
    startTime,
    endTime,
    payload: {
      area_id: areaId,
      start_date: date,
      end_date: date,
      title,
      title_id: String(input.titleId || input.title_id || ""),
      content,
      open: input.open === true || input.open === 0 || input.isPublic === true || input.isPublic === 0 ? 0 : 1,
      team: "",
      mobile,
      time: [{ start_time: startTime, end_time: endTime }],
      file: input.file ?? null
    }
  };
}

function responseData(payload) {
  return payload && typeof payload.data === "object" && payload.data !== null ? payload.data : payload?.data ?? payload;
}

function upstreamMessage(payload, fallback) {
  return String(payload?.message || payload?.msg || payload?.error || fallback);
}

function firstString(value, keys, fallback = "") {
  if (!value || typeof value !== "object") return fallback;
  for (const key of keys) {
    const raw = value[key];
    if (raw === undefined || raw === null) continue;
    const text = String(raw).trim();
    if (text) return text;
  }
  return fallback;
}

function officialRecordDateTime(value) {
  const text = String(value || "").trim();
  const timestamp = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:[0-5]\d)(?::[0-5]\d)?$/.exec(text);
  if (timestamp) {
    const minutes = parseLooseTime(timestamp[2]);
    return { date: timestamp[1], time: minutes === null ? timestamp[2] : formatTime(minutes) };
  }
  const minutes = parseLooseTime(text);
  return { date: "", time: minutes === null ? "" : formatTime(minutes) };
}

function officialRecordShowTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:[0-5]\d)(?::[0-5]\d)?-(\d{1,2}:[0-5]\d)(?::[0-5]\d)?$/.exec(String(value || "").trim());
  if (!match) return { date: "", startTime: "", endTime: "" };
  const start = parseLooseTime(match[2]);
  const end = parseLooseTime(match[3]);
  return {
    date: match[1],
    startTime: start === null ? match[2] : formatTime(start),
    endTime: end === null ? match[3] : formatTime(end)
  };
}

function activeOfficialReservation(record, statusText) {
  const text = String(statusText || "").trim();
  if (/已使用|取消|违约|结束|过期/.test(text)) return false;
  if (/预约成功|待|生效/.test(text)) return true;
  if (record?.cancel_ok !== undefined || record?.cancelOk !== undefined) {
    return isTruthyFlag(record.cancel_ok ?? record.cancelOk);
  }
  return false;
}

export function normalizeLibroomMyReservationRecord(record, { activeOnly = true } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const statusText = firstString(record, ["statusText", "status_text", "status_name", "statusName", "status"]);
  if (activeOnly && !activeOfficialReservation(record, statusText)) return null;

  const begin = officialRecordDateTime(firstString(record, ["begin_time", "beginTime", "start_time", "startTime"]));
  const end = officialRecordDateTime(firstString(record, ["end_time", "endTime", "finish_time", "finishTime"]));
  const show = officialRecordShowTime(firstString(record, ["show_time", "showTime"]));
  const spaceId = Number(record.area_id ?? record.areaId ?? record.space_id ?? record.spaceId ?? record.seminar_id ?? record.seminarId ?? 0);

  return {
    id: firstString(record, ["id", "order_id", "orderId", "book_id", "bookId"]),
    spaceId: Number.isInteger(spaceId) && spaceId > 0 ? spaceId : 0,
    spaceName: firstString(record, ["spaceName", "nameMerge", "space_name", "areaName", "area_name", "room_name", "name"], "研讨间"),
    date: firstString(record, ["date", "order_date", "reserve_date"], begin.date || end.date || show.date),
    startTime: begin.time || show.startTime,
    endTime: end.time || show.endTime,
    title: firstString(record, ["title", "subject"], "个人预约研讨"),
    statusText: statusText || "预约成功",
    canCancel: record.cancel_ok !== undefined || record.cancelOk !== undefined
      ? isTruthyFlag(record.cancel_ok ?? record.cancelOk)
      : activeOfficialReservation(record, statusText),
    createdAt: firstString(record, ["createdAt", "created_at", "create_time"])
  };
}

export function libroomCasFromCallback(value) {
  try {
    const url = new URL(String(value || ""));
    const match = url.hash.match(/[?&]cas=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export function libroomCasFromCallbackResult({ finalUrl = "", location = "", baseUrl = LIBROOM_ORIGIN } = {}) {
  const fromFinalUrl = libroomCasFromCallback(finalUrl);
  if (fromFinalUrl) return fromFinalUrl;
  if (!location) return "";
  try {
    return libroomCasFromCallback(new URL(location, baseUrl).href);
  } catch {
    return "";
  }
}

function simpleCallbackRedirect(text, baseUrl) {
  const source = String(text || "");
  const match = source.match(/location\.replace\(["']([^"']+)/)
    || source.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)/)
    || source.match(/locationUrl\s*=\s*["']([^"']+)["']/);
  if (!match) return "";
  try {
    return new URL(match[1], baseUrl).href;
  } catch {
    return "";
  }
}

export async function resolveLibroomCasCallback(startUrl, { requestImpl, maxRedirects = 6 } = {}) {
  if (typeof requestImpl !== "function") return libroomCasFromCallback(startUrl);
  let currentUrl = String(startUrl || "");
  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const currentCas = libroomCasFromCallback(currentUrl);
    if (currentCas) return currentCas;
    const result = await requestImpl(currentUrl);
    const fromResult = libroomCasFromCallbackResult({
      finalUrl: result?.finalUrl || currentUrl,
      location: result?.location || "",
      baseUrl: currentUrl
    });
    if (fromResult) return fromResult;
    let location = "";
    try {
      location = result?.location ? new URL(result.location, currentUrl).href : "";
    } catch {
      location = "";
    }
    const nextUrl = location || simpleCallbackRedirect(result?.text, currentUrl);
    if (!nextUrl) return "";
    currentUrl = nextUrl;
  }
  return "";
}

export function libroomRequiresCasTicket(finalUrl) {
  return !libroomCasFromCallback(finalUrl);
}

export function clearLibroomLastError(meta = {}) {
  meta.libroom ||= {};
  meta.libroom.lastError = null;
  return meta;
}

export function createLibroomClient({
  token = "",
  getMemberToken,
  requestImpl,
  fetchImpl = fetch,
  baseUrl = LIBROOM_ORIGIN,
  timeoutMs = 15_000
} = {}) {
  let currentToken = String(token || "");

  async function defaultRequestImpl(pathname, data, { token: memberToken }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}${pathname}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json;charset=UTF-8",
          Authorization: `bearer${memberToken}`
        },
        body: JSON.stringify(data || {}),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      return { payload, status: response.status, ok: response.ok };
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(pathname, data = {}, { retry = true } = {}) {
    if (!currentToken) {
      if (typeof getMemberToken !== "function") fail(401, "空间预约会话未连接，请先登录学校账号。", "LIBROOM_AUTH_REQUIRED");
      currentToken = String(await getMemberToken() || "");
      if (!currentToken) fail(401, "空间预约会话已过期，请重新登录学校账号。", "LIBROOM_AUTH_EXPIRED");
    }
    const rawResult = await (requestImpl || defaultRequestImpl)(pathname, data || {}, {
      token: currentToken,
      baseUrl,
      timeoutMs
    });
    const payload = rawResult && Object.hasOwn(rawResult, "payload") ? rawResult.payload : rawResult;
    const statusCode = Number(rawResult?.status || 200);
    const responseOk = rawResult?.ok !== undefined ? Boolean(rawResult.ok) : statusCode >= 200 && statusCode < 300;

    const code = Number(payload?.code);
    const authError = !responseOk && [401, 403].includes(statusCode) || AUTH_ERROR_CODES.has(code);
    if (authError && retry && typeof getMemberToken === "function") {
      currentToken = String(await getMemberToken() || "");
      if (!currentToken) fail(401, "空间预约会话已过期，请重新登录学校账号。", "LIBROOM_AUTH_EXPIRED");
      return request(pathname, data, { retry: false });
    }
    if (!responseOk) fail(statusCode || 502, upstreamMessage(payload, `空间预约系统返回 HTTP ${statusCode || 502}。`), "LIBROOM_UPSTREAM_HTTP");
    if (payload && payload.code !== undefined && code !== 0) {
      const status = code === 20001 || /预约|占用|已被/.test(upstreamMessage(payload, "")) ? 409 : 502;
      fail(status, upstreamMessage(payload, "空间预约系统拒绝了请求。"), "LIBROOM_UPSTREAM_REJECTED");
    }
    return responseData(payload);
  }

  async function submitReservation(input, options = {}) {
    const normalized = normalizeReservationInput(input, options);
    const seminar = await request("/v4/seminar/seminar", { id: normalized.payload.area_id });
    const earlierPeriods = Number(seminar?.earlierPeriods ?? seminar?.data?.earlierPeriods ?? 0);
    const endpoint = earlierPeriods === 0 ? "/v4/seminar/confirm" : "/v4/seminar/submit";
    return request(endpoint, normalized.payload);
  }

  async function listSpaces(data = {}) {
    const requestData = {
      premises: data.premises || [],
      members: data.members || "",
      date: data.date || "",
      floor: data.floor || [],
      category: data.category || [],
      room: data.room || "",
      name: data.name || "",
      boutique: data.boutique || [],
      start_time: data.start_time || "",
      end_time: data.end_time || ""
    };
    const first = await request("/v4/seminar/list", { ...requestData, page: Number(data.page || 1) });
    if (Array.isArray(first)) return first;
    const items = Array.isArray(first?.data) ? [...first.data] : [];
    const lastPage = Math.min(20, Math.max(1, Number(first?.last_page || first?.lastPage || 1)));
    for (let page = 2; page <= lastPage; page += 1) {
      const next = await request("/v4/seminar/list", { ...requestData, page });
      if (Array.isArray(next?.data)) items.push(...next.data);
    }
    return items;
  }

  async function getMyReservations(data = {}) {
    const result = await request("/v4/seminar/books", {
      ...data,
      type: String(data.type || "1"),
      page: Number(data.page || 1),
      limit: Number(data.limit || 10)
    });
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.list)) return result.list;
    if (Array.isArray(result?.rows)) return result.rows;
    return [];
  }

  async function cancelReservation(id) {
    const orderId = String(id || "").trim();
    const endpoints = ["/v4/order/cancel", "/v4/seminar/cancel"];
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        return await request(endpoint, { id: orderId, order_id: orderId });
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { success: true };
  }

  return Object.freeze({
    request,
    listSpaces,
    getMyReservations,
    cancelReservation,
    getRules: () => request("/v4/index/bookingRules", {}),
    getAvailability: async ({ spaceId, date }) => {
      const raw = await request("/v4/seminar/seminar", { id: Number(spaceId), date: String(date || "") });
      return summarizeLibroomAvailability(raw, { date: String(date || "") });
    },
    submitReservation
  });
}

export async function exchangeLibroomMemberToken({ cas, requestImpl, fetchImpl = fetch, baseUrl = LIBROOM_ORIGIN, timeoutMs = 15_000 } = {}) {
  const ticket = String(cas || "").trim();
  if (!ticket) fail(401, "统一身份认证票据缺失，请重新登录学校账号。", "LIBROOM_CAS_TICKET_REQUIRED");
  if (typeof requestImpl === "function") {
    const rawResult = await requestImpl("/v4/login/user", { cas: ticket }, { token: "", baseUrl, timeoutMs });
    const payload = rawResult && Object.hasOwn(rawResult, "payload") ? rawResult.payload : rawResult;
    const statusCode = Number(rawResult?.status || 200);
    const responseOk = rawResult?.ok !== undefined ? Boolean(rawResult.ok) : statusCode >= 200 && statusCode < 300;
    const token = payload?.data?.member?.token || payload?.member?.token || payload?.data?.token;
    if (!responseOk || (payload?.code !== undefined && Number(payload.code) !== 0) || !token) {
      fail(responseOk ? 401 : statusCode, upstreamMessage(payload, "空间预约身份转换失败。"), "LIBROOM_AUTH_EXPIRED");
    }
    return String(token);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}/v4/login/user`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ cas: ticket }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    const token = payload?.data?.member?.token || payload?.member?.token || payload?.data?.token;
    if (!response.ok || (payload?.code !== undefined && Number(payload.code) !== 0) || !token) {
      fail(response.ok ? 401 : response.status, upstreamMessage(payload, "空间预约身份转换失败。"), "LIBROOM_AUTH_EXPIRED");
    }
    return String(token);
  } finally {
    clearTimeout(timer);
  }
}
