import {
  autoReservationRunPlan,
  autoReservationRunAtMs,
  LIBROOM_AUTO_RESERVATION_RETRY_WINDOW_MS,
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
  normalizeLibroomMyReservationRecord,
  resolveLibroomCasCallback
} from "../lib/libroom.js";
import { DAY_MS } from "../lib/academic-config.js";
import { discardUpstreamResponse } from "../lib/upstream-response.js";
import { HttpError, isUpstreamNetworkFailure } from "../lib/http.js";
import { readUpstreamFailure, recordUpstreamFailure } from "../lib/failure-cooldown.js";
import { isCookieExpired, mergeSessionJars } from "../lib/session-jar.js";
import { KeyedSerialQueue } from "../lib/keyed-serial-queue.js";
import {
  librarySeatWaitlistRunInput,
  librarySeatWaitlistRunPlan,
  librarySeatWaitlistTimes,
  normalizeLibrarySeatWaitlistInput,
  scanLibrarySeatWaitlist
} from "../lib/library-seat-waitlist.js";
import {
  LIBRARY_SEAT_AUTO_TASK_RETRY_INTERVAL_MS,
  LIBRARY_SEAT_AUTO_TASK_RETRY_WINDOW_MS,
  LIBRARY_SEAT_AUTO_TASK_PREWARM_MS,
  librarySeatAutoTaskRunAtMs,
  librarySeatAutoTaskRunPlan,
  normalizeLibrarySeatAutoTaskInput,
  prepareLibrarySeatAutoTaskSeats,
  scanLibrarySeatAutoTask
} from "../lib/library-seat-auto-task.js";
import { normalizeHtmlText } from "../lib/academic-parsers.js";
import { randomUUID } from "node:crypto";
import { redact } from "../lib/logger.js";
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
  const preparedLibroomTasks = new Map();
  const libroomReservationQueue = new KeyedSerialQueue();

  const librarySeatSessionQueue = new KeyedSerialQueue();
  const librarySeatReservationQueue = new KeyedSerialQueue();
  const librarySeatSubmissionQueue = new KeyedSerialQueue();
  const preparedLibrarySeatTasks = new Map();

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

  // `TypeError: fetch failed` 自身没有 code，真正原因在 cause 链上。换票失败
  // 80% 的场景是连不上（DNS/TCP/TLS），不记录 cause 就只能看到一个没有信息量的 message。
  function upstreamCauseFields(error) {
    const codes = [];
    let node = error?.cause;
    for (let depth = 0; node && typeof node === "object" && depth < 4; depth += 1) {
      if (node.code) codes.push(String(node.code));
      if (Array.isArray(node.errors)) {
        for (const item of node.errors.slice(0, 3)) {
          if (item?.code) codes.push(String(item.code));
        }
      }
      node = node.cause;
    }
    if (!codes.length) return {};
    return {
      causeCodes: [...new Set(codes)],
      causeHost: error?.cause?.hostname || error?.cause?.host || null
    };
  }

  function libroomFailureLog(error) {
    return {
      stage: error?.libroomStage || null,
      status: error?.status || null,
      code: error?.code || null,
      message: error?.message || null,
      ...upstreamCauseFields(error)
    };
  }

  // 会话里存的 lastError 会直接透给客户端，不能把 "fetch failed" 这种英文内部信息留下来。
  function sessionFailureText(error, fallback) {
    if (isCasLoginRequiredError(error)) return casLoginRequiredMessage(error);
    if (isUpstreamNetworkFailure(error)) return "学校系统当前无法访问，请稍后重试。";
    return error?.message || fallback;
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
      // 上游刚连不上时快速失败：并发轮询不必每个都重跑一遍完整登录 / 换票链路。
      const cooling = readUpstreamFailure(jar.meta?.libroom);
      if (cooling) throw new HttpError(cooling.status, cooling.message, { retryAfterMs: cooling.retryAfterMs }, cooling.code);
      try {
        const token = await issueLibroomMemberToken(jar);
        await saveSessionJar(jar);
        return token;
      } catch (error) {
        logger.warn("libroom_member_token_failed", { userId: currentUserId(), ...libroomFailureLog(error) });
        markCasFailureIfNeeded(jar, error);
        jar.meta ||= {};
        jar.meta.libroom = {
          lastError: sessionFailureText(error, "空间预约会话已过期，请重新登录学校账号。")
        };
        if (isUpstreamNetworkFailure(error)) {
          recordUpstreamFailure(jar.meta.libroom, {
            at: nowIso(),
            status: 502,
            code: "UPSTREAM_UNAVAILABLE",
            message: jar.meta.libroom.lastError
          });
        }
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
          lastError: sessionFailureText(error, "空间预约官方入口打开失败，请重新登录学校账号。")
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
          lastError: sessionFailureText(error, "空间预约官方入口打开失败，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  async function requestLibrarySeatJson(jar, pathname, data = {}, { token = "", onDispatch } = {}) {
    const response = await fetchWithJar(`${LIBRARY_SEAT_API_BASE}${pathname}`, {
      jar,
      onDispatch,
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
    const retryAfter = response.headers?.get("retry-after");
    const retryAfterMs = retryAfter ? Math.max(0, /^\d+(?:\.\d+)?$/.test(retryAfter)
      ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    return { payload, status: response.status, ok: response.ok, retryAfterMs };
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
        const verified = await followRedirectsWithJar(verifyUrl, jar, {
          method: "GET",
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            referer: finalUrl
          }
        });
        await discardUpstreamResponse(verified.response).catch(() => {});
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
        // 与研讨间同理：入口票据换不出成员令牌是上游兑换失败，不是学校登录态失效。
        const upstreamText = String(payload?.message || payload?.msg || payload?.error || "").trim();
        const genericText = !upstreamText || /^(操作失败|请求失败|系统繁忙|系统异常|失败|error|failed)$/i.test(upstreamText);
        throw new HttpError(
          response.ok ? 502 : response.status,
          genericText ? "座位预约系统身份转换失败，请重新打开官方入口后重试。" : upstreamText,
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
      const cooling = readUpstreamFailure(jar.meta?.librarySeat);
      if (cooling) throw new HttpError(cooling.status, cooling.message, { retryAfterMs: cooling.retryAfterMs }, cooling.code);
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
          lastError: sessionFailureText(error, "座位预约会话已过期，请重新登录学校账号。")
        };
        if (isUpstreamNetworkFailure(error)) {
          recordUpstreamFailure(jar.meta.librarySeat, {
            at: nowIso(),
            status: 502,
            code: "UPSTREAM_UNAVAILABLE",
            message: jar.meta.librarySeat.lastError
          });
        }
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
          lastError: sessionFailureText(error, "座位预约官方入口打开失败，请重新登录学校账号。")
        };
        await saveSessionJar(jar).catch(() => {});
        throw error;
      }
    });
  }

  async function librarySeatClient({ jar: preparedJar, persistSession = true, onSubmitRequest, onSubmitResponse } = {}) {
    const jar = preparedJar || await readSessionJar();
    return createLibrarySeatClient({
      token: cachedLibrarySeatToken(jar),
      getMemberToken: () => getLibrarySeatMemberToken({ force: true }),
      requestImpl: async (pathname, data, options) => {
        const submit = pathname.includes("/make/freeBook/");
        const perform = async () => {
          const latestJar = await readSessionJar();
          Object.assign(jar, mergeSessionJars(latestJar, jar));
          const result = await requestLibrarySeatJson(jar, pathname, data, {
            ...options, onDispatch: submit ? onSubmitRequest : undefined
          });
          if (submit) onSubmitResponse?.();
          if (result?.payload?.code === undefined || Number(result.payload.code) === 200 || result.payload.status === true) {
            if (jar.meta?.librarySeat?.lastError) jar.meta.librarySeat.lastError = null;
          }
          if (persistSession) await saveSessionJar(jar);
          return result;
        };
        return submit ? librarySeatSubmissionQueue.run(currentUserId(), perform) : perform();
      }
    });
  }

  async function libroomClient({ jar: preparedJar, persistSession = true, onSubmitResponse } = {}) {
    const jar = preparedJar || await readSessionJar();
    return createLibroomClient({
      token: cachedLibroomToken(jar),
      getMemberToken: async () => {
        const token = await getLibroomMemberToken({ force: true });
        Object.assign(jar, mergeSessionJars(await readSessionJar(), jar));
        return token;
      },
      requestImpl: async (pathname, data, options) => {
        if (persistSession) {
          const latestJar = await readSessionJar();
          Object.assign(jar, mergeSessionJars(latestJar, jar));
        }
        const result = await requestLibroomJsonWithWebvpn(jar, pathname, data, options);
        if (["/v4/seminar/confirm", "/v4/seminar/submit"].includes(pathname)) onSubmitResponse?.();
        clearLibroomLastError(jar.meta);
        if (persistSession) await saveSessionJar(jar);
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

  function autoReservationStatusText(status) {
    if (status === "waiting") return "等待运行";
    if (status === "ready") return "待执行";
    if (status === "running") return "正在执行";
    if (status === "succeeded") return "已完成";
    if (status === "failed") return "执行失败";
    if (status === "auth_required") return "需重新登录";
    if (status === "unconfirmed") return "结果待确认";
    if (status === "stopped") return "已停止";
    if (status === "expired") return "已过期";
    if (status === "invalid") return "配置无效";
    return "已停用";
  }

  function autoReservationTaskPublic(row, now = new Date()) {
    if (!row) return null;
    const plan = autoReservationRunPlan(row, now);
    const running = row.run_status === "running"
      && row.run_lock_until
      && Date.parse(row.run_lock_until) > now.getTime();
    const status = running
      ? "running"
      : row.enabled
        ? plan.state
        : row.last_status || "disabled";
    return {
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      status,
      statusText: autoReservationStatusText(status),
      nextRunAt: status === "waiting" ? plan.nextRunAt : null,
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
      lastReservation: row.last_reservation || null,
      lastTimings: row.last_timings || null
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
      run_status: null,
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
    const tasks = await repository.listAutoReservationTasks(userId);
    const duplicate = tasks.find((task) =>
      task.enabled
      && task.id !== existing?.id
      && String(task.reservationDate || task.startDate || "") === normalized.reservationDate
    );
    if (duplicate) {
      throw new HttpError(
        409,
        "该预约目标日期已有启用的自动任务，请先停用或删除后再创建。",
        null,
        "AUTO_RESERVATION_DUPLICATE_TARGET_DATE"
      );
    }
    if (!existing) {
      const row = await repository.insertAutoReservationTask(autoReservationTaskRecord(userId, normalized, timestamp));
      return autoReservationTaskPublic(row);
    }
    const scheduleChanged = [
      "reservationDate",
      "executeDate",
      "executeTime",
      "candidates", "enabled", "title", "content", "mobile", "open"
    ].some((key) => JSON.stringify(existing[key] ?? null) !== JSON.stringify(normalized[key] ?? null));
    const row = await repository.updateAutoReservationTask(
      userId,
      existing.id,
      scheduleChanged ? {
        ...normalized,
        last_run_key: null,
        run_lock_until: null,
        run_owner: null,
        run_status: null,
        last_run_started_at: null
      } : normalized,
      timestamp
    );
    return autoReservationTaskPublic(row);
  }

  async function notifyAutoReservationTask(user, task, result) {
    const targets = await librarySeatWaitlistRequestTargets(user?.id || task?.user_id);
    if (!targets.appId) return null;
    const status = String(result?.status || "failed");
    const isSuccess = status === "succeeded";
    const title = {
      succeeded: "研讨间自动预约成功",
      failed: "研讨间自动预约失败",
      auth_required: "研讨间自动预约已暂停",
      expired: "研讨间自动预约已过期",
      invalid: "研讨间自动预约配置无效"
    }[status] || "研讨间自动预约已结束";
    const targetDate = String(task?.reservationDate || task?.startDate || "");
    const runAt = String(result?.runAt || nowIso());
    const items = [
      { key: "任务", value: String(task?.name || "") },
      { key: "目标日期", value: targetDate },
      { key: "运行时间", value: `${task?.executeDate || ""} ${task?.executeTime || ""}`.trim() }
    ];
    if (Number.isInteger(result?.candidateIndex) && result.candidateIndex >= 0) {
      items.push({ key: "命中候选", value: `第 ${result.candidateIndex + 1} 个` });
    }
    if (!isSuccess) {
      items.push({ key: "原因", value: String(result?.message || "未返回具体原因。") });
    }
    const payload = {
      idempotencyKey: `libroom-auto-reservation-${task.id}-${status}-${runAt}`,
      audience: { users: [targets.appId] },
      channels: targets.wecomId ? ["app", "wecom"] : ["app"],
      priority: isSuccess ? "high" : "normal",
      category: "campus.libroom.auto-reservation",
      content: {
        kind: "text",
        title,
        summary: isSuccess
          ? `“${task.name}”已自动预约 ${targetDate} 的研讨间。`
          : `“${task.name}”未能完成自动预约：${result?.message || "请查看任务详情。"}`,
        blocks: [{ type: "keyValue", items }]
      },
      source: { service: "campus-service", entityType: "libroomAutoReservation", entityId: task.id },
      actions: [{ id: "open-today", label: "查看今日", deepLink: "mycontrol://open?destination=today" }],
      ...(targets.wecomId ? { wecom: { touser: targets.wecomId } } : {})
    };
    await sendCampusNotification(payload, { requestId: `libroom-auto-reservation-${randomUUID()}` });
    logger.info("libroom_auto_reservation_notified", {
      userId: user?.id,
      taskId: task.id,
      status,
      wecom: Boolean(targets.wecomId)
    });
    return payload;
  }

  function libroomTaskSignature(task) {
    return JSON.stringify([task.user_id, task.reservationDate || task.startDate, task.executeDate,
      task.executeTime, task.candidates, task.title, task.content, task.mobile, task.open]);
  }

  async function prepareAutoReservationTask(task, user, { allCandidates = true } = {}) {
    const signature = libroomTaskSignature(task);
    const cached = preparedLibroomTasks.get(task.id);
    if (cached?.signature === signature && Date.now() - cached.createdAt < 120_000) return cached;
    const latest = await repository.getAutoReservationTask(user.id, task.id);
    if (!latest?.enabled || libroomTaskSignature(latest) !== signature) return null;
    const jar = await readSessionJar();
    const prepared = { signature, jar, endpoints: new Map(), createdAt: Date.now(), onSubmitResponse: null };
    prepared.client = await libroomClient({ jar, persistSession: false,
      onSubmitResponse: () => prepared.onSubmitResponse?.() });
    preparedLibroomTasks.set(task.id, prepared);
    for (const candidate of allCandidates ? task.candidates : task.candidates.slice(0, 1)) {
      if (!prepared.endpoints.has(candidate.areaId)) {
        const pending = prepared.client.prepareReservation(candidate.areaId);
        prepared.endpoints.set(candidate.areaId, pending);
        try { await pending; } catch (error) {
          prepared.endpoints.delete(candidate.areaId);
          throw error;
        }
      }
      const current = await repository.getAutoReservationTask(user.id, task.id);
      if (!current?.enabled || libroomTaskSignature(current) !== signature) {
        if (preparedLibroomTasks.get(task.id) === prepared) preparedLibroomTasks.delete(task.id);
        return null;
      }
    }
    return prepared;
  }

  async function runAutoReservationTask(task, user, now = new Date(), { shouldStop = () => false } = {}) {
    return libroomReservationQueue.run(user.id, async () => {
    task = await repository.getAutoReservationTask(user.id, task.id);
    if (!task?.enabled || shouldStop()) return null;
    const plan = autoReservationRunPlan(task, now);
    const date = plan.targetDate;
    if (plan.state === "invalid" || plan.state === "expired") {
      const result = {
        status: plan.state,
        candidateIndex: -1,
        message: plan.reason,
        attempts: [],
        runAt: now.toISOString()
      };
      const saved = await repository.finishAutoReservationTask(user.id, task.id, result, now.toISOString(), null, task.updated_at);
      if (!saved) return null;
      await notifyAutoReservationTask(user, task, result).catch((error) => {
        logger.warn("libroom_auto_reservation_notify_failed", { taskId: task.id, error: error?.message });
      });
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
    if (!plan.due || !date || !plan.runKey) return null;
    const nowValue = now.toISOString();
    const owner = randomUUID();
    const claimed = await repository.claimAutoReservationTask(
      user.id,
      task.id,
      plan.runKey,
      nowValue,
      new Date(Date.now() + LIBROOM_AUTO_RESERVATION_LOCK_MS).toISOString(), owner, task.updated_at
    );
    if (!claimed) return null;

    let result;
    let prepared;
    const scheduledAtMs = autoReservationRunAtMs(task, now);
    const deadlineMs = Date.now() + LIBROOM_AUTO_RESERVATION_RETRY_WINDOW_MS;
    const timings = { scheduledAt: new Date(scheduledAtMs).toISOString(), startedAt: nowValue,
      firstRequestAt: null, firstResponseAt: null, firstRequestDelayMs: null, totalDurationMs: null };
    const shouldContinue = async () => {
      if (shouldStop()) return false;
      const latest = await repository.getAutoReservationTask(user.id, task.id);
      return latest?.enabled && latest.run_owner === owner && latest.updated_at === task.updated_at;
    };
    try {
      prepared = await prepareAutoReservationTask(claimed, user, { allCandidates: false });
      if (!prepared) return null;
      prepared.onSubmitResponse = () => { timings.firstResponseAt ||= nowIso(); };
      const recovered = task.last_run_key === plan.runKey && task.run_status === "running";
      const verifyReservation = async (input) => {
        const records = await prepared.client.getMyReservations({ limit: 100 });
        const matches = (row) => row?.spaceId === input.areaId && row.date === input.date
          && row.startTime === input.startTime && row.endTime === input.endTime;
        const direct = records.map((row) => normalizeLibroomMyReservationRecord(row)).find(matches);
        if (direct) return direct;
        const spaces = await prepared.client.listSpaces();
        return records.map((row) => normalizeLibroomMyReservationRecord(row, { spaces }))
          .find(matches) || null;
      };
      result = await executeAutoReservationCandidates({
        task: claimed, date, shouldContinue, verifyReservation,
        maxTransientAttempts: 40, transientRetryDelayMs: 300,
        deadlineMs,
        submitReservation: async (candidate) => {
          if (recovered) {
            const confirmed = await verifyReservation(candidate);
            if (confirmed) return confirmed;
            const error = new HttpError(502, "上次执行中断，需核对学校预约记录。", null, "LIBROOM_SUBMISSION_UNKNOWN");
            error.libroomSubmissionUnknown = true;
            throw error;
          }
          if (!prepared.endpoints.has(candidate.areaId)) {
            prepared.endpoints.set(candidate.areaId, prepared.client.prepareReservation(candidate.areaId));
          }
          let endpoint;
          try { endpoint = await prepared.endpoints.get(candidate.areaId); } catch (error) {
            prepared.endpoints.delete(candidate.areaId);
            throw error;
          }
          if (Date.now() >= deadlineMs) throw new HttpError(408, "快速尝试窗口已结束。", null, "LIBROOM_WINDOW_ENDED");
          if (!await shouldContinue()) throw new HttpError(409, "任务已停用或修改，已停止后续提交。", null, "LIBROOM_TASK_STOPPED");
          const reservation = await prepared.client.submitReservation(candidate, {
            now: new Date(), prepared: endpoint,
            onDispatch: () => { timings.firstRequestAt ||= nowIso(); }
          });
          return reservation;
        }
      });
    } catch (error) {
      result = {
        status: [401, 403].includes(Number(error?.status)) ? "auth_required" : "failed",
        candidateIndex: -1,
        message: error.message || "自动预约执行失败。",
        attempts: []
      };
    } finally {
      if (prepared) prepared.onSubmitResponse = null;
      timings.firstRequestDelayMs = timings.firstRequestAt ? Date.parse(timings.firstRequestAt) - scheduledAtMs : null;
      timings.totalDurationMs = Date.now() - Date.parse(nowValue);
      if (prepared) await saveSessionJar(prepared.jar).catch((error) => {
        logger.warn("libroom_auto_session_save_failed", { taskId: task.id, code: error.code || null });
      });
      preparedLibroomTasks.delete(task.id);
    }
    result.timings = timings;
    const saved = await repository.finishAutoReservationTask(user.id, task.id, result, nowIso(), owner, task.updated_at);
    if (!saved) return result;
    result.runAt = nowValue;
    await notifyAutoReservationTask(user, task, result).catch((error) => {
      logger.warn("libroom_auto_reservation_notify_failed", { taskId: task.id, error: error?.message });
    });
    logger.info("libroom_auto_reservation_completed", {
      userId: user.id,
      taskId: task.id,
      date,
      executeDate: plan.executeDate,
      status: result.status,
      candidateIndex: result.candidateIndex
    });
    return result;
    });
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
      actions: [{
        id: "open-library-seat-reservation",
        label: "查看我的预约",
        deepLink: "mycontrol://open?destination=library-seat-reservation"
      }],
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

  /* ---------------------------------------------------------------- 座位自动预约任务 */

  function librarySeatAutoTaskStatusText(status) {
    const normalized = librarySeatWaitlistStringValue(status);
    if (normalized === "success") return "已预约成功";
    if (normalized === "failed") return "未抢到";
    if (normalized === "stopped") return "已停用";
    if (normalized === "expired") return "已过期";
    if (normalized === "running") return "正在抢";
    if (normalized === "confirming") return "正在核对预约";
    if (normalized === "unconfirmed") return "提交结果待确认";
    return "等待执行";
  }

  function librarySeatAutoTaskPublic(row) {
    if (!row) return null;
    const status = librarySeatWaitlistStringValue(row.status) || "scheduled";
    const runAtMs = librarySeatAutoTaskRunAtMs(row);
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
      preferredAreaId: row.preferred_area_id || "",
      runDate: row.run_date || null,
      runMinute: Number.isInteger(row.run_minute) ? row.run_minute : null,
      runAt: Number.isFinite(runAtMs) ? new Date(runAtMs).toISOString() : null,
      status,
      statusText: librarySeatAutoTaskStatusText(status),
      lastMessage: row.last_message || null,
      lastFailure: row.last_failure || null,
      lastAreaName: row.last_area_name || "",
      lastSeatLabel: row.last_seat_label || "",
      consecutiveFailures: Number(row.consecutive_failures) || 0,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lastRunAt: row.last_run_at || null,
      timings: row.timings || null
    };
  }

  function librarySeatAutoTaskRecord(userId, normalized, timestamp, targets, id = randomUUID()) {
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
      preferred_area_id: normalized.preferredAreaId,
      run_date: normalized.runDate,
      run_minute: normalized.runMinute,
      enabled: Boolean(normalized.enabled),
      status: "scheduled",
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

  function librarySeatAutoTaskDuplicate(left, right) {
    if (!left || !right) return false;
    if (String(left.date || left.reservationDate) !== String(right.date || right.reservationDate)) return false;
    const leftRunDate = String(left.run_date ?? left.runDate ?? "");
    const rightRunDate = String(right.run_date ?? right.runDate ?? "");
    if (leftRunDate !== rightRunDate) return false;
    const leftRunMinute = Number(left.run_minute ?? left.runMinute);
    const rightRunMinute = Number(right.run_minute ?? right.runMinute);
    if (leftRunMinute !== rightRunMinute) return false;
    const leftStart = Number(left.start_minute ?? left.startMinute);
    const leftEnd = Number(left.end_minute ?? left.endMinute);
    const rightStart = Number(right.start_minute ?? right.startMinute);
    const rightEnd = Number(right.end_minute ?? right.endMinute);
    return Number.isFinite(leftStart) && Number.isFinite(leftEnd)
      && Number.isFinite(rightStart) && Number.isFinite(rightEnd)
      && leftStart < rightEnd && rightStart < leftEnd;
  }

  async function saveLibrarySeatAutoTask(userId, body, existing = null, targets = {}) {
    const normalized = normalizeLibrarySeatAutoTaskInput(body);
    if (existing && normalized.enabled && ["success", "unconfirmed"].includes(existing.status)) {
      throw new HttpError(409, "该任务已完成或提交结果待确认，请先查看我的预约。", null, "LIBRARY_SEAT_AUTO_TASK_COMPLETED");
    }
    const timestamp = nowIso();
    const rows = await repository.listLibrarySeatAutoTasks(userId);
    const duplicate = rows.find((row) => row.enabled
      && row.id !== existing?.id
      && librarySeatAutoTaskDuplicate(row, normalized));
    if (duplicate) {
      throw new HttpError(
        409,
        "该日期已有运行时间相同的自动预约任务，请先停用或删除后再创建。",
        null,
        "LIBRARY_SEAT_AUTO_TASK_DUPLICATE"
      );
    }
    if (!existing) {
      const row = await repository.insertLibrarySeatAutoTask(
        librarySeatAutoTaskRecord(userId, normalized, timestamp, targets)
      );
      return librarySeatAutoTaskPublic(row);
    }
    const changes = {
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
      preferred_area_id: normalized.preferredAreaId,
      run_date: normalized.runDate,
      run_minute: normalized.runMinute,
      enabled: Boolean(normalized.enabled),
      run_lock_until: null,
      run_owner: null
    };
    if (!changes.enabled && existing.status !== "success") {
      changes.status = "stopped";
      changes.last_message = null;
    }
    if (changes.enabled && existing.status !== "success") {
      changes.status = "scheduled";
      changes.consecutive_failures = 0;
      changes.last_message = null;
      changes.last_failure = null;
    }
    const row = await repository.updateLibrarySeatAutoTask(userId, existing.id, changes, timestamp);
    preparedLibrarySeatTasks.delete(existing.id);
    return librarySeatAutoTaskPublic(row);
  }

  async function prepareLibrarySeatAutoTask(task, user) {
    const input = normalizeLibrarySeatAutoTaskInput(task);
    const fingerprint = JSON.stringify(input);
    const existing = preparedLibrarySeatTasks.get(task.id);
    if (existing?.fingerprint === fingerprint && Date.now() - existing.preparedAt < 120_000) return existing;
    for (const [id, value] of preparedLibrarySeatTasks) {
      if (Date.now() - value.preparedAt > 120_000) preparedLibrarySeatTasks.delete(id);
    }
    const jar = await readSessionJar();
    const minimumExpiry = Date.now() + LIBRARY_SEAT_AUTO_TASK_PREWARM_MS + LIBRARY_SEAT_AUTO_TASK_RETRY_WINDOW_MS + 30_000;
    if (!cachedLibrarySeatToken(jar) || Date.parse(jar.meta.librarySeat.expiresAt) <= minimumExpiry) {
      const token = await getLibrarySeatMemberToken({ force: true });
      jar.meta ||= {};
      jar.meta.librarySeat = { token, capturedAt: new Date().toISOString(), expiresAt: libroomTokenExpiry(token) };
    }
    const timings = { scheduledAt: new Date(librarySeatAutoTaskRunAtMs(task)).toISOString(),
      preparedAt: null, startedAt: null, firstRequestAt: null, firstResponseAt: null, responseAt: null, attempts: 0 };
    const client = await librarySeatClient({ jar, persistSession: false, onSubmitRequest: () => {
      timings.firstRequestAt ||= new Date().toISOString();
    }, onSubmitResponse: () => {
      timings.responseAt = new Date().toISOString();
      timings.firstResponseAt ||= timings.responseAt;
    } });
    const seats = await prepareLibrarySeatAutoTaskSeats({ task: input, client, topology: true });
    const prepared = { ...seats, jar, client, timings, fingerprint, preparedAt: Date.now() };
    timings.preparedAt = new Date().toISOString();
    preparedLibrarySeatTasks.set(task.id, prepared);
    logger.info("library_seat_auto_task_prepared", { taskId: task.id, userId: user.id,
      candidates: seats.candidates.length, preparedAt: timings.preparedAt });
    return prepared;
  }

  async function runLibrarySeatAutoTask(task, user, now = new Date(), { shouldStop = () => false } = {}) {
    return librarySeatReservationQueue.run(user.id, async () => {
      const actualNow = new Date(Math.max(now.getTime(), Date.now()));
      const plan = librarySeatAutoTaskRunPlan(task, actualNow);
      if (!plan.due) {
        if (!plan.expired) return { status: "waiting", message: "还没到运行时间。" };
        const result = { status: "expired", message: "预约时段已结束，任务未执行。" };
        await repository.finishLibrarySeatAutoTask(user.id, task.id, result, actualNow.toISOString());
        return result;
      }
      const owner = randomUUID();
      const claimed = await repository.claimLibrarySeatAutoTask(user.id, task.id, owner,
        actualNow.toISOString(), new Date(actualNow.getTime() + 3 * 60_000).toISOString());
      if (!claimed) return { status: "skipped", message: "任务已停用或正在执行。" };
      task = claimed;
      const input = normalizeLibrarySeatAutoTaskInput(task);
      const fingerprint = JSON.stringify(input);
      let prepared = preparedLibrarySeatTasks.get(task.id);
      let result;
      let lastFailure = null;
      const recordFailure = (error, seat, stage = "submit") => {
        lastFailure = redact({ stage, code: error?.code || null, status: error?.status || null,
          message: error?.message || "自动预约执行失败。",
          upstreamCode: error?.details?.upstreamCode ?? null, upstreamStatus: error?.details?.upstreamStatus ?? null,
          seatId: seat?.seatId || null, seatLabel: seat?.seatLabel || null,
          areaId: seat?.areaId || null, areaName: seat?.areaName || null,
          date: input.date, startMinute: input.startMinute, endMinute: input.endMinute,
          attempt: prepared?.timings.attempts || 0, at: nowIso() });
        logger.warn("library_seat_auto_attempt_failed", { taskId: task.id, userId: user.id, ...lastFailure });
      };
      try {
        if (prepared?.fingerprint !== fingerprint || Date.now() - prepared.preparedAt > 120_000) {
          prepared = await prepareLibrarySeatAutoTask(task, user);
        }
        prepared.timings.startedAt = new Date().toISOString();
        const deadline = Math.min(Date.now() + LIBRARY_SEAT_AUTO_TASK_RETRY_WINDOW_MS, plan.endMs);
        const shouldStopScan = async () => {
          if (shouldStop() || Date.now() >= deadline) return true;
          // 首次提交使用刚取得的任务锁；换座和重试前核对停用或编辑状态。
          if (!prepared.timings.attempts) return false;
          const current = await repository.getLibrarySeatAutoTask(user.id, task.id);
          return !current?.enabled || current.run_owner !== owner
            || JSON.stringify(normalizeLibrarySeatAutoTaskInput(current)) !== fingerprint;
        };
        while (!shouldStop() && Date.now() < deadline && prepared.timings.attempts < 40) {
          const scan = await scanLibrarySeatAutoTask({ task: input, client: prepared.client, prepared,
            now: new Date(), shouldStop: shouldStopScan, onAttempt: () => { prepared.timings.attempts++; },
            onFailure: recordFailure,
            maxAttemptsPerScan: Math.min(8, 40 - prepared.timings.attempts) });
          if (scan.status === "success") {
            result = { status: "success", message: scan.message, areaName: scan.seat.areaName,
              seatId: scan.seat.seatId, seatLabel: scan.seat.seatLabel };
            break;
          }
          if (scan.status === "stopped") {
            if (!prepared.pending) result = scan;
            break;
          }
          if (scan.status === "failed") {
            result = { status: "failed", message: scan.message };
            break;
          }
          if (scan.status === "confirming") {
            await repository.updateLibrarySeatAutoTask(user.id, task.id,
              { status: "confirming", last_message: scan.message }, nowIso());
          }
          if (!prepared.pending && (scan.status === "empty"
            || (scan.status === "retry" && prepared.topology && prepared.blocked.size))) {
            if (await shouldStopScan()) {
              result = { status: "stopped", message: "任务已停止，已取消后续尝试。" };
              break;
            }
            try {
              const fresh = await prepareLibrarySeatAutoTaskSeats({ task: input, client: prepared.client });
              prepared.candidates = fresh.candidates;
              prepared.blocked = new Set();
              prepared.topology = false;
            } catch (error) {
              recordFailure(error, null, "availability");
              if (error?.status && error.status < 500 && error.status !== 429) throw error;
            }
          }
          const delay = Math.max(LIBRARY_SEAT_AUTO_TASK_RETRY_INTERVAL_MS, Number(scan.retryAfterMs) || 0);
          const remaining = deadline - Date.now();
          if (delay >= remaining) break;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        result ||= prepared.pending
          ? { status: "unconfirmed", message: "提交结果仍待学校确认，请查看我的预约，任务已停止重复提交。" }
          : { status: shouldStop() ? "stopped" : "failed", message: shouldStop()
            ? "服务停止，任务已暂停。" : "快速尝试窗口内未能预约成功。" };
      } catch (error) {
        if (!lastFailure) recordFailure(error, null, prepared ? "run" : "prepare");
        result = { status: "failed", message: error.message || "自动预约执行失败。" };
      } finally {
        if (prepared) {
          const timings = prepared.timings;
          timings.firstRequestDelayMs = timings.firstRequestAt
            ? Date.parse(timings.firstRequestAt) - Date.parse(timings.scheduledAt) : null;
          timings.requestDurationMs = timings.firstRequestAt && timings.firstResponseAt
            ? Date.parse(timings.firstResponseAt) - Date.parse(timings.firstRequestAt) : null;
          timings.totalDurationMs = timings.startedAt ? Date.now() - Date.parse(timings.startedAt) : null;
          if (result) result.timings = timings;
          await saveSessionJar(prepared.jar).catch((error) => logger.warn("library_seat_auto_session_save_failed",
            { taskId: task.id, code: error.code || null }));
        }
        preparedLibrarySeatTasks.delete(task.id);
      }
      result = redact({ ...result, lastFailure });
      await repository.finishLibrarySeatAutoTask(user.id, task.id, result, nowIso(), owner);
      logger.info("library_seat_auto_task_finished", { taskId: task.id, userId: user.id,
        status: result.status, message: result.message, lastFailure, timings: result.timings || null });
      return result;
    });
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
    notifyAutoReservationTask,
    runAutoReservationTask,
    prepareAutoReservationTask,
    librarySeatWaitlistPublic,
    saveLibrarySeatWaitlist,
    librarySeatWaitlistRequestTargets,
    librarySeatWaitlistFailureText,
    notifyLibrarySeatWaitlist,
    runLibrarySeatWaitlistTask,
    librarySeatAutoTaskPublic,
    saveLibrarySeatAutoTask,
    runLibrarySeatAutoTask,
    prepareLibrarySeatAutoTask
  };
}
