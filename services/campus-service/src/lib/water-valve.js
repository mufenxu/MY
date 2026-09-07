import { HttpError } from "./http.js";

export function parseWaterValveCode(rawCode) {
  const value = String(rawCode || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const hashQuery = url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?") + 1) : "";
      return url.searchParams.get("sn") || new URLSearchParams(hashQuery).get("sn") || "";
    } catch {
      return "";
    }
  }
  if (/^[A-Za-z0-9]{12}$/.test(value)) return value;
  const parts = value.split("_");
  return parts.length >= 3 ? parts[2] : "";
}

export function waterValvePublic(state) {
  if (!state?.seqNo) return { bound: false };
  return {
    bound: true,
    seqNo: state.seqNo,
    deviceName: state.deviceName || `设备 ${state.seqNo}`,
    running: state.running === true,
    defaultValue: state.defaultValue || null,
    balance: state.balance || null,
    updatedAt: state.updatedAt || null
  };
}

function waterValveState(jar) {
  return jar.meta?.campus?.waterValve || null;
}

function normalizeWaterValveDevice(response, seqNo) {
  const rows = Array.isArray(response?.data) ? response.data : [];
  const device = rows[0] || {};
  return {
    seqNo,
    deviceName: device.deviceName || device.name || `设备 ${seqNo}`,
    defaultValue: device.mondeal != null ? String(device.mondeal) : null,
    balance: device.ewalletBalance != null ? String(device.ewalletBalance) : null,
    running: false,
    updatedAt: new Date().toISOString()
  };
}

export function createWaterValveService({
  ensureSessions,
  readSessionJar,
  saveSessionJar,
  request
}) {
  async function get() {
    await ensureSessions();
    const jar = await readSessionJar();
    const state = waterValveState(jar);
    if (!state?.seqNo) return waterValvePublic(null);

    try {
      const response = await request(jar, "/bluetoothApp/getListBySeqNo", (session) => ({
        seqNo: state.seqNo,
        accNum: session.accNum
      }));
      const normalized = normalizeWaterValveDevice(response, state.seqNo);
      const merged = {
        ...state,
        deviceName: normalized.deviceName,
        defaultValue: normalized.defaultValue,
        balance: normalized.balance,
        running: state.running === true,
        updatedAt: new Date().toISOString()
      };
      jar.meta.campus.waterValve = merged;
      await saveSessionJar(jar);
      return waterValvePublic(merged);
    } catch (error) {
      return { ...waterValvePublic(state), error: error.message || "生活用水设备状态查询失败" };
    }
  }

  async function bind(rawCode) {
    const seqNo = parseWaterValveCode(rawCode);
    if (!seqNo || seqNo.length !== 12) {
      throw new HttpError(400, "无法解析设备二维码，请重新扫描。", null, "INVALID_WATER_VALVE_CODE");
    }

    await ensureSessions();
    const jar = await readSessionJar();
    const response = await request(jar, "/bluetoothApp/getListBySeqNo", (session) => ({
      seqNo,
      accNum: session.accNum
    }));
    if (!Array.isArray(response?.data) || response.data.length === 0) {
      throw new HttpError(404, "未找到对应的生活用水设备。", null, "WATER_VALVE_NOT_FOUND");
    }

    const state = normalizeWaterValveDevice(response, seqNo);
    jar.meta.campus ||= {};
    jar.meta.campus.waterValve = state;
    await saveSessionJar(jar);
    return waterValvePublic(state);
  }

  async function open() {
    await ensureSessions();
    const jar = await readSessionJar();
    const state = waterValveState(jar);
    if (!state?.seqNo) {
      throw new HttpError(400, "请先扫描并绑定饮水机。", null, "WATER_VALVE_NOT_BOUND");
    }

    const response = await request(jar, "/bluetoothApp/openValueOnline", (session) => ({
      seqNo: state.seqNo,
      accNum: session.accNum
    }));
    const timestamp = response?.data?.timestamp;
    const next = {
      ...state,
      running: true,
      timestamp: timestamp != null ? String(timestamp) : state.timestamp || null,
      updatedAt: new Date().toISOString()
    };
    jar.meta.campus.waterValve = next;
    await saveSessionJar(jar);
    return waterValvePublic(next);
  }

  async function close() {
    await ensureSessions();
    const jar = await readSessionJar();
    const state = waterValveState(jar);
    if (!state?.seqNo) {
      throw new HttpError(400, "请先扫描并绑定饮水机。", null, "WATER_VALVE_NOT_BOUND");
    }

    await request(jar, "/bluetoothApp/closeValueOnline", () => ({
      seqNo: state.seqNo,
      timestamp: state.timestamp != null ? Number(state.timestamp) : null
    }));
    const next = {
      ...state,
      running: false,
      timestamp: null,
      updatedAt: new Date().toISOString()
    };
    jar.meta.campus.waterValve = next;
    await saveSessionJar(jar);
    return waterValvePublic(next);
  }

  return { get, bind, open, close };
}
