import { HttpError } from "./http.js";

export const LIBRARY_SEAT_ORIGIN = "https://libic.hgu.edu.cn";
export const LIBRARY_SEAT_API_BASE = `${LIBRARY_SEAT_ORIGIN}/jsq`;
export const LIBRARY_SEAT_OFFICIAL_ENTRY_URL = `${LIBRARY_SEAT_ORIGIN}/jsq-v/#/login`;
export const LIBRARY_SEAT_CAS_SERVICE_URL =
  `${LIBRARY_SEAT_ORIGIN}/remote/static/sso/login?redirectUrl=${encodeURIComponent(LIBRARY_SEAT_OFFICIAL_ENTRY_URL)}`;

const AUTH_ERROR_CODES = new Set([401, 403, 10001, 10002, 10003, 20003]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SEAT_AVAILABILITY_CACHE_MS = Math.max(0, Number(process.env.LIBRARY_SEAT_AVAILABILITY_CACHE_MS ?? 20_000) || 0);
const SEAT_AVAILABILITY_CACHE_LIMIT = 200;

const seatAvailabilityCache = new Map();

function readSeatAvailabilityCache(key) {
  if (!(SEAT_AVAILABILITY_CACHE_MS > 0)) return null;
  const entry = seatAvailabilityCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    seatAvailabilityCache.delete(key);
    return null;
  }
  return entry.seats;
}

function writeSeatAvailabilityCache(key, seats) {
  if (!(SEAT_AVAILABILITY_CACHE_MS > 0)) return;
  if (seatAvailabilityCache.size >= SEAT_AVAILABILITY_CACHE_LIMIT) seatAvailabilityCache.clear();
  seatAvailabilityCache.set(key, { seats, expiresAt: Date.now() + SEAT_AVAILABILITY_CACHE_MS });
}

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

function actionMessage(value) {
  if (value && typeof value === "object") return firstString(value, ["message", "msg"], "");
  return stringValue(value);
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

function librarySeatId(input) {
  return safeId(input?.seatId ?? input?.id, "座位", "INVALID_LIBRARY_SEAT_ID");
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

function librarySeatReservationStatusText(status) {
  const normalized = stringValue(status).toUpperCase();
  if (normalized === "RESERVE") return "预约";
  if (normalized === "CHECK_IN") return "履约中";
  if (normalized === "AWAY") return "暂离";
  if (normalized === "LEAVE_EARLY") return "早退";
  if (normalized === "STOP") return "已结束";
  if (normalized === "MISS") return "失约";
  if (normalized === "CANCEL") return "已取消";
  if (normalized === "NO_STOP") return "未签退";
  return stringValue(status, "未知");
}

export function librarySeatTokenFromOfficialUrl(value) {
  try {
    const url = new URL(String(value || ""), LIBRARY_SEAT_ORIGIN);
    const queryToken = url.searchParams.get("token");
    if (queryToken) return stringValue(queryToken);
    const fragment = String(url.hash || "").replace(/^#/, "");
    const query = fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : "";
    return stringValue(new URLSearchParams(query).get("token"));
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

export function normalizeLibrarySeatReservationRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const status = firstString(record, ["status"]).toUpperCase();
  return {
    id: firstString(record, ["id"]),
    seatId: firstString(record, ["seatId"]),
    seatLabel: firstString(record, ["seatLabel", "seatNo"], ""),
    receipt: firstString(record, ["receipt"]),
    date: firstString(record, ["makeDateStr", "makeDate"], ""),
    startTime: firstString(record, ["makeBeginStr"], ""),
    endTime: firstString(record, ["makeEndStr"], ""),
    actualTime: firstString(record, ["actualStr"], ""),
    location: firstString(record, ["location"], ""),
    buildName: firstString(record, ["buildName"], ""),
    floorName: firstString(record, ["floorName"], ""),
    roomName: firstString(record, ["roomName"], ""),
    status,
    statusText: librarySeatReservationStatusText(status),
    message: firstString(record, ["message"], ""),
    awayRange: firstString(record, ["awayRange"], "")
  };
}

function normalizeLibrarySeatReservationRecords(rows = []) {
  return asArray(rows).map(normalizeLibrarySeatReservationRecord).filter(Boolean);
}

const LIBRARY_SEAT_DOOR_DIRECTIONS = new Map([[0, "入馆"], [1, "离馆"]]);

export function normalizeLibrarySeatCurrentUsePayload(payload) {
  const data = dataOf(payload);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return normalizeLibrarySeatReservationRecord(data);
}

export function normalizeLibrarySeatCancelResult(payload) {
  return { remainingCancelCount: Math.max(0, intValue(dataOf(payload), 0)) };
}

export function normalizeLibrarySeatBreachPayload(payload) {
  const data = dataOf(payload) || {};
  const rows = asArray(Array.isArray(data) ? data : data.list);
  const records = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const status = firstString(row, ["status"]).toUpperCase();
    return {
      id: firstString(row, ["id"]),
      status,
      statusText: librarySeatReservationStatusText(status),
      seatLabel: firstString(row, ["seatLabel", "seatNo"], ""),
      location: firstString(row, ["location"], ""),
      date: firstString(row, ["makeDateStr", "makeDate"], ""),
      startTime: firstString(row, ["makeBeginStr"], ""),
      endTime: firstString(row, ["makeEndStr"], ""),
      actualTime: firstString(row, ["actualStr"], ""),
      awayRange: firstString(row, ["awayRange"], "")
    };
  }).filter(Boolean);
  return { total: intValue(data.count, records.length), records };
}

export function normalizeLibrarySeatDoorLogPayload(payload) {
  return asArray(dataOf(payload)).map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const direction = intValue(row.direction, 0);
    return {
      id: firstString(row, ["id"]),
      doorName: firstString(row, ["doorName"], ""),
      dateTime: firstString(row, ["dateTimeStr", "dateTime"], ""),
      direction,
      directionText: LIBRARY_SEAT_DOOR_DIRECTIONS.get(direction) || "未知"
    };
  }).filter(Boolean);
}

