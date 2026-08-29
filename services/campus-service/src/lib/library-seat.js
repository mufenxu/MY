import { HttpError } from "./http.js";

export const LIBRARY_SEAT_ORIGIN = "https://libic.hgu.edu.cn";
export const LIBRARY_SEAT_API_BASE = `${LIBRARY_SEAT_ORIGIN}/jsq`;
export const LIBRARY_SEAT_OFFICIAL_ENTRY_URL = `${LIBRARY_SEAT_ORIGIN}/jsq-v/#/login`;
export const LIBRARY_SEAT_CAS_SERVICE_URL =
  "https://webvpn.hgu.edu.cn:443/passport/v1/auth/cas?sfDomain=cas96624";

const AUTH_ERROR_CODES = new Set([401, 403, 10001, 10002, 10003, 20003]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function fail(status, message, code = "LIBRARY_SEAT_REQUEST_FAILED", details = null) {
  throw new HttpError(status, message, details, code);
}

function dataOf(payload) {
  return payload && Object.hasOwn(payload, "data") ? payload.data : payload;
}

function upstreamMessage(payload, fallback) {
  return String(payload?.message || payload?.msg || payload?.error || fallback);
}

function stringValue(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function firstString(value, keys, fallback = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  for (const key of keys) {
    const text = stringValue(value[key]);
    if (text) return text;
  }
  return fallback;
}

function intValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function cachedLibrarySeatToken(jar) {
  const session = jar?.meta?.librarySeat;
  if (!session?.token || !session.expiresAt) return "";
  return Date.parse(session.expiresAt) > Date.now() + 30_000 ? String(session.token) : "";
}

function validDate(value, code = "INVALID_LIBRARY_SEAT_DATE") {
  const date = stringValue(value);
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    fail(400, "座位预约日期格式不正确。", code);
  }
  return date;
}

function safeId(value, label, code) {
  const id = stringValue(value);
  if (!id || !SAFE_ID.test(id)) fail(400, `${label}不正确。`, code);
  return id;
}

function minuteValue(value, label, code) {
  const minute = Number(value);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1440) {
    fail(400, `${label}不正确。`, code);
  }
  return minute;
}

function statusText(status) {
  const normalized = stringValue(status).toUpperCase();
  if (normalized === "FREE") return "可预约";
  if (normalized === "IN_USE") return "已占用";
  if (normalized === "LOCK" || normalized === "LOCKED") return "锁定";
  if (normalized === "BROKEN") return "不可用";
  return stringValue(status, "未知");
}

function seatSortKey(seat) {
  const label = Number(seat.label);
  return Number.isFinite(label) ? label : Number.MAX_SAFE_INTEGER;
}

export function librarySeatTokenFromOfficialUrl(value) {
  try {
    const url = new URL(String(value || ""), LIBRARY_SEAT_ORIGIN);
    const token = url.searchParams.get("token");
    return stringValue(token);
  } catch {
    return "";
  }
}

export function normalizeLibrarySeatOverviewPayload(payload) {
  const data = dataOf(payload) || {};
  const venues = asArray(data.buildings).map((building) => {
    const id = firstString(building, ["id", "buildingId", "value"]);
    const name = firstString(building, ["name", "buildingName", "label"], id ? `场馆 ${id}` : "");
    if (!id || !name) return null;
    return {
      id,
      name,
      floors: asArray(building.floors).map((floor) => {
        const floorId = firstString(floor, ["id", "floorId", "value"]);
        const floorName = firstString(floor, ["name", "floorName", "label"], floorId ? `楼层 ${floorId}` : "");
        return floorId && floorName ? { id: floorId, name: floorName } : null;
      }).filter(Boolean)
    };
  }).filter(Boolean);
  const dates = asArray(data.dates).map((date) => stringValue(date)).filter(Boolean);
  return { venues, dates };
}

