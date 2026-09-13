import { HttpError } from "../lib/http.js";
import { KeyedSerialQueue } from "../lib/keyed-serial-queue.js";
import { buildChaoxingAutoSignFailure, chaoxingAutoSignPublic, normalizeChaoxingAutoSignCourse, normalizeChaoxingAutoSignLocation, normalizeChaoxingAutoSignTimes } from "../lib/chaoxing-auto-sign.js";
import { enqueueCampusNotification, sendCampusNotification } from "../lib/notification-client.js";
import { cookieHeaderFor, emptySessionJar, parseSetCookie, rememberCookie, updateJarFromResponse } from "../lib/session-jar.js";
import { randomUUID } from "node:crypto";

const MOBILE = "https://mobilelearn.chaoxing.com";
const PROFILE = "https://sso.chaoxing.com/apis/login/userLogin4Uname.do";
const COURSES = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
const SIGN_PROVIDER = "https://www.lovegcu.xyz";
const HOSTS = new Set(["passport2.chaoxing.com", "sso.chaoxing.com", "mooc1-api.chaoxing.com", "mobilelearn.chaoxing.com"]);
const STATUS_TEXT = { 0: "未签到", 1: "已签到", 2: "教师代签", 4: "请假", 5: "缺勤", 7: "病假", 8: "事假", 9: "迟到", 10: "早退", 11: "签到已过期", 12: "公假" };
const TYPE_TEXT = { 0: "普通签到", 2: "二维码签到", 3: "手势签到", 4: "位置签到", 5: "签到码签到" };
const AUTO_SIGN_LOCK_MS = 5 * 60 * 1000;
// 每个时刻最多核对几个活动的官方记录，避免列表状态不可靠时无限请求。
const AUTO_SIGN_MAX_RECORD_CHECKS = 5;
// 活动列表里进行中的活动数量有限，仍然限制一次刷新的核对次数。
const ACTIVITY_RECORD_REFRESH_LIMIT = 5;

function fail(status, message, code) { return new HttpError(status, message, null, code); }
function loginRequired() { return fail(409, "学习通登录已失效，请重新连接学习通账号。", "CHAOXING_LOGIN_REQUIRED"); }
function providerLoginRequired() { return fail(409, "帮你签服务登录已失效，请重新连接帮你签服务。", "CHAOXING_PROVIDER_LOGIN_REQUIRED"); }
function providerProtocolChanged(stage = "") { return fail(502, "帮你签服务返回的数据不完整，请稍后重试。", `CHAOXING_PROVIDER_PROTOCOL_CHANGED${stage ? `_${stage}` : ""}`); }
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
    connectedAt: jar?.meta?.connectedAt || null,
    signProviderConnected: Boolean(jar?.meta?.signProvider && !jar.meta.signProvider.expired && !jar.meta.expired)
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

