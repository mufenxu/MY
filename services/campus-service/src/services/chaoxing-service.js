import { HttpError } from "../lib/http.js";
import { KeyedSerialQueue } from "../lib/keyed-serial-queue.js";
import { cookieHeaderFor, emptySessionJar, parseSetCookie, rememberCookie, updateJarFromResponse } from "../lib/session-jar.js";

const MOBILE = "https://mobilelearn.chaoxing.com";
const PROFILE = "https://sso.chaoxing.com/apis/login/userLogin4Uname.do";
const COURSES = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
const HOSTS = new Set(["passport2.chaoxing.com", "sso.chaoxing.com", "mooc1-api.chaoxing.com", "mobilelearn.chaoxing.com"]);
const STATUS_TEXT = { 0: "未签到", 1: "已签到", 2: "教师代签", 4: "请假", 5: "缺勤", 7: "病假", 8: "事假", 9: "迟到", 10: "早退", 11: "签到已过期", 12: "公假" };
const TYPE_TEXT = { 0: "普通签到", 2: "二维码签到", 3: "手势签到", 4: "位置签到", 5: "签到码签到" };

function fail(status, message, code) { return new HttpError(status, message, null, code); }
function loginRequired() { return fail(409, "学习通登录已失效，请重新连接学习通账号。", "CHAOXING_LOGIN_REQUIRED"); }
function id(value) {
  const text = String(value ?? "");
  if (!/^\d{1,20}$/.test(text)) throw fail(400, "学习通活动参数不完整，请刷新后重试。", "CHAOXING_INVALID_ID");
  return text;
}
function enabled(value) { return value === true || String(value) === "1" || value === "true"; }
function apiUrl(path, query = {}) {
  const url = new URL(path, MOBILE);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  return url.href;
}
function milliseconds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? (number < 1e11 ? number * 1000 : number) : null;
}
function profileSummary(jar) {
  return {
    connected: Boolean(jar?.meta?.profile && !jar.meta.expired),
    name: jar?.meta?.profile?.name || "",
    school: jar?.meta?.profile?.school || "",
    connectedAt: jar?.meta?.connectedAt || null
  };
}

export function normalizeChaoxingLocation(value, now = Date.now()) {
  if (!value || typeof value !== "object") throw fail(400, "请先获取当前位置。", "CHAOXING_LOCATION_REQUIRED");
  const { latitude, longitude, accuracy, timestamp, address, coordinateSystem } = value;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || coordinateSystem !== "bd09ll") {
    throw fail(400, "定位数据无效，请重新获取位置。", "CHAOXING_INVALID_LOCATION");
  }
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 1000 || !Number.isFinite(timestamp)
      || now - timestamp > 120000 || timestamp - now > 30000) {
    throw fail(400, "定位已过期或精度不足，请重新获取位置。", "CHAOXING_STALE_LOCATION");
  }
  if (typeof address !== "string" || !address.trim() || address.length > 500) {
    throw fail(400, "未获取到位置地址，请重新定位。", "CHAOXING_INVALID_LOCATION");
  }
  // Preserve measured values; client authorization proofs cannot be manufactured by MY.
  return { result: 1, latitude, longitude, accuracy, timestamp, address: address.trim(), coordinateSystem, isMock: value.isMock === true };
}