export function normalizeLibrarySeatMakeLifePayload(payload) {
  return asArray(dataOf(payload)).map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    return {
      stageName: firstString(row, ["stageName"], ""),
      createdDate: firstString(row, ["createdDate"], ""),
      sourceName: firstString(row, ["sourceName"], "")
    };
  }).filter(Boolean);
}

const LIBRARY_SEAT_LAYOUT_VERSION_SEPARATOR = "_updVersion_";

function boundedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number * 100) / 100));
}

export function normalizeLibrarySeatTimelinePayload(payload) {
  const data = dataOf(payload);
  const source = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const free = asArray(source.freeList).map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const left = boundedPercent(row.left);
    const width = boundedPercent(row.width);
    if (left === null || width === null || width <= 0) return null;
    return { left, width };
  }).filter(Boolean).sort((left, right) => left.left - right.left);
  const marks = asArray(source.markList).map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const left = boundedPercent(row.left);
    if (left === null) return null;
    return { left, label: firstString(row, ["label", "text", "name"]) };
  }).filter(Boolean).sort((left, right) => left.left - right.left);
  return { free, marks };
}

export function normalizeLibrarySeatStartTimesPayload(payload) {
  return asArray(dataOf(payload)).map((row) => {
    if (Array.isArray(row)) {
      const value = stringValue(row[0]);
      return value ? { value, text: stringValue(row[1], value) } : null;
    }
    if (row && typeof row === "object") {
      const value = firstString(row, ["value", "startMinute", "minute"]);
      return value ? { value, text: firstString(row, ["text", "label", "time"], value) } : null;
    }
    return null;
  }).filter(Boolean);
}

function normalizeLibrarySeatLayoutSeats(layout) {
  return asArray(layout?.objects).map((object) => {
    const seat = object && typeof object === "object" ? object.seat : null;
    if (!seat || typeof seat !== "object" || Array.isArray(seat)) return null;
    const id = firstString(seat, ["id"]);
    if (!id) return null;
    const left = Number(object.left);
    const top = Number(object.top);
    return {
      id,
      label: firstString(seat, ["label", "seatNo", "no"], id),
      name: firstString(seat, ["name", "seatName"]),
      left: Number.isFinite(left) ? left : null,
      top: Number.isFinite(top) ? top : null
    };
  }).filter(Boolean);
}