export function createChaoxingService({ repository, sensitiveJson, readUpstreamText, fetchImpl = fetch, logger = null }) {
  const queue = new KeyedSerialQueue();

  // 定时签到复用已保存的定位，因此只校验结构，不再校验定位时效。
  function storedChaoxingLocation(value) {
    if (!value || typeof value !== "object") throw fail(400, "请先保存签到位置。", "CHAOXING_LOCATION_REQUIRED");
    return normalizeChaoxingLocation({ ...value, timestamp: Date.now() }, Date.now());
  }

  async function signProviderConnectedFor(userId) {
    const row = await repository.getChaoxingSession(userId);
    return profileSummary(row ? sensitiveJson.decode(row.jar_json) : null).signProviderConnected;
  }

  // 断开学习通或帮你签后无法再自动签到，关闭开关避免每个时刻都推送失败。
  async function disableAutoSign(userId, timestamp) {
    const row = await repository.getChaoxingAutoSign(userId);
    if (row?.enabled) await repository.upsertChaoxingAutoSign(userId, { enabled: false }, timestamp);
  }

  async function request(jar, rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) {
      throw fail(400, "学习通请求地址无效。", "CHAOXING_INVALID_URL");
    }
    const headers = { accept: "application/json, text/plain, */*", referer: MOBILE, "user-agent": "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Mobile Safari/537.36 MY-Control" };
    const cookie = cookieHeaderFor(jar, url.href);
    if (cookie) headers.cookie = cookie;
    let response;
    try {
      response = await fetchImpl(url.href, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
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

  async function json(jar, url) {
    const text = await request(jar, url);
    try { return JSON.parse(text); } catch { throw fail(502, "学习通返回的数据格式发生变化，请使用官方客户端。", "CHAOXING_PROTOCOL_CHANGED"); }
  }

  async function providerRequest(path, { method = "GET", query = {}, body } = {}) {
    const url = new URL(path, SIGN_PROVIDER);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const loginFailed = () => fail(409, "帮你签连接失败，请核对学习通账号和密码后重试。", "CHAOXING_PROVIDER_LOGIN_FAILED");
    try {
      const response = await fetchImpl(url.href, {
        method, headers: { accept: "application/json", "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(15000)
      });
      if (response.status === 401 || response.status === 403) throw path === "/http/chaoxing" ? loginFailed() : providerLoginRequired();
      if (!response.ok) throw fail(502, "帮你签服务暂时不可用，请稍后重试。", "CHAOXING_PROVIDER_UNAVAILABLE");
      const text = await readUpstreamText(response);
      let payload;
      try { payload = JSON.parse(text); } catch { throw providerProtocolChanged("JSON"); }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw providerProtocolChanged("ENVELOPE");
      if (!enabled(payload.success)) {
        if (path === "/http/chaoxing") throw loginFailed();
        const message = String(payload.message || "");
        if (/登录|cookie|session/i.test(message)) throw providerLoginRequired();
        if (/(?:次数|积分|时长|余额).*(?:不足|不够|用完|耗尽)/.test(message)) {
          throw fail(409, "帮你签可用次数不足，请在小程序中补充后重试。", "CHAOXING_PROVIDER_QUOTA_EXHAUSTED");
        }
        throw fail(502, "帮你签服务未能处理请求，请稍后重试。", "CHAOXING_PROVIDER_REJECTED");
      }
      return payload.data;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw fail(502, "帮你签服务连接超时或网络异常，请稍后重试。", "CHAOXING_PROVIDER_NETWORK_ERROR");
    }
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
        if (error.code === "CHAOXING_PROVIDER_LOGIN_REQUIRED" && jar.meta.signProvider) jar.meta.signProvider.expired = true;
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

  async function activitiesForCourse(jar, course) {
    const payload = await json(jar, apiUrl("/v2/apis/active/student/activelist", { courseId: course.courseId, classId: course.classId, fid: 0, showNotStartedActive: 0 }));
    if (!Array.isArray(payload.data?.activeList)) throw fail(502, "学习通活动列表暂不可用。", "CHAOXING_PROTOCOL_CHANGED");
    return { course, ext: payload.data.ext || {}, items: payload.data.activeList.filter(item => [2, 74].includes(Number(item.type))) };
  }

  async function courseActivities(jar, query) {
    const courseId = id(query.courseId), classId = id(query.classId);
    const course = (await courses(jar)).find(item => item.courseId === courseId && item.classId === classId);
    if (!course) throw fail(403, "该课程不属于当前学习通账号，请刷新课程列表。", "CHAOXING_COURSE_FORBIDDEN");
    return activitiesForCourse(jar, course);
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

  // 活动列表的 userStatus 与实际签到记录并不总是一致，凡是判断“是否已签”都用官方记录接口。
  async function officialRecordStatus(jar, activeId) {
    try {
      return (await attend(jar, activeId)).recordStatus;
    } catch (error) {
      if (error.code === "CHAOXING_LOGIN_REQUIRED") throw error;
      return null;
    }
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

  // 指定课程后只读取该课程，避免遍历全部课程。
  async function autoSignScope(jar, row) {
    let saved = null;
    try {
      saved = normalizeChaoxingAutoSignCourse(row?.course);
    } catch {
      throw fail(409, "定时签到保存的课程信息无效，请重新选择课程。", "CHAOXING_AUTO_SIGN_COURSE_INVALID");
    }
    const available = await courses(jar);
    if (!saved) return { courses: available, scoped: null };
    const match = available.find(item => item.courseId === saved.courseId && item.classId === saved.classId);
    if (!match) throw fail(409, "定时签到指定的课程已不在当前学习通账号中，请重新选择课程。", "CHAOXING_AUTO_SIGN_COURSE_NOT_FOUND");
    return { courses: [match], scoped: match };
  }

  async function autoSignCandidates(jar, row) {
    const scope = await autoSignScope(jar, row);
    const candidates = [];
    let lastError = null;
    for (const course of scope.courses) {
      let listing;
      try {
        listing = await activitiesForCourse(jar, course);
      } catch (error) {
        if (error.code === "CHAOXING_LOGIN_REQUIRED") throw error;
        lastError = error;
        continue;
      }
      for (const item of listing.items) {
        const summary = activitySummary(item, course);
        // 列表状态只用于排序（列表显示未签到的先核对），是否已签一律由官方记录决定。
        if (summary.active) candidates.push({ ...summary, courseName: course.name });
      }
    }
    // 单个课程读取失败不该让整轮看起来“没有待签到活动”。
    if (!candidates.length && lastError) throw lastError;
    return {
      candidates: candidates.sort((left, right) => Number(right.recordStatus === 0) - Number(left.recordStatus === 0) || (right.startTime || 0) - (left.startTime || 0)),
      scoped: scope.scoped
    };
  }

  async function pickUnsignedCandidate(jar, candidates) {
    for (const candidate of candidates.slice(0, AUTO_SIGN_MAX_RECORD_CHECKS)) {
      const recordStatus = await officialRecordStatus(jar, candidate.id);
      if (recordStatus === null) {
        if (candidate.recordStatus === 0) return candidate;
        continue;
      }
      if (recordStatus === 0) return candidate;
    }
    return null;
  }

  async function submitProviderSign(jar, summary, { location, validate = "" }) {
    const provider = jar.meta.signProvider;
    if (!provider) throw fail(409, "请先连接帮你签服务后再签到。", "CHAOXING_SIGN_PROVIDER_REQUIRED");
    if (provider.expired || provider.uid !== jar.meta.profile.uid) throw providerLoginRequired();
    const quota = await providerRequest("/xxt/times/getTimesByphone", { query: { phone: provider.phone, user: "liyasuo" } });
    const remaining = quota?.one?.times;
    if (remaining === undefined || remaining === null || String(remaining).trim() === "" || !Number.isFinite(Number(remaining))) throw providerProtocolChanged();
    if (Number(remaining) <= 0) throw fail(409, "帮你签可用次数不足，请在小程序中补充后重试。", "CHAOXING_PROVIDER_QUOTA_EXHAUSTED");
    await providerRequest("/xxt/schedule/preSign", { query: { aid: summary.id, phone: provider.phone, classId: summary.classId, courseId: summary.courseId } });
    const details = await providerRequest("/http/getPPTActiveInfo", { method: "POST", body: { activeId: summary.id, phone: provider.phone } });
    let info;
    try { info = JSON.parse(details?.resp); } catch { throw providerProtocolChanged(); }
    if (String(info?.result) !== "1" || !info.data) {
      if (/登录|cookie|session/i.test(String(info?.msg || info?.message || ""))) throw providerLoginRequired();
      throw providerProtocolChanged();
    }
    if (String(info.data.otherId) !== "4") throw fail(409, "签到活动信息已变化，请刷新活动后重试。", "CHAOXING_ACTIVITY_CHANGED");
    if ([info.data.openCheckFaceFlag, info.data.ifphoto, info.data.openPreventCheatFlag, info.data.openCheckWeChatFlag].some(enabled)) {
      throw fail(409, "该活动要求附加校验，当前帮你签接入尚未支持此流程。", "CHAOXING_OFFICIAL_REQUIRED");
    }
    if ((enabled(info.data.ifNeedVCode) || enabled(info.data.showVCode)) && !validate) {
      return { confirmed: false, requiresCaptcha: true, message: "请在 MY 内完成学习通安全验证后继续签到。", activity: { ...summary, requiresCaptcha: true } };
    }
    let result;
    try {
      const data = await providerRequest("/http/kechengweizhi", { method: "POST", body: {
        address: location.address, aid: summary.id, fid: provider.fid, latitude: location.latitude, longitude: location.longitude,
        name: provider.name, phone: provider.phone, uid: provider.uid, validate
      } });
      result = typeof data?.result === "string" ? data.result.trim() : "unknown";
    } catch (error) {
      if (["CHAOXING_PROVIDER_LOGIN_REQUIRED", "CHAOXING_PROVIDER_QUOTA_EXHAUSTED"].includes(error.code)) throw error;
      result = "unknown";
    }
    if (/登录|cookie|session/i.test(result)) throw providerLoginRequired();
    if (/^validate/i.test(result)) return { confirmed: false, requiresCaptcha: true, upstreamCode: "validate", message: "学习通要求安全验证，请在 MY 内完成验证后继续签到。", activity: summary };
    if (/^locationAuthError/i.test(result)) {
      const upstreamCode = /^locationAuthError(?:_[A-Za-z0-9-]{1,48})?/i.exec(result)[0];
      return { confirmed: false, upstreamCode, message: `学习通拒绝了定位请求（${upstreamCode}）。请刷新官方记录，并在帮你签小程序中核对服务状态。`, activity: { ...summary, canSign: false } };
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
    return { confirmed: false, pending, upstreamCode: "unrecognized_response",
      message: pending ? "官方签到记录尚未更新，请先刷新结果。" : "学习通未确认签到，请刷新官方记录。", activity };
  }

  async function runAutoSign(jar, row) {
    const empty = { courseName: "", activityName: "", activityId: "" };
    const scopedName = String(row?.course?.name || "").trim().slice(0, 120);
    const failed = (message, target = empty) => ({ ...empty, ...target, status: "failed", message });
    let location;
    try {
      location = storedChaoxingLocation(row?.location);
    } catch (error) {
      return failed(error.message || "保存的签到位置无效，请重新定位并保存。");
    }
    const provider = jar.meta.signProvider;
    if (!provider || provider.expired || provider.uid !== jar.meta.profile.uid) {
      return failed("「帮你签」服务未连接或已失效，请重新连接后等待下一次定时签到。");
    }
    let plan;
    try {
      plan = await autoSignCandidates(jar, row);
    } catch (error) {
      if (error.code === "CHAOXING_LOGIN_REQUIRED") jar.meta.expired = true;
      return failed(error.message || "无法读取学习通课程活动。", { ...empty, courseName: scopedName });
    }
    if (!plan.candidates.length) {
      return { ...empty, courseName: plan.scoped?.name || "", status: "skipped",
        message: plan.scoped ? `「${plan.scoped.name}」中没有进行中的签到活动。` : "当前没有进行中的签到活动。" };
    }
    let candidate;
    try {
      candidate = await pickUnsignedCandidate(jar, plan.candidates);
    } catch (error) {
      if (error.code === "CHAOXING_LOGIN_REQUIRED") jar.meta.expired = true;
      return failed(error.message || "无法读取学习通签到记录。", { ...empty, courseName: plan.scoped?.name || scopedName });
    }
    if (!candidate) {
      const total = plan.candidates.length;
      return { ...empty, courseName: plan.scoped?.name || "", status: "skipped",
        message: plan.scoped ? `「${plan.scoped.name}」中 ${total} 个进行中的活动都已签到。` : `${total} 个进行中的活动都已签到。` };
    }
    const target = { courseName: candidate.courseName, activityName: candidate.name, activityId: candidate.id };
    let summary;
    try {
      ({ summary } = await detail(jar, { courseId: candidate.courseId, classId: candidate.classId, activeId: candidate.id }));
    } catch (error) {
      if (error.code === "CHAOXING_LOGIN_REQUIRED") jar.meta.expired = true;
      return failed(error.message || "无法读取签到活动详情。", target);
    }
    if (summary.recordStatus !== 0) return { ...target, status: "skipped", message: `最新活动「${summary.name}」当前记录为${summary.recordText}。` };
    if (!summary.active) return { ...target, status: "skipped", message: `最新活动「${summary.name}」尚未开始或已经结束。` };
    if (summary.type !== "4" || summary.requiresOfficial) {
      const need = summary.requirements.length ? summary.requirements.join("、") : summary.typeText;
      return failed(`最新活动「${summary.name}」需要${need}，请在帮你签小程序或学习通客户端手动完成。`, target);
    }
    try {
      const outcome = await submitProviderSign(jar, summary, { location });
      return { ...target, status: outcome.confirmed ? "success" : "failed", message: outcome.message || "自动签到未能完成。" };
    } catch (error) {
      if (error.code === "CHAOXING_LOGIN_REQUIRED") jar.meta.expired = true;
      if (error.code === "CHAOXING_PROVIDER_LOGIN_REQUIRED" && jar.meta.signProvider) jar.meta.signProvider.expired = true;
      return failed(error.message || "自动签到失败，请稍后重试。", target);
    }
  }

  async function notifyAutoSignFailure(userId, row, result, { runKey = "" } = {}) {
    const preference = await repository.getReminderPreference(userId);
    const notice = buildChaoxingAutoSignFailure(result, {
      userId,
      runKey,
      appId: String(row?.notify_app_id || preference?.app_recipient_id || "").trim(),
      wecomId: String(preference?.recipient_id || row?.notify_wecom_id || "").trim()
    });
    if (!notice) {
      if (logger) logger.warn("chaoxing_auto_sign_notify_skipped", { userId, reason: "no_recipient" });
      return null;
    }
    const requestId = `chaoxing-auto-sign-${randomUUID()}`;
    return notice.kind === "legacy"
      ? enqueueCampusNotification(notice.payload, { requestId })
      : sendCampusNotification(notice.payload, { requestId });
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
        const previous = await repository.getChaoxingSession(userId);
        const signProvider = previous ? sensitiveJson.decode(previous.jar_json)?.meta?.signProvider : null;
        if (signProvider?.uid === jar.meta.profile.uid) jar.meta.signProvider = signProvider;
        await repository.upsertChaoxingSession(userId, sensitiveJson.encode(jar), new Date().toISOString());
        return profileSummary(jar);
      });
    },
    disconnect: userId => queue.run(userId, async () => {
      await repository.deleteChaoxingSession(userId);
      await disableAutoSign(userId, new Date().toISOString());
    }),
    connectSignProvider: (userId, body) => withSession(userId, async jar => {
      if (!sensitiveJson.encrypted) throw fail(503, "校园服务尚未配置会话加密，暂时无法连接帮你签服务。", "CHAOXING_ENCRYPTION_REQUIRED");
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const password = body.password;
      if (!phone || phone.length > 128 || typeof password !== "string" || !password || password.length > 1024) {
        throw fail(400, "请输入学习通账号和密码。", "CHAOXING_PROVIDER_INVALID_CREDENTIALS");
      }
      const data = await providerRequest("/http/chaoxing", { method: "POST", body: { phone, password } });
      const profile = data?.result;
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw providerProtocolChanged("LOGIN_RESULT");
      if (!/^\d{1,20}$/.test(String(profile.uid ?? ""))) throw providerProtocolChanged(`UID_${profile.uid == null ? "MISSING" : typeof profile.uid}`.toUpperCase());
      if (String(profile.uid) !== jar.meta.profile.uid) {
        throw fail(409, "账号不一致，请使用与当前已连接学习通相同的账号。", "CHAOXING_PROVIDER_ACCOUNT_MISMATCH");
      }
      const account = typeof profile.phone === "number" ? String(profile.phone) : profile.phone;
      if (typeof account !== "string" || !account.trim() || account.length > 128) throw providerProtocolChanged(`PHONE_${profile.phone == null ? "MISSING" : typeof profile.phone}`.toUpperCase());
      // The mini program passes dxfid through as an optional value; it is not the account identity.
      if (profile.dxfid != null && !["string", "number"].includes(typeof profile.dxfid)) throw providerProtocolChanged("FID_TYPE");
      // The provider keeps its own login session; MY only retains the identity needed for signing.
      jar.meta.signProvider = { phone: account.trim(), uid: String(profile.uid), fid: profile.dxfid, name: String(profile.realname || jar.meta.profile.name) };
      return profileSummary(jar);
    }),
    disconnectSignProvider: userId => withSession(userId, async jar => {
      delete jar.meta.signProvider;
      await disableAutoSign(userId, new Date().toISOString());
      return profileSummary(jar);
    }),
    courses: userId => withSession(userId, courses),
    activities: (userId, query) => withSession(userId, async jar => {
      const listing = await courseActivities(jar, query);
      const items = listing.items.map(item => activitySummary(item, listing.course)).sort((a, b) => Number(b.active) - Number(a.active) || (b.startTime || 0) - (a.startTime || 0));
      // 进行中的活动以官方记录为准，否则列表可能把没签到的活动显示成已签到。
      await Promise.all(items.filter(item => item.active).slice(0, ACTIVITY_RECORD_REFRESH_LIMIT).map(async item => {
        const recordStatus = await officialRecordStatus(jar, item.id);
        if (recordStatus === null) return;
        item.recordStatus = recordStatus;
        item.recordText = STATUS_TEXT[recordStatus] || item.recordText;
        item.signed = [1, 2, 9].includes(recordStatus);
      }));
      return items;
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
      if (summary.type !== "4") return { confirmed: false, requiresOfficial: true, message: "该签到类型请在帮你签小程序或学习通客户端完成。", activity: summary };
      return submitProviderSign(jar, summary, { location: normalizeChaoxingLocation(body.location), validate });
    }),
    async autoSignSettings(userId) {
      const [row, session] = await Promise.all([repository.getChaoxingAutoSign(userId), repository.getChaoxingSession(userId)]);
      const summary = profileSummary(session ? sensitiveJson.decode(session.jar_json) : null);
      return chaoxingAutoSignPublic(row, { signProviderConnected: summary.signProviderConnected });
    },
    async saveAutoSign(userId, body = {}, { platformUserId = "" } = {}) {
      const enabled = body.enabled === true;
      const current = await repository.getChaoxingAutoSign(userId);
      const times = body.times === undefined ? current?.times : body.times;
      const location = body.location === undefined ? current?.location : body.location;
      // 后台调度器没有 App 会话，失败提醒的收件人必须在保存时固化下来。
      const preference = await repository.getReminderPreference(userId);
      const changes = {
        enabled,
        notify_app_id: String(platformUserId || current?.notify_app_id || preference?.app_recipient_id || "").trim(),
        notify_wecom_id: String(preference?.recipient_id || current?.notify_wecom_id || "").trim()
      };
      if (times !== undefined || enabled) changes.times = normalizeChaoxingAutoSignTimes(times, { allowEmpty: !enabled });
      if (location !== undefined || enabled) changes.location = normalizeChaoxingAutoSignLocation(location);
      // 未提交 course 时保留原选择；提交 null 表示回到全部课程。
      changes.course = body.course === undefined ? (current?.course ?? null) : normalizeChaoxingAutoSignCourse(body.course);
      const row = await repository.upsertChaoxingAutoSign(userId, changes, new Date().toISOString());
      return chaoxingAutoSignPublic(row, { signProviderConnected: await signProviderConnectedFor(userId) });
    },
    async autoSign(userId, { runKey = "", manual = false } = {}) {
      const now = new Date();
      const lockUntil = new Date(now.getTime() + AUTO_SIGN_LOCK_MS).toISOString();
      const claimed = manual
        ? await repository.claimChaoxingAutoSignLock(userId, now.toISOString(), lockUntil)
        : await repository.claimChaoxingAutoSignRun(userId, runKey, now.toISOString(), lockUntil);
      if (!claimed) return { status: "skipped", message: "本次定时签到已经执行或正在执行。", courseName: "", activityName: "", activityId: "" };
      let result;
      let row = null;
      try {
        result = await withSession(userId, async jar => {
          row = await repository.getChaoxingAutoSign(userId);
          const outcome = row?.enabled
            ? await runAutoSign(jar, row)
            : { status: "skipped", message: "定时签到未开启。", courseName: "", activityName: "", activityId: "" };
          await repository.finishChaoxingAutoSignRun(userId, outcome, new Date().toISOString());
          return outcome;
        });
      } catch (error) {
        result = { status: "failed", message: error?.message || "定时签到执行失败。", courseName: "", activityName: "", activityId: "" };
        await repository.finishChaoxingAutoSignRun(userId, result, new Date().toISOString()).catch(() => {});
      }
      if (result.status === "failed") {
        try { await notifyAutoSignFailure(userId, row, result, { runKey }); }
        catch (error) { if (logger) logger.warn("chaoxing_auto_sign_notify_failed", { userId, error: error?.message }); }
      }
      return result;
    }
  };
}
