import {
  autoReservationRunPlan,
  executeAutoReservationCandidates,
  normalizeAutoReservationTaskInput
} from "../lib/libroom-auto-reservation.js";
import {
  cachedLibrarySeatToken,
  createLibrarySeatClient,
  LIBRARY_SEAT_API_BASE,
  LIBRARY_SEAT_CAS_SERVICE_URL,
  LIBRARY_SEAT_ORIGIN,
  librarySeatTokenFromOfficialUrl
} from "../lib/library-seat.js";
import { casServiceFromTicketRedirect } from "../lib/uias-cas.js";
import {
  clearLibroomLastError,
  createLibroomClient,
  exchangeLibroomMemberToken,
  LIBROOM_ORIGIN,
  libroomRequiresCasTicket,
  resolveLibroomCasCallback
} from "../lib/libroom.js";
import { DAY_MS } from "../lib/academic-config.js";
import { discardUpstreamResponse } from "../lib/upstream-response.js";
import { HttpError } from "../lib/http.js";
import { isCookieExpired, mergeSessionJars } from "../lib/session-jar.js";
import { KeyedSerialQueue } from "../lib/keyed-serial-queue.js";
import {
  librarySeatWaitlistRunInput,
  librarySeatWaitlistRunPlan,
  librarySeatWaitlistTimes,
  normalizeLibrarySeatWaitlistInput,
  scanLibrarySeatWaitlist
} from "../lib/library-seat-waitlist.js";
import { normalizeHtmlText } from "../lib/academic-parsers.js";
import { randomUUID } from "node:crypto";
import { sendCampusNotification } from "../lib/notification-client.js";