export function normalizeLibrarySeatAreasPayload(payload) {
  const data = dataOf(payload) || {};
  const rows = Array.isArray(data) ? data : asArray(data.pageList || data.list || data.rows || data.records);
  const areas = rows.map((row) => {
    const id = firstString(row, ["id", "roomId"]);
    if (!id) return null;
    return {
      id,
      venueId: firstString(row, ["buildingId", "venueId"]),
      floorId: firstString(row, ["floorId"]),
      name: firstString(row, ["name", "roomName"], `阅览区 ${id}`),
      nameE: firstString(row, ["nameE", "englishName"]),
      buildingName: firstString(row, ["buildingName", "venueName"]),
      floorName: firstString(row, ["floorName"]),
      seatTotal: intValue(row?.seatTotal ?? row?.total),
      seatFree: intValue(row?.seatFree ?? row?.free),
      seatLock: intValue(row?.seatLock ?? row?.locked),
      seatScene: intValue(row?.seatScene ?? row?.scene),
      maxMinute: intValue(row?.maxMinute),
      type: firstString(row, ["type"]),
      markMode: intValue(row?.markMode)
    };
  }).filter(Boolean);
  return {
    areas,
    paging: {
      total: intValue(data.total, areas.length),
      currentPage: intValue(data.currentPage ?? data.page, 1),
      pageSize: intValue(data.pageSize ?? data.limit, areas.length || 0)
    }
  };
}

export function normalizeLibrarySeatSeatsPayload(payload) {
  const data = dataOf(payload) || {};
  const rows = Array.isArray(data) ? data : Object.values(data);
  return rows.map((row) => {
    const id = firstString(row, ["id"]);
    const status = firstString(row, ["status"]);
    if (!id) return null;
    return {
      id,
      label: firstString(row, ["label", "seatNo", "no"], id),
      name: firstString(row, ["name", "seatName"], `座位 ${id}`),
      status,
      statusText: statusText(status),
      isFree: status.toUpperCase() === "FREE"
    };
  }).filter(Boolean).sort((a, b) => seatSortKey(a) - seatSortKey(b) || a.label.localeCompare(b.label));
}

export function normalizeLibrarySeatReservationInput(input = {}) {
  const seatId = safeId(input.seatId ?? input.seat_id, "座位", "INVALID_LIBRARY_SEAT_ID");
  const date = validDate(input.date ?? input.makeDate);
  const startMinute = minuteValue(input.startMinute ?? input.start_minute, "开始时间", "INVALID_LIBRARY_SEAT_START");
  const endMinute = minuteValue(input.endMinute ?? input.end_minute, "结束时间", "INVALID_LIBRARY_SEAT_END");
  if (endMinute <= startMinute) fail(400, "座位预约结束时间必须晚于开始时间。", "INVALID_LIBRARY_SEAT_TIME_RANGE");
  if (endMinute - startMinute > 240) fail(400, "座位预约时长不能超过 4 小时。", "INVALID_LIBRARY_SEAT_DURATION");
  return {
    seatId,
    date,
    startMinute,
    endMinute,
    capToken: stringValue(input.capToken ?? input.cap_token)
  };
}