export function createChaoxingService({ repository, sensitiveJson, readUpstreamText, fetchImpl = fetch }) {
  const queue = new KeyedSerialQueue();

  async function request(jar, rawUrl, { method = "GET", form, referer = MOBILE } = {}) {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) {
      throw fail(400, "学习通请求地址无效。", "CHAOXING_INVALID_URL");
    }
    const headers = { accept: "application/json, text/plain, */*", referer, "user-agent": "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Mobile Safari/537.36 MY-Control" };
    const cookie = cookieHeaderFor(jar, url.href);
    if (cookie) headers.cookie = cookie;
    if (form) headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    let response;
    try {
      response = await fetchImpl(url.href, { method, headers, body: form ? new URLSearchParams(form).toString() : undefined, redirect: "manual", signal: AbortSignal.timeout(15000) });
      updateJarFromResponse(jar, response, url.href, "chaoxing.com");
      const text = await readUpstreamText(response);
      if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) throw loginRequired();
      if (!response.ok) throw fail(502, "学习通暂时无法响应，请稍后重试。", "CHAOXING_UPSTREAM_ERROR");
      if (/<(?:html|!doctype)/i.test(text.slice(0, 500)) && /passport2\.chaoxing|请.*登录|用户登录/.test(text)) throw loginRequired();
      return text;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw fail(502, "学习通连接超时或网络异常，请刷新状态后重试。", "CHAOXING_NETWORK_ERROR");
    }
  }

  async function json(jar, url, options) {
    const text = await request(jar, url, options);
    try { return JSON.parse(text); } catch { throw fail(502, "学习通返回的数据格式发生变化，请使用官方客户端。", "CHAOXING_PROTOCOL_CHANGED"); }
  }

  async function withSession(userId, task) {
    return queue.run(userId, async () => {
      const row = await repository.getChaoxingSession(userId);
      if (!row) throw loginRequired();
      const jar = sensitiveJson.decode(row.jar_json);
      if (!jar?.meta?.profile || jar.meta.expired) throw loginRequired();
      try { return await task(jar); }
      catch (error) {
        if (error.code === "CHAOXING_LOGIN_REQUIRED") jar.meta.expired = true;
        throw error;
      } finally {
        await repository.upsertChaoxingSession(userId, sensitiveJson.encode(jar), new Date().toISOString());
      }
    });
  }

  async function courses(jar) {
    const payload = await json(jar, COURSES);
    if (!Array.isArray(payload.channelList)) {
      if (String(payload.result) === "0") throw loginRequired();
      throw fail(502, "学习通课程数据暂不可用，请稍后重试。", "CHAOXING_PROTOCOL_CHANGED");
    }
    const result = new Map();
    for (const channel of payload.channelList) {
      const content = channel.content;
      const course = content?.course?.data?.[0];
      if (!course || !content.id || !course.id) continue;
      const row = { courseId: id(course.id), classId: id(content.id), name: String(course.name || "未命名课程"), teacher: String(course.teacherfactor || ""), className: String(content.name || "") };
      result.set(`${row.courseId}:${row.classId}`, row);
    }
    return [...result.values()];
  }

  async function courseActivities(jar, query) {
    const courseId = id(query.courseId), classId = id(query.classId);
    const course = (await courses(jar)).find(item => item.courseId === courseId && item.classId === classId);
    if (!course) throw fail(403, "该课程不属于当前学习通账号，请刷新课程列表。", "CHAOXING_COURSE_FORBIDDEN");
    const payload = await json(jar, apiUrl("/v2/apis/active/student/activelist", { courseId, classId, fid: 0, showNotStartedActive: 0 }));
    if (!Array.isArray(payload.data?.activeList)) throw fail(502, "学习通活动列表暂不可用。", "CHAOXING_PROTOCOL_CHANGED");
    return { course, ext: payload.data.ext || {}, items: payload.data.activeList.filter(item => [2, 74].includes(Number(item.type))) };
  }

  function activitySummary(activity, course) {
    const type = String(activity.otherId ?? ""), recordStatus = Number(activity.userStatus ?? -1);
    return { id: id(activity.id), courseId: course.courseId, classId: course.classId, name: String(activity.nameOne || activity.name || TYPE_TEXT[type] || "签到"), type,
      typeText: TYPE_TEXT[type] || "其他签到", active: Number(activity.status) === 1, startTime: milliseconds(activity.startTime), endTime: milliseconds(activity.endTime),
      recordStatus, recordText: STATUS_TEXT[recordStatus] || "待查询", signed: [1, 2, 9].includes(recordStatus) };
  }

  async function attend(jar, activeId) {
    const payload = await json(jar, apiUrl("/v2/apis/sign/getAttendInfo", { activeId }));
    if (String(payload.result) !== "1" || payload.data?.status === undefined) throw fail(502, "暂时无法查询官方签到记录，请稍后刷新。", "CHAOXING_RECORD_UNAVAILABLE");
    const recordStatus = Number(payload.data.status);
    return { recordStatus, recordText: STATUS_TEXT[recordStatus] || "未知状态", signed: [1, 2, 9].includes(recordStatus) };
  }

  async function detail(jar, query) {
    const listing = await courseActivities(jar, query);
    const activeId = id(query.activeId);
    const activity = listing.items.find(item => String(item.id) === activeId);
    if (!activity) throw fail(404, "当前课程中未找到该签到活动，请刷新列表。", "CHAOXING_ACTIVITY_NOT_FOUND");
    const payload = await json(jar, apiUrl("/v2/apis/active/getPPTActiveInfo", { activeId }));
    if (String(payload.result) !== "1" || !payload.data) throw fail(502, "学习通活动详情暂不可用。", "CHAOXING_PROTOCOL_CHANGED");
    const info = payload.data;
    const type = String(info.otherId ?? activity.otherId ?? "");
    const requirements = [];
    if (enabled(info.openCheckFaceFlag)) requirements.push("人脸识别");
    const requiresCaptcha = enabled(info.ifNeedVCode) || enabled(info.showVCode);
    if (enabled(info.ifphoto)) requirements.push("现场照片");
    if (enabled(info.openPreventCheatFlag)) requirements.push("客户端校验");
    if (enabled(info.openCheckWeChatFlag)) requirements.push("微信校验");
    if (Number(activity.type) === 74) requirements.push("签退流程");
    if (!["0", "4"].includes(type)) requirements.push(TYPE_TEXT[type] || "专用签到流程");
    const record = await attend(jar, activeId);
    const now = milliseconds(info.nowTime) || Date.now();
    const endTime = milliseconds(info.endTime) || milliseconds(activity.endTime);
    const startTime = milliseconds(info.startTime) || milliseconds(activity.startTime);
    const active = Number(info.status ?? activity.status) === 1 && (!endTime || now <= endTime) && (!startTime || now >= startTime);
    const summary = { ...activitySummary(activity, listing.course), ...record, type, typeText: TYPE_TEXT[type] || "其他签到", active, startTime, endTime,
      locationText: String(info.locationText || ""), locationRange: Number(info.locationRange) > 0 ? Number(info.locationRange) : null,
      requiresCaptcha, requiresOfficial: requirements.length > 0, requirements, canSign: active && record.recordStatus === 0 && requirements.length === 0 };
    return { summary, ext: listing.ext };
  }

  return {
    async status(userId) {
      const row = await repository.getChaoxingSession(userId);
      return profileSummary(row ? sensitiveJson.decode(row.jar_json) : null);
    },
    async connect(userId, body) {
      if (!sensitiveJson.encrypted) throw fail(503, "校园服务尚未配置会话加密，暂时无法连接学习通。", "CHAOXING_ENCRYPTION_REQUIRED");
      return queue.run(userId, async () => {
        if (!Array.isArray(body.cookies) || !body.cookies.length || body.cookies.length > HOSTS.size) throw fail(400, "请先在官方页面完成学习通登录。", "CHAOXING_LOGIN_REQUIRED");
        const jar = emptySessionJar();
        for (const entry of body.cookies) {
          let url;
          try { url = new URL(entry.url); } catch { throw fail(400, "学习通会话格式无效。", "CHAOXING_INVALID_SESSION"); }
          if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password || typeof entry.value !== "string" || entry.value.length > 20000 || /[\r\n]/.test(entry.value)) {
            throw fail(400, "学习通会话格式无效。", "CHAOXING_INVALID_SESSION");
          }
          for (const value of entry.value.split(";")) rememberCookie(jar, parseSetCookie(`${value.trim()}; Secure; HttpOnly`, url.href, "chaoxing.com"));
        }
        const payload = await json(jar, PROFILE);
        const profile = payload.msg;
        if (!profile || !/^\d+$/.test(String(profile.puid || ""))) throw loginRequired();
        jar.meta = { profile: { uid: id(profile.puid), fid: String(profile.fid ?? 0), name: String(profile.name || "学习通用户"), school: String(profile.schoolname || "") }, connectedAt: new Date().toISOString() };
        await repository.upsertChaoxingSession(userId, sensitiveJson.encode(jar), new Date().toISOString());
        return profileSummary(jar);
      });
    },
    disconnect: userId => queue.run(userId, () => repository.deleteChaoxingSession(userId)),
    courses: userId => withSession(userId, courses),
    activities: (userId, query) => withSession(userId, async jar => {
      const listing = await courseActivities(jar, query);
      return listing.items.map(item => activitySummary(item, listing.course)).sort((a, b) => Number(b.active) - Number(a.active) || (b.startTime || 0) - (a.startTime || 0));
    }),
    detail: (userId, query) => withSession(userId, async jar => (await detail(jar, query)).summary),
    sign: (userId, body) => withSession(userId, async jar => {
      const { summary } = await detail(jar, body);
      if (summary.recordStatus !== 0) return { confirmed: summary.signed, message: `官方当前记录：${summary.recordText}。`, activity: summary };
      if (!summary.active) throw fail(409, "该签到尚未开始或已经结束，请刷新活动。", "CHAOXING_ACTIVITY_CLOSED");
      if (summary.requiresOfficial) return { confirmed: false, requiresOfficial: true, message: `该活动需要${summary.requirements.join("、")}，请在学习通客户端完成。`, activity: summary };
      const validate = body.validate ?? "";
      if (typeof validate !== "string" || validate.length > 8192) throw fail(400, "验证码结果无效，请重新验证。", "CHAOXING_INVALID_CAPTCHA");
      if (summary.requiresCaptcha && !validate) return { confirmed: false, requiresCaptcha: true, message: "请在 MY 内完成学习通安全验证后继续签到。", activity: summary };
      const location = summary.type === "4" ? normalizeChaoxingLocation(body.location) : null;
      const profile = jar.meta.profile;
      const preSign = apiUrl("/newsign/preSign", { courseId: summary.courseId, classId: summary.classId, activePrimaryId: summary.id, uid: profile.uid, general: 1, sys: 1, ls: 1, appType: 15, isTeacherViewOpen: 0 });
      await request(jar, preSign);
      const form = { activeId: summary.id, courseId: summary.courseId, uid: profile.uid, fid: profile.fid, name: profile.name, appType: "15", ifTiJiao: "1", clientip: "", useragent: "", objectId: "", validate, latitude: "-1", longitude: "-1", address: "" };
      if (location) {
        normalizeChaoxingLocation(location);
        // The public mini-program uses the legacy location field. locationResult is the native client's signed payload.
        Object.assign(form, { latitude: String(location.latitude), longitude: String(location.longitude), address: location.address, location: JSON.stringify(location) });
      }
      let result;
      try { result = (await request(jar, apiUrl("/pptSign/stuSignajax", form), { referer: preSign })).trim(); }
      catch (error) {
        if (error.code === "CHAOXING_LOGIN_REQUIRED") throw error;
        result = "unknown";
      }
      if (/^validate/i.test(result)) return { confirmed: false, requiresCaptcha: true, upstreamCode: "validate", message: "学习通要求安全验证，请在 MY 内完成验证后继续签到。", activity: summary };
      if (/^locationAuthError/i.test(result)) {
        const upstreamCode = /^locationAuthError(?:_[A-Za-z0-9-]{1,48})?/i.exec(result)[0];
        return { confirmed: false, upstreamCode, message: `学习通拒绝了定位请求（${upstreamCode}）。本次尚未确认签到，请保留此错误码以便排查。`, activity: { ...summary, canSign: false } };
      }
      if (/^\[face\]/i.test(result)) return { confirmed: false, requiresOfficial: true, upstreamCode: "face", message: "该活动要求人脸校验，MY 暂未接入此流程。", activity: summary };
      if (/^errorLocation/.test(result)) throw fail(409, "当前位置未通过签到范围校验，请核对地点后重新定位。", "CHAOXING_OUT_OF_RANGE");
      let record;
      try { record = await attend(jar, summary.id); }
      catch (error) {
        if (error.code === "CHAOXING_LOGIN_REQUIRED") throw error;
        return { confirmed: false, pending: true, message: "签到请求已发送，官方记录尚未确认，请先刷新结果。", activity: summary };
      }
      const activity = { ...summary, ...record, canSign: !record.signed && record.recordStatus === 0 };
      if (record.signed) return { confirmed: true, message: `官方已确认：${record.recordText}。`, activity };
      const pending = result === "unknown" || /^success/.test(result);
      const upstreamCode = /^[A-Za-z0-9_\[\]-]{1,80}$/.test(result) ? result : "unrecognized_response";
      return { confirmed: false, pending, upstreamCode, message: pending ? "官方签到记录尚未更新，请先刷新结果。" : `学习通未确认签到，请刷新官方记录。返回状态：${upstreamCode}。`, activity };
    })
  };
}