export function createReservationService({
  assertAllowedSchoolUrl,
  CAS_ORIGIN,
  casLoginRequiredMessage,
  currentUserId,
  ensureWebvpnSession,
  extractWebvpnVerifyUrl,
  fetchLibroomWithWebvpn,
  fetchWithJar,
  followRedirectsWithJar,
  getCasTicketRedirect,
  getLibroomCasLoginOptions,
  isCasLoginRequiredError,
  logger,
  loginCasService,
  looksLikeCasLoginHtml,
  markCasFailureIfNeeded,
  nowIso,
  parseJsonLike,
  readSessionJar,
  readUpstreamText,
  repository,
  requestLibroomJsonWithWebvpn,
  savedSchoolReloginCredentials,
  saveSessionJar,
}) {
  const LIBROOM_AUTO_RESERVATION_LOCK_MS = 2 * 60 * 1000;

  const LIBRARY_SEAT_WAITLIST_MAX_SCAN_ATTEMPTS = 3;

  const libroomSessionQueue = new KeyedSerialQueue();

  const librarySeatSessionQueue = new KeyedSerialQueue();

  function libroomTokenExpiry(token, capturedAt = Date.now()) {
    try {
      const payload = JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64url").toString("utf8"));
      const expiresAt = Number(payload.exp) * 1000;
      if (Number.isFinite(expiresAt) && expiresAt > capturedAt) return new Date(expiresAt).toISOString();
    } catch {
      // 非 JWT token 使用下面的短期兜底过期时间。
    }
    return new Date(capturedAt + 10 * 60 * 1000).toISOString();
  }

  function cachedLibroomToken(jar) {
    const session = jar.meta?.libroom;
    if (!session?.token || !session.expiresAt) return "";
    return Date.parse(session.expiresAt) > Date.now() + 30_000 ? String(session.token) : "";
  }

  function tagLibroomStage(error, stage) {
    if (error && typeof error === "object" && !error.libroomStage) error.libroomStage = stage;
    return error;
  }

  function libroomFailureLog(error) {
    return {
      stage: error?.libroomStage || null,
      status: error?.status || null,
      code: error?.code || null,
      message: error?.message || null
    };
  }

  function upstreamUrlShape(value) {
    try {
      const url = new URL(String(value || ""));
      const hashQuery = url.hash.includes("?") ? new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1)) : null;
      return {
        origin: url.origin,
        pathname: url.pathname,
        searchKeys: [...url.searchParams.keys()],
        hashPath: url.hash ? url.hash.split("?")[0] : "",
        hashSearchKeys: hashQuery ? [...hashQuery.keys()] : []
      };
    } catch {
      return { invalid: true };
    }
  }

  async function resolveLibroomCasExchange(jar, credentials = {}) {
    let stage = "webvpn_session";
    try {
      await ensureWebvpnSession(jar, credentials);
      stage = "libroom_config";
      const casLoginOptions = await getLibroomCasLoginOptions(jar);
      stage = "cas_ticket";
      const finalUrl = await getCasTicketRedirect({ jar, ...credentials, ...casLoginOptions });
      const { ticket } = casServiceFromTicketRedirect(finalUrl);
      if (!ticket && libroomRequiresCasTicket(finalUrl)) {
        logger.warn("libroom_cas_redirect_missing_ticket", { userId: currentUserId(), redirect: upstreamUrlShape(finalUrl) });
        throw new HttpError(401, "学校预约入口未返回统一认证票据，请重新登录学校账号。", null, "LIBROOM_CAS_TICKET_REQUIRED");
      }

      stage = "libroom_callback";
      const callbackCas = await resolveLibroomCasCallback(finalUrl, {
        requestImpl: async (callbackUrl) => {
          const callback = await fetchLibroomWithWebvpn(jar, assertAllowedSchoolUrl(callbackUrl), {
            headers: {
              accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
              referer: `${CAS_ORIGIN}/cas/login`
            }
          });
          const status = callback.response.status;
          const location = status >= 300 && status < 400 ? callback.response.headers.get("location") : "";
          if (status >= 300 && status < 400) await discardUpstreamResponse(callback.response);
          return {
            status,
            location,
            finalUrl: callback.finalUrl,
            text: callback.text
          };
        }
      });
      if (!callbackCas) throw new HttpError(502, "图书馆预约系统未返回身份转换凭据。", null, "LIBROOM_CALLBACK_CAS_REQUIRED");
      return callbackCas;
    } catch (error) {
      throw tagLibroomStage(error, stage);
    }
  }

  async function issueLibroomMemberToken(jar, credentials = {}) {
    try {
      const callbackCas = await resolveLibroomCasExchange(jar, credentials);

      const token = await exchangeLibroomMemberToken({
        cas: callbackCas,
        requestImpl: (pathname, data, options) => requestLibroomJsonWithWebvpn(jar, pathname, data, options)
      });
      const capturedAt = Date.now();
      jar.meta ||= {};
      jar.meta.libroom = {
        token,
        capturedAt: new Date(capturedAt).toISOString(),
        expiresAt: libroomTokenExpiry(token, capturedAt)
      };
      clearLibroomLastError(jar.meta);
      if (jar.meta.cas) jar.meta.cas.lastError = null;
      return token;
    } catch (error) {
      throw tagLibroomStage(error, "member_token");
    }
  }

  async function getLibroomMemberToken({ force = false } = {}) {
    return libroomSessionQueue.run(currentUserId(), async () => {
      const jar = await readSessionJar();
      if (!force) {
        const cached = cachedLibroomToken(jar);
        if (cached) return cached;
      }
      try {
        const token = await issueLibroomMemberToken(jar);
        await saveSessionJar(jar);
        return token;
      } catch (error) {
        logger.warn("libroom_member_token_failed", { userId: currentUserId(), ...libroomFailureLog(error) });
        markCasFailureIfNeeded(jar, error);
        jar.meta ||= {};
        jar.meta.libroom = {
          lastError: isCasLoginRequiredError(error)
            ? casLoginRequiredMessage(error)
            : (error.message || "空间预约会话已过期，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  async function getLibroomOfficialLoginUrl() {
    return libroomSessionQueue.run(currentUserId(), async () => {
      const jar = await readSessionJar();
      try {
        const callbackCas = await resolveLibroomCasExchange(jar);
        await saveSessionJar(jar);
        const officialUrl = new URL("/h5/index.html", LIBROOM_ORIGIN);
        officialUrl.hash = `#/cas/?cas=${encodeURIComponent(callbackCas)}`;
        return officialUrl.href;
      } catch (error) {
        logger.warn("libroom_official_login_failed", { userId: currentUserId(), ...libroomFailureLog(error) });
        markCasFailureIfNeeded(jar, error);
        jar.meta ||= {};
        jar.meta.libroom = {
          lastError: isCasLoginRequiredError(error)
            ? casLoginRequiredMessage(error)
            : (error.message || "空间预约官方入口打开失败，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  const LIBROOM_OFFICIAL_WEBVIEW_COOKIE_HOSTS = new Set([
    "cas.hgu.edu.cn",
    "webvpn.hgu.edu.cn",
    "libroom.hgu.edu.cn",
    "libic.hgu.edu.cn"
  ]);

  function officialWebViewCookieApplies(cookie) {
    if (!cookie || isCookieExpired(cookie)) return false;
    const domain = String(cookie.domain || "").toLowerCase();
    if (domain === "hgu.edu.cn") return !cookie.hostOnly;
    return LIBROOM_OFFICIAL_WEBVIEW_COOKIE_HOSTS.has(domain);
  }

  function serializeOfficialWebViewCookie(cookie) {
    const pieces = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path || "/"}`];
    if (!cookie.hostOnly) pieces.push(`Domain=${cookie.domain}`);
    const expiresAt = Date.parse(cookie.expiresAt || "");
    if (Number.isFinite(expiresAt)) pieces.push(`Expires=${new Date(expiresAt).toUTCString()}`);
    if (cookie.secure) pieces.push("Secure");
    if (cookie.httpOnly) pieces.push("HttpOnly");
    return pieces.join("; ");
  }

  function officialWebViewCookies(jar) {
    const cookies = [];
    for (const domainCookies of Object.values(jar.cookies || {})) {
      for (const cookie of Object.values(domainCookies || {})) {
        if (!officialWebViewCookieApplies(cookie)) continue;
        cookies.push({
          url: `https://${String(cookie.domain || "").toLowerCase()}/`,
          value: serializeOfficialWebViewCookie(cookie)
        });
      }
    }
    return cookies.sort((a, b) => a.url.localeCompare(b.url));
  }

  async function getLibroomOfficialWebViewLogin() {
    return libroomSessionQueue.run(currentUserId(), async () => {
      const jar = await readSessionJar();
      try {
        const callbackCas = await resolveLibroomCasExchange(jar);
        await saveSessionJar(jar);
        const officialUrl = new URL("/h5/index.html", LIBROOM_ORIGIN);
        officialUrl.hash = `#/cas/?cas=${encodeURIComponent(callbackCas)}`;
        return {
          url: officialUrl.href,
          cookies: officialWebViewCookies(jar)
        };
      } catch (error) {
        logger.warn("libroom_official_webview_login_failed", { userId: currentUserId(), ...libroomFailureLog(error) });
        markCasFailureIfNeeded(jar, error);
        jar.meta ||= {};
        jar.meta.libroom = {
          lastError: isCasLoginRequiredError(error)
            ? casLoginRequiredMessage(error)
            : (error.message || "空间预约官方入口打开失败，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  async function requestLibrarySeatJson(jar, pathname, data = {}, { token = "" } = {}) {
    const response = await fetchWithJar(`${LIBRARY_SEAT_API_BASE}${pathname}`, {
      jar,
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        loginType: "PC",
        origin: LIBRARY_SEAT_ORIGIN,
        referer: `${LIBRARY_SEAT_ORIGIN}/jsq-v/`,
        ...(token ? { token } : {})
      },
      body: JSON.stringify(data || {})
    });
    const text = await readUpstreamText(response);
    let payload;
    try {
      payload = parseJsonLike(text || "{}");
    } catch {
      throw new HttpError(502, "座位预约系统返回的 JSON 结构不符合预期。", {
        endpoint: pathname,
        sample: normalizeHtmlText(text).slice(0, 200)
      });
    }
    return { payload, status: response.status, ok: response.ok };
  }

  async function resolveLibrarySeatEntrance(jar, credentials = {}) {
    await ensureWebvpnSession(jar, credentials);

    // 与 SPA 系统配置（CASSSERVICE）一致：走官方“统一登录”入口换票，
    // 最终落在 https://libic.hgu.edu.cn/jsq-v/#/login?token=<JWT>，
    // token 位于 URL 片段中，SPA 从 location.href 读取后换取成员令牌。
    const loginUrl = LIBRARY_SEAT_CAS_SERVICE_URL;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const followed = await followRedirectsWithJar(loginUrl, jar, {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          referer: `${CAS_ORIGIN}/cas/login`
        }
      });
      const finalUrl = followed.url;
      const html = await readUpstreamText(followed.response);

      const entranceToken = librarySeatTokenFromOfficialUrl(finalUrl);
      if (entranceToken) {
        return { callbackUrl: finalUrl, entranceUrl: finalUrl, entranceToken };
      }

      const verifyUrl = extractWebvpnVerifyUrl(html, finalUrl);
      if (verifyUrl) {
        // 网关先返回 locationUrl=verify 壳页：跟随 verify 建立站点会话后重试。
        await followRedirectsWithJar(verifyUrl, jar, {
          method: "GET",
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            referer: finalUrl
          }
        });
        continue;
      }

      if (looksLikeCasLoginHtml(html, finalUrl)) {
        const serviceUrl = new URL(finalUrl).searchParams.get("service") || LIBRARY_SEAT_CAS_SERVICE_URL;
        const logged = await loginCasService({ jar, ...credentials, serviceUrl });
        await discardUpstreamResponse(logged.response).catch(() => {});
        continue;
      }

      break;
    }

    throw new HttpError(401, "座位预约官方入口未返回登录票据，请重新登录学校账号。", null, "LIBRARY_SEAT_CAS_TOKEN_REQUIRED");
  }

  async function issueLibrarySeatMemberToken(jar, credentials = {}) {
    try {
      const { entranceToken } = await resolveLibrarySeatEntrance(jar, credentials);
      const response = await requestLibrarySeatJson(jar, `/static/public/auth/cas/${encodeURIComponent(entranceToken)}`, {
        token: entranceToken,
        loginType: "PC"
      });
      const payload = response.payload || {};
      const token = String(
        payload?.data?.token
        || payload?.data?.accessToken
        || payload?.token
        || payload?.data?.userInfo?.token
        || ""
      ).trim();
      if (!response.ok || (payload?.code !== undefined && Number(payload.code) !== 200 && payload.status !== true) || !token) {
        throw new HttpError(
          response.ok ? 401 : response.status,
          payload?.message || payload?.msg || payload?.error || "座位预约身份转换失败。",
          null,
          "LIBRARY_SEAT_AUTH_EXPIRED"
        );
      }
      const capturedAt = Date.now();
      jar.meta ||= {};
      jar.meta.librarySeat = {
        token,
        capturedAt: new Date(capturedAt).toISOString(),
        expiresAt: new Date(capturedAt + 10 * 60 * 1000).toISOString()
      };
      if (jar.meta.cas) jar.meta.cas.lastError = null;
      return token;
    } catch (error) {
      throw tagLibroomStage(error, "library_seat_member_token");
    }
  }

  async function getLibrarySeatMemberToken({ force = false } = {}) {
    return librarySeatSessionQueue.run(currentUserId(), async () => {
      const jar = await readSessionJar();
      if (!force) {
        const cached = cachedLibrarySeatToken(jar);
        if (cached) return cached;
      }
      try {
        const credentials = savedSchoolReloginCredentials(jar) || {};
        const token = await issueLibrarySeatMemberToken(jar, credentials);
        await saveSessionJar(jar);
        return token;
      } catch (error) {
        logger.warn("library_seat_member_token_failed", { userId: currentUserId(), error: libroomFailureLog(error) });
        markCasFailureIfNeeded(jar, error);
        jar.meta ||= {};
        jar.meta.librarySeat = {
          lastError: isCasLoginRequiredError(error)
            ? casLoginRequiredMessage(error)
            : (error.message || "座位预约会话已过期，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  async function getLibrarySeatOfficialWebViewLogin() {
    return librarySeatSessionQueue.run(currentUserId(), async () => {
      const jar = await readSessionJar();
      try {
        const credentials = savedSchoolReloginCredentials(jar) || {};
        const { entranceUrl } = await resolveLibrarySeatEntrance(jar, credentials);
        await saveSessionJar(jar);
        return {
          url: entranceUrl,
          cookies: officialWebViewCookies(jar)
        };
      } catch (error) {
        logger.warn("library_seat_official_webview_login_failed", { userId: currentUserId(), error: libroomFailureLog(error) });
        markCasFailureIfNeeded(jar, error);
        jar.meta ||= {};
        jar.meta.librarySeat = {
          lastError: isCasLoginRequiredError(error)
            ? casLoginRequiredMessage(error)
            : (error.message || "座位预约官方入口打开失败，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  async function librarySeatClient() {
    const jar = await readSessionJar();
    return createLibrarySeatClient({
      token: cachedLibrarySeatToken(jar),
      getMemberToken: () => getLibrarySeatMemberToken({ force: true }),
      requestImpl: async (pathname, data, options) => {
        const latestJar = await readSessionJar();
        Object.assign(jar, mergeSessionJars(latestJar, jar));
        const result = await requestLibrarySeatJson(jar, pathname, data, options);
        if (result?.payload?.code === undefined || Number(result.payload.code) === 200 || result.payload.status === true) {
          if (jar.meta?.librarySeat?.lastError) jar.meta.librarySeat.lastError = null;
        }
        await saveSessionJar(jar);
        return result;
      }
    });
  }

  async function libroomClient() {
    const jar = await readSessionJar();
    return createLibroomClient({
      token: cachedLibroomToken(jar),
      getMemberToken: () => getLibroomMemberToken({ force: true }),
      requestImpl: async (pathname, data, options) => {
        const latestJar = await readSessionJar();
        Object.assign(jar, mergeSessionJars(latestJar, jar));
        const result = await requestLibroomJsonWithWebvpn(jar, pathname, data, options);
        clearLibroomLastError(jar.meta);
        await saveSessionJar(jar);
        return result;
      }
    });
  }

  function libroomSpaceId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "预约空间不正确。", null, "INVALID_RESERVATION_SPACE");
    return id;
  }

  function libroomDate(value) {
    const date = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
      throw new HttpError(400, "预约日期格式不正确。", null, "INVALID_RESERVATION_DATE");
    }
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const delta = Math.round((Date.parse(`${date}T00:00:00+08:00`) - Date.parse(`${today}T00:00:00+08:00`)) / DAY_MS);
    if (delta < 0 || delta > 3) {
      throw new HttpError(400, "预约日期必须是今天起 3 日内。", null, "RESERVATION_DATE_OUT_OF_RANGE");
    }
    return date;
  }

  function autoReservationTaskPublic(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      reservationDate: row.reservationDate || row.startDate || null,
      executeDate: row.executeDate || row.execute_date || row.runDate || row.run_date || null,
      executeTime: row.executeTime,
      candidates: Array.isArray(row.candidates) ? row.candidates : [],
      title: row.title,
      content: row.content,
      mobile: row.mobile,
      open: Boolean(row.open),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lastRunAt: row.last_run_at || null,
      lastStatus: row.last_status || null,
      lastMessage: row.last_message || null,
      lastCandidateIndex: Number.isInteger(row.last_candidate_index) ? row.last_candidate_index : null,
      lastAttempts: Array.isArray(row.last_attempts) ? row.last_attempts : [],
      lastReservation: row.last_reservation || null
    };
  }

  function autoReservationTaskRecord(userId, normalized, timestamp, id = randomUUID()) {
    return {
      id,
      user_id: userId,
      ...normalized,
      created_at: timestamp,
      updated_at: timestamp,
      last_run_key: null,
      run_lock_until: null,
      last_run_at: null,
      last_status: null,
      last_message: null,
      last_candidate_index: null,
      last_attempts: [],
      last_reservation: null
    };
  }

  async function saveAutoReservationTask(userId, body, existing = null) {
    const normalized = normalizeAutoReservationTaskInput(body);
    const timestamp = nowIso();
    if (!existing) {
      const row = await repository.insertAutoReservationTask(autoReservationTaskRecord(userId, normalized, timestamp));
      return autoReservationTaskPublic(row);
    }
    const row = await repository.updateAutoReservationTask(userId, existing.id, normalized, timestamp);
    return autoReservationTaskPublic(row);
  }

  async function runAutoReservationTask(task, user, now = new Date()) {
    const plan = autoReservationRunPlan(task, now);
    const date = plan.targetDate;
    if (!date || !plan.runKey) return null;
    const nowValue = now.toISOString();
    const claimed = await repository.claimAutoReservationTask(
      user.id,
      task.id,
      plan.runKey,
      nowValue,
      new Date(now.getTime() + LIBROOM_AUTO_RESERVATION_LOCK_MS).toISOString()
    );
    if (!claimed) return null;

    let result;
    try {
      const client = await libroomClient();
      result = await executeAutoReservationCandidates({
        task: claimed,
        date,
        submitReservation: (candidate) => client.submitReservation(candidate, { now })
      });
    } catch (error) {
      result = {
        status: "failed",
        candidateIndex: -1,
        message: error.message || "自动预约执行失败。",
        attempts: []
      };
    }
    await repository.finishAutoReservationTask(user.id, task.id, result, nowValue);
    logger.info("libroom_auto_reservation_completed", {
      userId: user.id,
      taskId: task.id,
      date,
      executeDate: plan.executeDate,
      status: result.status,
      candidateIndex: result.candidateIndex
    });
    return result;
  }

  function librarySeatWaitlistStringValue(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function librarySeatWaitlistStatusText(status) {
    const normalized = librarySeatWaitlistStringValue(status);
    if (normalized === "success") return "已预约成功";
    if (normalized === "failed") return "已停止";
    if (normalized === "stopped") return "已停止";
    if (normalized === "expired") return "时段已结束";
    return "监听中";
  }

  function librarySeatWaitlistTimeText(task) {
    const { startTime, endTime } = librarySeatWaitlistTimes(
      Number(task?.startMinute ?? task?.start_minute),
      Number(task?.endMinute ?? task?.end_minute)
    );
    return `${startTime} - ${endTime}`;
  }

  function librarySeatWaitlistPublic(row) {
    if (!row) return null;
    const status = librarySeatWaitlistStringValue(row.status) || "listening";
    return {
      id: row.id,
      enabled: Boolean(row.enabled),
      venueId: row.venue_id || null,
      venueName: row.venue_name || "",
      floorId: row.floor_id || null,
      floorName: row.floor_name || "",
      date: row.date || null,
      startMinute: Number.isInteger(row.start_minute) ? row.start_minute : null,
      endMinute: Number.isInteger(row.end_minute) ? row.end_minute : null,
      minLabel: Number.isInteger(row.min_label) ? row.min_label : 1,
      maxLabel: Number.isInteger(row.max_label) ? row.max_label : 45,
      seatLabels: Array.isArray(row.seat_labels) ? row.seat_labels : [],
      status,
      statusText: librarySeatWaitlistStatusText(status),
      lastMessage: row.last_message || null,
      lastAreaName: row.last_area_name || "",
      lastSeatLabel: row.last_seat_label || "",
      lastSeatId: row.last_seat_id || "",
      consecutiveFailures: Number.isInteger(row.consecutive_failures) ? row.consecutive_failures : 0,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lastRunAt: row.last_run_at || null
    };
  }

  function librarySeatWaitlistRecord(userId, normalized, timestamp, targets, id = randomUUID()) {
    return {
      id,
      user_id: userId,
      venue_id: normalized.venueId,
      venue_name: normalized.venueName,
      floor_id: normalized.floorId,
      floor_name: normalized.floorName,
      date: normalized.date,
      start_minute: normalized.startMinute,
      end_minute: normalized.endMinute,
      min_label: normalized.minLabel,
      max_label: normalized.maxLabel,
      seat_labels: normalized.seatLabels,
      enabled: Boolean(normalized.enabled),
      status: "listening",
      last_message: null,
      last_area_name: "",
      last_seat_id: "",
      last_seat_label: "",
      consecutive_failures: 0,
      notify_app_id: String(targets?.appId || "").trim(),
      notify_wecom_id: String(targets?.wecomId || "").trim(),
      created_at: timestamp,
      updated_at: timestamp,
      last_run_at: null
    };
  }

  function librarySeatWaitlistWindowsOverlap(left, right) {
    if (!left || !right) return false;
    const sameDate = String(left.date) === String(right.date);
    if (!sameDate) return false;
    const leftStart = Number(left.startMinute ?? left.start_minute);
    const leftEnd = Number(left.endMinute ?? left.end_minute);
    const rightStart = Number(right.startMinute ?? right.start_minute);
    const rightEnd = Number(right.endMinute ?? right.end_minute);
    return Number.isFinite(leftStart) && Number.isFinite(leftEnd)
      && Number.isFinite(rightStart) && Number.isFinite(rightEnd)
      && leftStart < rightEnd && rightStart < leftEnd;
  }

  async function saveLibrarySeatWaitlist(userId, body, existing = null, targets = {}) {
    const normalized = normalizeLibrarySeatWaitlistInput(body);
    const timestamp = nowIso();
    if (!existing) {
      const rows = await repository.listLibrarySeatWaitlists(userId);
      const duplicate = rows.find((row) => row.enabled && librarySeatWaitlistWindowsOverlap(row, normalized));
      if (duplicate) {
        const error = new HttpError(
          409,
          "该日期时段已有正在监听的候补任务，请先停止或删除后再创建。",
          null,
          "LIBRARY_SEAT_WAITLIST_OVERLAP"
        );
        throw error;
      }
      const row = await repository.insertLibrarySeatWaitlist(librarySeatWaitlistRecord(userId, normalized, timestamp, targets));
      return librarySeatWaitlistPublic(row);
    }
    const merged = { ...existing, ...normalized };
    const rows = await repository.listLibrarySeatWaitlists(userId);
    const duplicate = rows.find((row) =>
      row.id !== existing.id && row.enabled && librarySeatWaitlistWindowsOverlap(row, merged)
    );
    if (duplicate) {
      const error = new HttpError(
        409,
        "调整后的时段与另一条正在监听的候补任务重叠。",
        null,
        "LIBRARY_SEAT_WAITLIST_OVERLAP"
      );
      throw error;
    }
    const changes = {
      venue_id: merged.venueId,
      venue_name: merged.venueName,
      floor_id: merged.floorId,
      floor_name: merged.floorName,
      date: merged.date,
      start_minute: merged.startMinute,
      end_minute: merged.endMinute,
      min_label: merged.minLabel,
      max_label: merged.maxLabel,
      seat_labels: merged.seatLabels,
      enabled: Boolean(merged.enabled)
    };
    if (!changes.enabled && existing.status === "listening") {
      changes.status = "stopped";
      changes.last_message = null;
    }
    if (changes.enabled && existing.status !== "listening") {
      changes.status = "listening";
      changes.consecutive_failures = 0;
      changes.last_message = null;
    }
    const row = await repository.updateLibrarySeatWaitlist(userId, existing.id, changes, timestamp);
    return librarySeatWaitlistPublic(row);
  }

  async function librarySeatWaitlistRequestTargets(userId, platformUserId = "") {
    const preference = await repository.getReminderPreference(userId);
    const preferenceRow = preference || {};
    return {
      appId: String(platformUserId || preferenceRow.app_recipient_id || "").trim(),
      wecomId: String(preferenceRow.recipient_id || "").trim()
    };
  }

  function librarySeatWaitlistFailureText(error) {
    const message = librarySeatWaitlistStringValue(error?.message, "座位候补检测失败。");
    const code = librarySeatWaitlistStringValue(error?.code);
    if (code === "LIBRARY_SEAT_AUTH_REQUIRED" || code === "LIBRARY_SEAT_AUTH_EXPIRED") {
      return "学校座位会话已失效，请重新登录学校账号后再次开启候补。";
    }
    return message;
  }

  async function notifyLibrarySeatWaitlist(user, task, result) {
    const appId = librarySeatWaitlistStringValue(task?.notify_app_id);
    const wecomId = librarySeatWaitlistStringValue(task?.notify_wecom_id);
    if (!appId) return null;
    const requestId = `library-seat-waitlist-${randomUUID()}`;
    const date = librarySeatWaitlistStringValue(task?.date);
    const timeText = librarySeatWaitlistTimeText(task);
    const floorName = librarySeatWaitlistStringValue(task?.floor_name);
    const kind = result?.status;
    const isSuccess = kind === "success";
    const seatLabel = librarySeatWaitlistStringValue(result?.seatLabel);
    const areaName = librarySeatWaitlistStringValue(result?.areaName);
    const items = [
      { key: "日期", value: date },
      { key: "时段", value: timeText },
      { key: "楼层", value: floorName }
    ];
    if (isSuccess) {
      items.unshift(
        { key: "座位号", value: `${seatLabel} 号` },
        { key: "阅览区", value: areaName }
      );
    }
    const payload = {
      idempotencyKey: `library-seat-waitlist-${task.id}-${kind}`,
      audience: { users: [appId] },
      channels: wecomId ? ["app", "wecom"] : ["app"],
      priority: isSuccess ? "high" : "normal",
      category: "campus.library-seat.waitlist",
      content: {
        kind: "text",
        title: isSuccess ? "座位候补预约成功" : "座位候补已停止",
        summary: isSuccess
          ? `已自动预约 ${floorName} ${seatLabel} 号座位`
          : librarySeatWaitlistStringValue(result?.message, "候补任务已停止。"),
        blocks: [{ type: "keyValue", items }]
      },
      source: { service: "campus-service", entityType: "librarySeatWaitlist", entityId: task.id },
      actions: [{ id: "open-today", label: "查看我的预约", deepLink: "mycontrol://open?destination=today" }],
      ...(wecomId ? { wecom: { touser: wecomId } } : {})
    };
    if (!isSuccess) {
      items.push({ key: "原因", value: librarySeatWaitlistStringValue(result?.message, "检测多次失败。") });
      items.push({ key: "建议", value: "请打开座位预约重新开启候补或手动预约。" });
    }
    const sent = await sendCampusNotification(payload, { requestId });
    logger.info("library_seat_waitlist_notified", {
      userId: user?.id,
      taskId: task.id,
      kind,
      wecom: Boolean(wecomId)
    });
    return sent;
  }

  async function runLibrarySeatWaitlistTask(task, user, now = new Date()) {
    const runInput = librarySeatWaitlistRunInput(task);
    const plan = librarySeatWaitlistRunPlan(runInput, now);
    const nowValue = now.toISOString();
    if (!plan.due) {
      const result = {
        status: "expired",
        message: "候补时段已结束，未能预约成功。",
        areaName: null,
        seatId: null,
        seatLabel: null
      };
      await repository.finishLibrarySeatWaitlist(user.id, task.id, result, nowValue);
      return result;
    }
    const client = await librarySeatClient();
    const scanResult = await scanLibrarySeatWaitlist({
      task: runInput,
      client,
      now,
      maxAttemptsPerScan: LIBRARY_SEAT_WAITLIST_MAX_SCAN_ATTEMPTS
    });
    if (scanResult.status === "success") {
      const seat = scanResult.seat;
      const result = {
        status: "success",
        message: scanResult.message || "已自动预约成功。",
        areaName: seat.areaName,
        seatId: seat.seatId,
        seatLabel: seat.seatLabel
      };
      await repository.finishLibrarySeatWaitlist(user.id, task.id, result, nowValue);
      logger.info("audit_library_seat_waitlist_succeeded", {
        actorUserId: user.id,
        taskId: task.id,
        seatId: seat.seatId,
        seatLabel: seat.seatLabel,
        areaName: seat.areaName
      });
      await notifyLibrarySeatWaitlist(user, task, result).catch((error) => {
        logger.warn("library_seat_waitlist_notify_failed", { taskId: task.id, error: error?.message });
      });
      return result;
    }
    if (scanResult.status === "expired") {
      const result = {
        status: "expired",
        message: "候补时段已结束，未能预约成功。",
        areaName: null,
        seatId: null,
        seatLabel: null
      };
      await repository.finishLibrarySeatWaitlist(user.id, task.id, result, nowValue);
      return result;
    }
    await repository.updateLibrarySeatWaitlist(user.id, task.id, {
      status: "listening",
      last_message: scanResult.message || null,
      last_run_at: nowValue,
      consecutive_failures: 0
    }, nowValue);
    return { status: "listening", message: scanResult.message || null };
  }
  return {
    libroomFailureLog,
    issueLibroomMemberToken,
    getLibroomOfficialLoginUrl,
    getLibroomOfficialWebViewLogin,
    getLibrarySeatOfficialWebViewLogin,
    librarySeatClient,
    libroomClient,
    libroomSpaceId,
    libroomDate,
    autoReservationTaskPublic,
    saveAutoReservationTask,
    runAutoReservationTask,
    librarySeatWaitlistPublic,
    saveLibrarySeatWaitlist,
    librarySeatWaitlistRequestTargets,
    librarySeatWaitlistFailureText,
    notifyLibrarySeatWaitlist,
    runLibrarySeatWaitlistTask
  };
}
