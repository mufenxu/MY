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
    updatedAt: state.updatedAt || null,
    error: state.error || null
  };
}

function waterValvesPublic(states) {
  const devices = states.map(waterValvePublic);
  const first = devices[0] || { bound: false };
  return {
    ...first,
    bound: devices.length > 0,
    devices
  };
}

function waterValveStates(jar) {
  const campus = jar.meta?.campus;
  if (Array.isArray(campus?.waterValves)) return campus.waterValves;
  return campus?.waterValve?.seqNo ? [campus.waterValve] : [];
}

function persistWaterValves(jar, states) {
  const campus = jar.meta.campus ||= {};
  campus.waterValves = states;
  if (states.length) campus.waterValve = states[0];
  else delete campus.waterValve;
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
    timestamp: null,
    updatedAt: new Date().toISOString(),
    error: null
  };
}

function requireWaterValveState(states, seqNo) {
  const state = states.find((item) => item.seqNo === seqNo);
  if (!state) throw new HttpError(404, "未找到已绑定的饮水机。", null, "WATER_VALVE_NOT_FOUND");
  return state;
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
    const states = waterValveStates(jar);
    if (!states.length) return waterValvesPublic([]);

    const nextStates = [];
    for (const state of states) {
      try {
        const response = await request(jar, "/bluetoothApp/openValueBefore", (session) => ({
          seqNo: state.seqNo,
          accNum: session.accNum
        }));
        const normalized = normalizeWaterValveDevice(response, state.seqNo);
        nextStates.push({
          ...state,
          deviceName: normalized.deviceName,
          defaultValue: normalized.defaultValue,
          balance: normalized.balance,
          updatedAt: new Date().toISOString(),
          error: null
        });
      } catch (error) {
        nextStates.push({ ...state, error: error.message || "生活用水设备状态查询失败" });
      }
    }
    persistWaterValves(jar, nextStates);
    await saveSessionJar(jar);
    return waterValvesPublic(nextStates);
  }

  async function bind(rawCode) {
    const seqNo = parseWaterValveCode(rawCode);
    if (!seqNo || seqNo.length !== 12) {
      throw new HttpError(400, "无法解析设备二维码，请重新扫描。", null, "INVALID_WATER_VALVE_CODE");
    }

    await ensureSessions();
    const jar = await readSessionJar();
    const response = await request(jar, "/bluetoothApp/openValueBefore", (session) => ({
      seqNo,
      accNum: session.accNum
    }));
    if (!Array.isArray(response?.data) || response.data.length === 0) {
      throw new HttpError(404, "未找到对应的生活用水设备。", null, "WATER_VALVE_NOT_FOUND");
    }

    const states = waterValveStates(jar);
    const existing = states.find((item) => item.seqNo === seqNo) || {};
    const normalized = normalizeWaterValveDevice(response, seqNo);
    const state = {
      ...existing,
      ...normalized,
      running: existing.running === true,
      timestamp: existing.timestamp || null
    };
    const nextStates = states.some((item) => item.seqNo === seqNo)
      ? states.map((item) => (item.seqNo === seqNo ? state : item))
      : [...states, state];
    persistWaterValves(jar, nextStates);
    await saveSessionJar(jar);
    return waterValvesPublic(nextStates);
  }

  async function open(seqNo) {
    await ensureSessions();
    const jar = await readSessionJar();
    const states = waterValveStates(jar);
    const state = requireWaterValveState(states, seqNo);

    const response = await request(jar, "/bluetoothApp/openValueOnline", (session) => ({
      seqNo: state.seqNo,
      accNum: session.accNum
    }));
    const timestamp = response?.data?.timestamp;
    const nextState = {
      ...state,
      running: true,
      timestamp: timestamp != null ? String(timestamp) : state.timestamp || null,
      updatedAt: new Date().toISOString(),
      error: null
    };
    const nextStates = states.map((item) => (item.seqNo === seqNo ? nextState : item));
    persistWaterValves(jar, nextStates);
    await saveSessionJar(jar);
    return waterValvesPublic(nextStates);
  }

  async function close(seqNo) {
    await ensureSessions();
    const jar = await readSessionJar();
    const states = waterValveStates(jar);
    const state = requireWaterValveState(states, seqNo);

    await request(jar, "/bluetoothApp/closeValueOnline", () => ({
      seqNo: state.seqNo,
      timestamp: state.timestamp != null ? Number(state.timestamp) : null
    }));
    const nextState = {
      ...state,
      running: false,
      timestamp: null,
      updatedAt: new Date().toISOString(),
      error: null
    };
    const nextStates = states.map((item) => (item.seqNo === seqNo ? nextState : item));
    persistWaterValves(jar, nextStates);
    await saveSessionJar(jar);
    return waterValvesPublic(nextStates);
  }

  async function unbind(seqNo) {
    const jar = await readSessionJar();
    const states = waterValveStates(jar);
    requireWaterValveState(states, seqNo);
    const nextStates = states.filter((item) => item.seqNo !== seqNo);
    persistWaterValves(jar, nextStates);
    await saveSessionJar(jar);
    return waterValvesPublic(nextStates);
  }

  async function reorder(seqNos) {
    const jar = await readSessionJar();
    const states = waterValveStates(jar);
    const currentSeqNos = states.map((item) => item.seqNo);
    const uniqueSeqNos = [...new Set(Array.isArray(seqNos) ? seqNos.map(String) : [])];
    if (uniqueSeqNos.length !== currentSeqNos.length || !currentSeqNos.every((seqNo) => uniqueSeqNos.includes(seqNo))) {
      throw new HttpError(400, "饮水机排序数据无效。", null, "INVALID_WATER_VALVE_ORDER");
    }
    const nextStates = uniqueSeqNos.map((seqNo) => requireWaterValveState(states, seqNo));
    persistWaterValves(jar, nextStates);
    await saveSessionJar(jar);
    return waterValvesPublic(nextStates);
  }

  return { get, bind, open, close, unbind, reorder };
}