export function normalizeLibrarySeatLayoutPayload(payload, { roomId = "" } = {}) {
  const raw = dataOf(payload);
  const text = typeof raw === "string" ? raw : "";
  const id = stringValue(roomId);
  if (!text) return { roomId: id, unchanged: true, version: "", seats: [] };
  const index = text.lastIndexOf(LIBRARY_SEAT_LAYOUT_VERSION_SEPARATOR);
  const body = index >= 0 ? text.slice(0, index) : text;
  const version = index >= 0
    ? stringValue(text.slice(index + LIBRARY_SEAT_LAYOUT_VERSION_SEPARATOR.length))
    : "";
  let layout = null;
  try {
    layout = JSON.parse(body);
  } catch {
    layout = null;
  }
  return { roomId: id, unchanged: false, version, seats: normalizeLibrarySeatLayoutSeats(layout) };
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
      const range = {
        beginMinute: minuteValue(input.startMinute, "开始时间", "INVALID_LIBRARY_SEAT_START"),
        endMinute: minuteValue(input.endMinute, "结束时间", "INVALID_LIBRARY_SEAT_END"),
        minMinute: 0
      };
      const amPm = Number(stringValue(input.amPm));
      const useSlice = Number.isFinite(amPm) && amPm > 0;
      const cacheKey = `${roomId}|${date}|${range.beginMinute}|${range.endMinute}|${amPm}`;
      const cached = readSeatAvailabilityCache(cacheKey);
      if (cached) return cached;
      const seats = useSlice
        ? await request(`/static/frontApi/res/freeSeatIdsSlice/${roomId}/${date}`, { ...range, amPm })
        : await request(`/static/frontApi/res/freeSeatIdsDuration/${roomId}/${date}`, range);
      const normalized = normalizeLibrarySeatSeatsPayload(seats);
      writeSeatAvailabilityCache(cacheKey, normalized);
      return normalized;
    },
    getMyReservations: async () => normalizeLibrarySeatReservationRecords(
      await request("/static/frontApi/user/lastMake", {})
    ),
    getMyReservationHistory: async (input = {}) => {
      const page = Math.max(0, intValue(input.page, 0));
      const size = Math.min(50, Math.max(1, intValue(input.size, 10)));
      const payload = await request("/static/frontApi/user/history/" + page + "/" + size, {});
      const list = normalizeLibrarySeatReservationRecords(Array.isArray(payload) ? payload : payload?.list);
      return { total: intValue(payload?.count, list.length), records: list };
    },
    getCurrentUse: async () => normalizeLibrarySeatCurrentUsePayload(
      await request("/static/frontApi/user/currentUseMake", {})
    ),
    checkIn: async () => actionMessage(
      await request("/static/frontApi/make/checkIn?qrMd5=PC", {}, { conflict: true })
    ),
    leaveSeat: async () => actionMessage(
      await request("/static/frontApi/make/leave", {}, { conflict: true })
    ),
    stopSeat: async () => actionMessage(
      await request("/static/frontApi/make/stop", {}, { conflict: true })
    ),
    cancelReservation: async (input) => normalizeLibrarySeatCancelResult(
      await request(
        `/static/frontApi/make/cancel/${safeId(input?.id ?? input, "预约", "INVALID_LIBRARY_SEAT_RESERVATION")}`,
        {},
        { conflict: true }
      )
    ),
    getBreachRecords: async (input = {}) => {
      const page = Math.max(0, intValue(input.page, 0));
      const size = Math.min(50, Math.max(1, intValue(input.size, 10)));
      return normalizeLibrarySeatBreachPayload(
        await request(`/static/frontApi/user/breach/${page}/${size}`, {})
      );
    },
    getDoorLog: async (input = {}) => normalizeLibrarySeatDoorLogPayload(
      await request(`/static/frontApi/user/doorLog/${validDate(input.date)}`, {})
    ),
    getMakeLife: async (input) => normalizeLibrarySeatMakeLifePayload(
      await request(
        `/static/frontApi/user/makeLife/${safeId(input?.id ?? input, "预约", "INVALID_LIBRARY_SEAT_RESERVATION")}`,
        {}
      )
    ),
    getTimeline: async (input = {}) => normalizeLibrarySeatTimelinePayload(
      await request(`/static/frontApi/res/getTimeLine/${librarySeatId(input)}/${validDate(input.date)}`, {})
    ),
    getStartTimes: async (input = {}) => normalizeLibrarySeatStartTimesPayload(
      await request(`/static/frontApi/res/getStartTimes/${librarySeatId(input)}/${validDate(input.date)}`, {})
    ),
    getSeatLayout: async (input = {}) => normalizeLibrarySeatLayoutPayload(
      await request(
        `/static/frontApi/res/querySeatLayout/${safeId(input.roomId ?? input.areaId, "阅览区", "INVALID_LIBRARY_SEAT_ROOM")}/${Math.max(0, intValue(input.updV ?? input.version, 0))}`,
        {}
      ),
      { roomId: input.roomId ?? input.areaId }
    ),
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