export function createLibrarySeatClient({
  token = "",
  getMemberToken,
  requestImpl,
  fetchImpl = fetch,
  baseUrl = LIBRARY_SEAT_API_BASE,
  timeoutMs = 15_000
} = {}) {
  let currentToken = stringValue(token);

  async function defaultRequestImpl(pathname, data, { token: memberToken }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, "")}${pathname}`, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
          loginType: "PC",
          token: memberToken
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

  async function request(pathname, data = {}, { retry = true, tokenRequired = true, conflict = false } = {}) {
    if (tokenRequired && !currentToken) {
      if (typeof getMemberToken !== "function") fail(401, "座位预约会话未连接，请先登录学校账号。", "LIBRARY_SEAT_AUTH_REQUIRED");
      currentToken = stringValue(await getMemberToken());
      if (!currentToken) fail(401, "座位预约会话已过期，请重新登录学校账号。", "LIBRARY_SEAT_AUTH_EXPIRED");
    }

    const rawResult = await (requestImpl || defaultRequestImpl)(pathname, data || {}, {
      token: currentToken,
      baseUrl,
      timeoutMs
    });
    const payload = rawResult && Object.hasOwn(rawResult, "payload") ? rawResult.payload : rawResult;
    const statusCode = Number(rawResult?.status || 200);
    const ok = rawResult?.ok !== undefined ? Boolean(rawResult.ok) : statusCode >= 200 && statusCode < 300;
    const code = Number(payload?.code);
    const authError = (!ok && [401, 403].includes(statusCode)) || AUTH_ERROR_CODES.has(code);

    if (authError && retry && typeof getMemberToken === "function") {
      currentToken = stringValue(await getMemberToken());
      if (!currentToken) fail(401, "座位预约会话已过期，请重新登录学校账号。", "LIBRARY_SEAT_AUTH_EXPIRED");
      return request(pathname, data, { retry: false, tokenRequired, conflict });
    }
    if (!ok) fail(statusCode || 502, upstreamMessage(payload, `座位预约系统返回 HTTP ${statusCode || 502}。`), "LIBRARY_SEAT_UPSTREAM_HTTP");
    if (payload && payload.code !== undefined && code !== 200 && payload.status !== true) {
      fail(conflict ? 409 : 502, upstreamMessage(payload, "座位预约系统拒绝了请求。"), "LIBRARY_SEAT_UPSTREAM_REJECTED");
    }
    if (payload && payload.status === false) {
      fail(conflict ? 409 : 502, upstreamMessage(payload, "座位预约系统拒绝了请求。"), "LIBRARY_SEAT_UPSTREAM_REJECTED");
    }
    return dataOf(payload);
  }

  return Object.freeze({
    request,
    getOverview: async () => normalizeLibrarySeatOverviewPayload(
      await request("/static/frontApi/res/buildingFloorDate", {})
    ),
    listAreas: async (input = {}) => {
      const venueId = safeId(input.venueId ?? input.buildingId, "场馆", "INVALID_LIBRARY_SEAT_VENUE");
      const date = validDate(input.date);
      const startMinute = minuteValue(input.startMinute ?? input.beginMinute, "开始时间", "INVALID_LIBRARY_SEAT_START");
      const endMinute = input.endMinute === undefined || input.endMinute === null || input.endMinute === ""
        ? 0
        : minuteValue(input.endMinute, "结束时间", "INVALID_LIBRARY_SEAT_END");
      const floorId = input.floorId === undefined || input.floorId === null || input.floorId === "" ? 0 : safeId(input.floorId, "楼层", "INVALID_LIBRARY_SEAT_FLOOR");
      return normalizeLibrarySeatAreasPayload(await request(`/static/frontApi/res/findRoomDuration/${venueId}/${date}`, {
        beginMinute: startMinute,
        currentPage: Number(input.currentPage || 1),
        endMinute,
        floorId,
        minMinute: 0,
        pageSize: Number(input.pageSize || 50),
        power: input.power === true,
        roomType: false,
        sortField: "",
        sortType: "",
        windows: input.window === true || input.windows === true
      }));
    },
    getEndTimes: async (input = {}) => {
      const venueId = safeId(input.venueId ?? input.buildingId, "场馆", "INVALID_LIBRARY_SEAT_VENUE");
      const startMinute = minuteValue(input.startMinute ?? input.beginMinute, "开始时间", "INVALID_LIBRARY_SEAT_START");
      return request(`/static/frontApi/res/getEndTimes2/${venueId}/${startMinute}`, {});
    },
    getSeats: async (input = {}) => {
      const roomId = safeId(input.roomId ?? input.areaId, "阅览区", "INVALID_LIBRARY_SEAT_ROOM");
      const date = validDate(input.date);
      await request(`/static/frontApi/res/querySeatLayout/${roomId}/${Number(input.amPm || 0)}`, {});
      const seats = await request(`/static/frontApi/res/freeSeatIdsDuration/${roomId}/${date}`, {
        beginMinute: minuteValue(input.startMinute, "开始时间", "INVALID_LIBRARY_SEAT_START"),
        endMinute: minuteValue(input.endMinute, "结束时间", "INVALID_LIBRARY_SEAT_END"),
        minMinute: 0
      });
      return normalizeLibrarySeatSeatsPayload(seats);
    },
    getMyReservations: async () => request("/static/frontApi/user/lastMake", {}),
    submitReservation: async (input = {}) => {
      const normalized = normalizeLibrarySeatReservationInput(input);
      return request(
        `/static/frontApi/make/freeBook/${normalized.seatId}/${normalized.date}/${normalized.startMinute}/${normalized.endMinute}?capToken=${encodeURIComponent(normalized.capToken)}`,
        {},
        { conflict: true }
      );
    }
  });
}
