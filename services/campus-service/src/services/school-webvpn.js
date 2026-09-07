import {
  decryptLibroomConfigPayload,
  LIBROOM_ORIGIN,
  libroomCasFromCallback,
  libroomCasLoginOptionsFromConfig
} from "../lib/libroom.js";
import { discardUpstreamResponse } from "../lib/upstream-response.js";
import { HttpError } from "../lib/http.js";
import { JWXS_ORIGIN } from "../lib/academic-config.js";
import { mergeSessionJars } from "../lib/session-jar.js";
import { normalizeHtmlText } from "../lib/academic-parsers.js";
import { randomBytes } from "node:crypto";
import { webvpnVerifyUrlFromRedirect } from "../lib/school-url.js";

export function createSchoolWebvpnService({
  currentUserId,
  fetchWithJar,
  followRedirectsWithJar,
  logger,
  loginCasService,
  parseJsonLike,
  readSessionJar,
  readUpstreamText,
  saveSessionJar,
  userContextStorage,
  withAcademicSessionLock,
}) {
  const WEBVPN_ORIGIN = "https://webvpn.hgu.edu.cn";

  const WEBVPN_CAS_LOGIN_URL = `${WEBVPN_ORIGIN}/passport/v1/public/casLogin?sfDomain=cas96624`;

  async function requestAcademicHtml(jar, targetUrl, { referer = JWXS_ORIGIN } = {}) {
    const { response, url: finalUrl } = await followRedirectsWithJar(targetUrl, jar, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer
      }
    });
    const html = await readUpstreamText(response);
    if (response.status >= 400) {
      throw new HttpError(response.status, `教务系统返回 HTTP ${response.status}`, {
        finalUrl,
        sample: normalizeHtmlText(html).slice(0, 240)
      });
    }
    return { html, finalUrl };
  }

  function looksLikeCasLoginHtml(html, finalUrl = "") {
    const sample = String(html || "").slice(0, 5000);
    return finalUrl.includes("/cas/login") || /统一身份认证|name=["']execution["']|id=["']authcode["']/.test(sample);
  }

  function looksLikeAcademicTimetableHtml(html) {
    const sample = String(html || "").slice(0, 200000);
    return /选课结果|courseTable|课程号[\s\S]{0,300}选课状态[\s\S]{0,80}时间[\s\S]{0,80}地点/.test(sample);
  }

  function extractWebvpnVerifyUrl(html, baseUrl) {
    const redirectedVerifyUrl = webvpnVerifyUrlFromRedirect(baseUrl, baseUrl);
    if (redirectedVerifyUrl) return redirectedVerifyUrl;
    try {
      const url = new URL(baseUrl);
      if (url.hostname === new URL(WEBVPN_ORIGIN).hostname && url.pathname === "/portal/shortcut.html" && url.searchParams.get("t")) {
        const verify = new URL("/controller/v1/public/verify", WEBVPN_ORIGIN);
        verify.searchParams.set("t", url.searchParams.get("t"));
        return verify.href;
      }
    } catch {
      // Fall through to HTML script extraction.
    }
    const source = String(html || "");
    const match = source.match(/locationUrl\s*=\s*["']([^"']*\/controller\/v1\/public\/verify[^"']*)["']/)
      || source.match(/window\.location(?:\.href)?\s*=\s*["']([^"']*\/controller\/v1\/public\/verify[^"']*)["']/);
    return match ? new URL(match[1], baseUrl).href : "";
  }

  function webvpnClientUrl(path) {
    const url = new URL(path, WEBVPN_ORIGIN);
    url.searchParams.set("clientType", "SDPBrowserClient");
    url.searchParams.set("platform", "Windows");
    url.searchParams.set("lang", "zh-CN");
    return url.href;
  }

  function webvpnHeaders(extra = {}) {
    return {
      accept: "application/json, text/plain, */*",
      "x-sdp-rid": Buffer.from(new URL(WEBVPN_ORIGIN).host).toString("base64"),
      ...extra
    };
  }

  function webvpnData(payload) {
    return payload && typeof payload.data === "object" && payload.data !== null ? payload.data : {};
  }

  function webvpnMessage(payload, fallback) {
    return payload?.message || payload?.msg || fallback;
  }

  function assertWebvpnOk(payload, context) {
    if (payload?.code === 0) return;
    throw new HttpError(502, `${context}：${webvpnMessage(payload, "学校 WebVPN 返回失败")}`, {
      code: payload?.code,
      traceId: payload?.traceId
    });
  }

  async function requestWebvpnJson(jar, targetUrl, {
    method = "GET",
    headers = {},
    body,
    referer = `${WEBVPN_ORIGIN}/portal/`
  } = {}) {
    const url = new URL(targetUrl, WEBVPN_ORIGIN).href;
    const response = await fetchWithJar(url, {
      jar,
      method,
      headers: webvpnHeaders({ referer, ...headers }),
      body
    });
    const text = await readUpstreamText(response);
    let payload = null;
    try {
      payload = parseJsonLike(text);
    } catch {
      payload = null;
    }
    if (response.status >= 400) {
      throw new HttpError(response.status, webvpnMessage(payload, `WebVPN 返回 HTTP ${response.status}`), {
        endpoint: new URL(url).pathname,
        code: payload?.code,
        sample: normalizeHtmlText(text).slice(0, 200)
      });
    }
    if (!payload || typeof payload !== "object") {
      throw new HttpError(502, "WebVPN 返回的 JSON 结构不符合预期。", {
        endpoint: new URL(url).pathname,
        sample: normalizeHtmlText(text).slice(0, 200)
      });
    }
    return payload;
  }

  function parseWebvpnCallbackData(callbackUrl) {
    try {
      const raw = new URL(callbackUrl).searchParams.get("data");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function addWebvpnClientParams(url) {
    url.searchParams.set("clientType", "SDPBrowserClient");
    url.searchParams.set("platform", "Windows");
    url.searchParams.set("lang", "zh-CN");
    return url;
  }

  function extractSimpleLocationRedirectUrl(html, baseUrl) {
    const source = String(html || "");
    if (source.length > 3500) return "";
    const isShell = /navigator\.userAgent\.search\(['"]ms-office['"]\)|var\s+locationUrl\s*=/.test(source);
    if (!isShell) return "";
    const direct = source.match(/location\.replace\(["']([^"']+)/)
      || source.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)/);
    if (direct) return new URL(direct[1], baseUrl).href;
    const variable = source.match(/locationUrl\s*=\s*["']([^"']+)["']/);
    return variable ? new URL(variable[1], baseUrl).href : "";
  }

  async function fetchLibroomWithWebvpn(jar, targetUrl, {
    method = "GET",
    headers = {},
    body,
    attempt = 0
  } = {}) {
    const response = await fetchWithJar(targetUrl, {
      jar,
      method,
      headers: {
        accept: "application/json, text/plain, */*",
        referer: `${LIBROOM_ORIGIN}/h5/index.html`,
        ...headers
      },
      body
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const verifyUrl = webvpnVerifyUrlFromRedirect(location, targetUrl);
      if (verifyUrl && attempt < 2) {
        await discardUpstreamResponse(response);
        await ensureWebvpnSession(jar);
        const verified = await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: targetUrl });
        if (method.toUpperCase() === "GET" && libroomCasFromCallback(verified.finalUrl)) {
          return { response: { status: 200, headers: new Headers() }, text: verified.html, finalUrl: verified.finalUrl };
        }
        return fetchLibroomWithWebvpn(jar, targetUrl, { method, headers, body, attempt: attempt + 1 });
      }
      return { response, text: null, finalUrl: targetUrl };
    }

    const text = await readUpstreamText(response);
    const verifyUrl = extractWebvpnVerifyUrl(text, targetUrl);
    if (verifyUrl && attempt < 2) {
      await ensureWebvpnSession(jar);
      await requestAcademicHtmlWithSimpleRedirects(jar, verifyUrl, { referer: targetUrl });
      return fetchLibroomWithWebvpn(jar, targetUrl, { method, headers, body, attempt: attempt + 1 });
    }

    return { response, text, finalUrl: targetUrl };
  }

  async function getLibroomCasLoginOptions(jar) {
    const { response, text } = await fetchLibroomWithWebvpn(jar, new URL("/v4/index/peizhi", LIBROOM_ORIGIN).href, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        origin: LIBROOM_ORIGIN,
        referer: `${LIBROOM_ORIGIN}/h5/index.html`
      }
    });
    if (response.status < 200 || response.status >= 300) {
      throw new HttpError(502, "图书馆预约系统配置读取失败。", { status: response.status }, "LIBROOM_CONFIG_FAILED");
    }
    const payload = parseJsonLike(text || "{}");
    const config = decryptLibroomConfigPayload(payload?.data?.data ?? payload?.data);
    if (!config) throw new HttpError(502, "图书馆预约系统配置解密失败。", null, "LIBROOM_CONFIG_DECRYPT_FAILED");
    return libroomCasLoginOptionsFromConfig(config?.config || config);
  }

  async function requestLibroomJsonWithWebvpn(jar, pathname, data = {}, { token = "" } = {}) {
    const headers = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      origin: LIBROOM_ORIGIN,
      referer: `${LIBROOM_ORIGIN}/h5/index.html`
    };
    if (token) headers.authorization = `bearer${token}`;

    const { response, text } = await fetchLibroomWithWebvpn(jar, new URL(pathname, LIBROOM_ORIGIN).href, {
      method: "POST",
      headers,
      body: JSON.stringify(data || {})
    });

    let payload;
    try {
      payload = parseJsonLike(text || "{}");
    } catch {
      throw new HttpError(502, "空间预约系统返回的 JSON 结构不符合预期。", {
        endpoint: pathname,
        sample: normalizeHtmlText(text).slice(0, 200)
      });
    }

    return {
      payload,
      status: response.status,
      ok: response.status >= 200 && response.status < 300
    };
  }

  function looksLikeAcademicLoginHtml(html, finalUrl = "") {
    const url = String(finalUrl || "");
    const sample = String(html || "").slice(0, 5000);
    return looksLikeCasLoginHtml(html, finalUrl)
      || /\/(?:gotoLogin|login|sigin)(?:$|[?#])/.test(new URL(url, JWXS_ORIGIN).pathname)
      || /location\.replace\(["']https:\/\/newjwxs\.hgu\.edu\.cn(?::443)?\/(?:gotoLogin|login|sigin)/.test(sample);
  }

  async function requestAcademicHtmlWithSimpleRedirects(jar, targetUrl, { referer = JWXS_ORIGIN } = {}) {
    let currentUrl = targetUrl;
    let currentReferer = referer;
    let page = null;
    for (let i = 0; i < 6; i += 1) {
      page = await requestAcademicHtml(jar, currentUrl, { referer: currentReferer });
      const redirectUrl = extractSimpleLocationRedirectUrl(page.html, page.finalUrl);
      if (!redirectUrl) return page;
      currentReferer = page.finalUrl;
      currentUrl = redirectUrl;
    }
    return page;
  }

  async function ensureWebvpnSessionUnlocked(jar, { username, password, rememberMe = true } = {}) {
    let { response, url: callbackUrl } = await followRedirectsWithJar(WEBVPN_CAS_LOGIN_URL, jar, {
      method: "GET",
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
    });
    let html = await readUpstreamText(response);

    if (looksLikeCasLoginHtml(html, callbackUrl)) {
      if (!username || !password) {
        throw new HttpError(401, "统一身份认证会话已过期，请重新登录学校账号。");
      }
      const serviceUrl = new URL(callbackUrl).searchParams.get("service") || WEBVPN_CAS_LOGIN_URL;
      const logged = await loginCasService({ jar, username, password, rememberMe, serviceUrl });
      callbackUrl = logged.url;
      html = await readUpstreamText(logged.response);
    }

    const callback = new URL(callbackUrl, WEBVPN_ORIGIN);
    if (callback.searchParams.get("nextService") !== "auth/authCheck") {
      const appList = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/user/appList"), { referer: `${WEBVPN_ORIGIN}/portal/` });
      assertWebvpnOk(appList, "WebVPN 应用列表校验失败");
      return;
    }

    const authConfig = await requestWebvpnJson(jar, `${WEBVPN_ORIGIN}/passport/v1/public/authConfig?mod=1`, {
      referer: callbackUrl
    });
    assertWebvpnOk(authConfig, "WebVPN 初始化失败");
    const csrfToken = webvpnData(authConfig).security?.csrfToken || "";

    const callbackData = parseWebvpnCallbackData(callbackUrl);
    if (callbackData?.env?.need && callbackData.ticket) {
      jar.meta.academic ||= {};
      jar.meta.academic.webvpnDeviceId ||= `00${randomBytes(32).toString("hex")}`;
      const report = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/public/reportEnv"), {
        method: "POST",
        referer: callbackUrl,
        headers: {
          "content-type": "application/json",
          origin: WEBVPN_ORIGIN,
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          ticket: callbackData.ticket,
          deviceId: jar.meta.academic.webvpnDeviceId,
          env: {
            endpoint: {
              device_id: jar.meta.academic.webvpnDeviceId,
              device: { type: "browser" }
            }
          }
        })
      });
      assertWebvpnOk(report, "WebVPN 浏览器环境上报失败");
    }

    const authCheckUrl = addWebvpnClientParams(new URL("/passport/v1/auth/authCheck", WEBVPN_ORIGIN));
    callback.searchParams.forEach((value, key) => authCheckUrl.searchParams.set(key, value));
    const authCheck = await requestWebvpnJson(jar, authCheckUrl.href, {
      referer: callbackUrl,
      headers: { "x-csrf-token": csrfToken }
    });
    if (authCheck?.code !== 0 && /concurrency login/i.test(webvpnMessage(authCheck, ""))) {
      // 学校网关在前一个登录刚完成时仍可能短暂返回并发登录；先复用已建立的会话。
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        const recoveredAppList = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/user/appList"), {
          referer: `${WEBVPN_ORIGIN}/portal/`,
          headers: { "x-csrf-token": csrfToken }
        });
        if (recoveredAppList?.code === 0) {
          jar.meta.academic ||= {};
          jar.meta.academic.webvpnCapturedAt = new Date().toISOString();
          logger.warn("webvpn_concurrency_login_recovered", { userId: currentUserId() });
          return;
        }
      } catch (error) {
        logger.warn("webvpn_concurrency_login_recovery_failed", { userId: currentUserId(), error });
      }
    }
    assertWebvpnOk(authCheck, "WebVPN 认证确认失败");

    const appList = await requestWebvpnJson(jar, webvpnClientUrl("/controller/v1/user/appList"), {
      referer: `${WEBVPN_ORIGIN}/portal/`,
      headers: { "x-csrf-token": csrfToken }
    });
    assertWebvpnOk(appList, "WebVPN 应用列表校验失败");

    jar.meta.academic ||= {};
    jar.meta.academic.webvpnCapturedAt = new Date().toISOString();
  }

  async function ensureWebvpnSession(jar, credentials = {}) {
    if (userContextStorage.getStore()?.academicSessionLockHeld) {
      return ensureWebvpnSessionUnlocked(jar, credentials);
    }
    return withAcademicSessionLock(async () => {
      const latestJar = await readSessionJar();
      Object.assign(jar, mergeSessionJars(latestJar, jar));
      const result = await ensureWebvpnSessionUnlocked(jar, credentials);
      await saveSessionJar(jar);
      return result;
    });
  }
  return {
    requestAcademicHtml,
    looksLikeCasLoginHtml,
    looksLikeAcademicTimetableHtml,
    extractWebvpnVerifyUrl,
    extractSimpleLocationRedirectUrl,
    fetchLibroomWithWebvpn,
    getLibroomCasLoginOptions,
    requestLibroomJsonWithWebvpn,
    looksLikeAcademicLoginHtml,
    requestAcademicHtmlWithSimpleRedirects,
    ensureWebvpnSession
  };
}
