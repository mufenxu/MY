import { HttpError } from "./http.js";
import { createDecipheriv } from "node:crypto";

export const LIBROOM_ORIGIN = "https://libroom.hgu.edu.cn";
export const LIBROOM_SERVICE_URL = `${LIBROOM_ORIGIN}/v4/login/cas`;
const LIBROOM_CONFIG_IV = "ZZWBKJ_ZHIHUAWEI";
const AUTH_ERROR_CODES = new Set([401, 403, 10001, 10002, 10003]);

function fail(status, message, code = "LIBROOM_REQUEST_FAILED", details = null) {
  throw new HttpError(status, message, details, code);
}

function parseTime(value) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(String(value || ""));
  if (!match) return null;
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
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

  return Object.freeze({
    request,
    listSpaces: (data = {}) => request("/v4/seminar/index", data),
    getRules: (spaceId) => request("/v4/Help/should", { id: Number(spaceId) }),
    getAvailability: ({ spaceId }) => request("/v4/seminar/seminar", { id: Number(spaceId) }),
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
