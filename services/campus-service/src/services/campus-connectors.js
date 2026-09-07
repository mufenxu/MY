import { casServiceFromTicketRedirect, UIAS_ENDPOINTS, uiasCasServiceUrl } from "../lib/uias-cas.js";
import { createCampusBillService } from "../lib/campus-bills.js";
import { createCipheriv, createDecipheriv, createHash, randomUUID } from "node:crypto";
import { discardUpstreamResponse } from "../lib/upstream-response.js";
import { HttpError } from "../lib/http.js";
import { requestMemo } from "../lib/request-memo.js";
import { runWithAuthRecovery } from "../lib/auth-recovery.js";

export function createCampusConnectors({
  assertAllowedSchoolUrl,
  campusSessionSummary,
  CAS_ORIGIN,
  cleanParams,
  currentUserId,
  defaultMonth,
  fetchWithJar,
  formEncode,
  getCasTicketRedirect,
  logger,
  md5,
  normalizeCampusBillQuery,
  parseJsonLike,
  randomAlphaNum,
  readSessionJar,
  readUpstreamText,
  REQUEST_TIMEOUT_MS,
  saveSessionJar,
  sm2,
  sm3,
  sortedParamString,
  userContextStorage,
}) {
  const YKT_ORIGIN = "https://ykt.hgu.edu.cn";

  const UIAS_LOGIN_URL = `${YKT_ORIGIN}/uias-h5/login`;

  const EASYTONG_APP_URL = `${YKT_ORIGIN}/easytong_webapp/index.html#/aotoLogin?name=balance`;

  const EASYTONG_RECHARGE_APP_URL = `${YKT_ORIGIN}/easytong_webapp/index.html#/aotoLogin?name=rechargeYm`;

  const UWC_APP_URL = `${YKT_ORIGIN}/uwc_webapp/#/home`;

  const EASYTONG_UIAS_APP = Object.freeze({
    key: "easytong",
    appUrl: EASYTONG_APP_URL,
    pathHints: ["/easytong_webapp/"],
    routeHints: ["name=balance", "#/balance", "balance"]
  });

  const EASYTONG_RECHARGE_UIAS_APP = Object.freeze({
    key: "easytongRecharge",
    appUrl: EASYTONG_RECHARGE_APP_URL,
    pathHints: ["/easytong_webapp/"],
    routeHints: ["name=recharge", "recharge"]
  });

  const UWC_UIAS_APP = Object.freeze({
    key: "uwc",
    appUrl: UWC_APP_URL,
    pathHints: ["/uwc_webapp/"],
    routeHints: ["uwc_webapp"]
  });

  const APPDM_MOBILE_CAS_URL_FALLBACK = `${CAS_ORIGIN}/cas/oauth2.0/authorize?response_type=code&client_id=yktgyxtydd&state=home&scope=ssomp&redirect_uri=https%3A%2F%2Fykt.hgu.edu.cn%2Fappdm-home%2Fappsys%2FsudytechOAuthLogin%2FmobileLogin`;

  const APPDM_AES_KEY_FALLBACK = process.env.HGU_APPDM_AES_KEY || "shuangqibestbest";

  const UIAS_PORTAL_APPS_TTL_MS = 2 * 60 * 1000;

  const UIAS_PORTAL_APPS_MAX_ITEMS = 100;

  const UIAS_SIGN_PRIVATE_KEY = process.env.HGU_UIAS_SIGN_PRIVATE_KEY || "e04d85ea0b237f2dfca75aa073978263227b48a0ee742f40f60cc89c6b5f6eee";

  const EASYTONG_MD5_KEY = process.env.HGU_EASYTONG_MD5_KEY || "ok15we1@oid8x5afd@";

  const UWC_SIGN_KEY = process.env.HGU_UWC_SIGN_KEY || "hzsun.com.uwc的sign验签加密key";

  const UWC_3DES_KEY = process.env.HGU_UWC_3DES_KEY || "684523174589651002354157";

  const UWC_RESPONSE_3DES_KEY = process.env.HGU_UWC_RESPONSE_3DES_KEY || "123457890ABCDEGHIJ123456";

  const UWC_3DES_IV = process.env.HGU_UWC_3DES_IV || "00000000";

  function uiasRequestSignature({ method, path, params, data, nonce, date }) {
    const upperMethod = method.toUpperCase();
    const digestSource = upperMethod === "GET" || upperMethod === "DELETE"
      ? sortedParamString(params)
      : sortedParamString(data);
    const digest = digestSource ? md5(digestSource) : "";
    const signText = `${upperMethod}\n${path}\n${digest}\n${nonce}\n${date.toUTCString()}`;
    return sm2.doSignature(sm3(signText), UIAS_SIGN_PRIVATE_KEY);
  }

  async function uiasRequest(jar, name, {
    method = "GET",
    params = {},
    data,
    authorization = "",
    referer = `${YKT_ORIGIN}/uias-h5/login`
  } = {}) {
    const path = UIAS_ENDPOINTS[name] || name;
    const upperMethod = method.toUpperCase();
    const requestUrl = new URL(path, YKT_ORIGIN);
    const cleanQuery = cleanParams(params);
    if (upperMethod === "GET" || upperMethod === "DELETE") {
      Object.entries(cleanQuery).forEach(([key, value]) => requestUrl.searchParams.append(key, String(value)));
    }

    const nonce = randomAlphaNum(12);
    const date = new Date();
    const headers = {
      accept: "application/json, text/plain, */*",
      Authorization: authorization || "",
      nonce,
      timestamp: String(date.getTime()),
      charset: "utf-8",
      Sign: uiasRequestSignature({
        method: upperMethod,
        path,
        params: cleanQuery,
        data,
        nonce,
        date
      }),
      referer
    };

    let body;
    if (upperMethod !== "GET" && upperMethod !== "DELETE") {
      headers["content-type"] = "application/json;charset=UTF-8";
      body = JSON.stringify(data || {});
    }

    const response = await fetchWithJar(requestUrl.href, {
      jar,
      method: upperMethod,
      headers,
      body,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    if (!response.ok) {
      throw new HttpError(response.status, `UIAS 返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });
    }

    const payload = parseJsonLike(text || "{}");
    if (payload.code === 200) return payload.data;
    if (payload.code === undefined && payload.data !== undefined) return payload.data;
    throw new HttpError(401, payload.msg || payload.message || "UIAS 登录失败", { endpoint: path, code: payload.code });
  }

  async function loginUiasByCas(jar, credentials) {
    // The current portal enters UIAS through the bare login URL. Embedding an app
    // route in the CAS service makes UIAS rebuild a different service and reject
    // the otherwise valid one-time ticket.
    const serviceUrl = uiasCasServiceUrl(UIAS_LOGIN_URL);
    const loginBaseUrl = await uiasRequest(jar, "CasLoginUrl");
    if (typeof loginBaseUrl !== "string" || !loginBaseUrl) {
      throw new HttpError(502, "UIAS 未返回 CAS 登录地址。");
    }
    const finalUrl = await getCasTicketRedirect({ ...credentials, jar, serviceUrl, loginBaseUrl });
    const { ticket, serviceUrl: returnedServiceUrl } = casServiceFromTicketRedirect(finalUrl);
    if (!ticket) {
      throw new HttpError(401, "CAS 已登录，但 UIAS 未返回 ticket。");
    }

    await uiasRequest(jar, "CasLogin", {
      referer: finalUrl,
      params: {
        ticket,
        loginSrc: 2,
        service: returnedServiceUrl
      }
    });

    jar.meta.campus ||= {};
    delete jar.meta.campus.portalApps;
    jar.meta.campus.uias = {
      capturedAt: new Date().toISOString()
    };
  }

  function uiasPortalList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.records)) return payload.records;
    if (Array.isArray(payload?.list)) return payload.list;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  function sanitizeUiasPortalApp(app = {}) {
    return {
      applicationId: app.applicationId ?? app.id ?? null,
      appId: app.appId ?? app.clientId ?? app.client_id ?? null,
      clientId: app.clientId ?? app.client_id ?? app.appId ?? null,
      applicationName: app.applicationName ?? app.name ?? app.desc ?? null,
      instruction: app.instruction ?? app.desc ?? null,
      envIp: app.envIp ?? app.appUrl ?? app.url ?? null,
      sdk: app.sdk ?? null
    };
  }

  function cachedUiasPortalApps(jar) {
    const cached = jar.meta?.campus?.portalApps;
    const capturedAt = Date.parse(cached?.capturedAt || "");
    if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > UIAS_PORTAL_APPS_TTL_MS) return null;
    if (!Array.isArray(cached.list)) return null;
    return cached.list.slice(0, UIAS_PORTAL_APPS_MAX_ITEMS);
  }

  async function getUiasPortalApps(jar, { force = false } = {}) {
    if (!force) {
      const cached = cachedUiasPortalApps(jar);
      if (cached) return structuredClone(cached);
    }

    const cacheKey = `uias-portal-apps:${currentUserId()}:${jar.meta?.campus?.uias?.capturedAt || "unknown"}`;
    return requestMemo(userContextStorage.getStore(), cacheKey, async () => {
      const results = await Promise.allSettled([
        uiasRequest(jar, "MyApplication"),
        uiasRequest(jar, "MyRecommendApplication")
      ]);
      const unique = new Map();
      for (const app of results.flatMap((result) => (
        result.status === "fulfilled" ? uiasPortalList(result.value) : []
      )).map(sanitizeUiasPortalApp)) {
        const key = [app.applicationId, app.clientId, app.appId, app.envIp, app.applicationName, app.sdk]
          .map((value) => String(value || ""))
          .join("|");
        if (!unique.has(key)) unique.set(key, app);
        if (unique.size >= UIAS_PORTAL_APPS_MAX_ITEMS) break;
      }
      const apps = [...unique.values()];
      if (apps.length) {
        jar.meta.campus ||= {};
        jar.meta.campus.portalApps = {
          capturedAt: new Date().toISOString(),
          list: apps
        };
      }
      return apps;
    }, { clone: structuredClone });
  }

  function portalAppSearchText(app) {
    return [
      app.applicationId,
      app.appId,
      app.clientId,
      app.applicationName,
      app.instruction,
      app.envIp,
      app.sdk
    ]
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value).toLowerCase())
      .join(" ");
  }

  function portalAppScore(app, target) {
    const text = portalAppSearchText(app);
    let score = 0;
    const appUrl = String(target.appUrl || "").toLowerCase();
    if (appUrl && text.includes(appUrl)) score += 100;
    for (const hint of target.routeHints || []) {
      if (hint && text.includes(String(hint).toLowerCase())) score += 50;
    }
    for (const hint of target.pathHints || []) {
      if (hint && text.includes(String(hint).toLowerCase())) score += 20;
    }
    return score;
  }

  async function findUiasPortalApp(jar, target, knownApps = null) {
    const apps = knownApps || await getUiasPortalApps(jar).catch(() => []);
    return apps
      .map((app) => ({ app, score: portalAppScore(app, target) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.app || null;
  }

  function addUiasTokenCandidate(candidates, label, params) {
    const clean = cleanParams(params);
    if (!Object.keys(clean).length) return;
    const key = JSON.stringify(clean);
    if (candidates.some((candidate) => candidate.key === key)) return;
    candidates.push({ key, label, params: clean });
  }

  async function getUiasAppToken(jar, targetInput, isCas = 1, { portalApps = null } = {}) {
    const target = typeof targetInput === "string" ? { appUrl: targetInput } : { ...targetInput };
    const candidates = [];
    const portalApp = await findUiasPortalApp(jar, target, portalApps);
    const clientId = portalApp?.clientId || portalApp?.appId;
    if (clientId) {
      addUiasTokenCandidate(candidates, "portal-client", { clientId });
      addUiasTokenCandidate(candidates, "portal-client-cas", { clientId, isCas, isAppEnter: 0 });
    }
    if (portalApp?.envIp) {
      addUiasTokenCandidate(candidates, "portal-url", {
        appUrl: portalApp.envIp,
        isCas,
        isAppEnter: 0
      });
    }
    addUiasTokenCandidate(candidates, "app-url", {
      appUrl: target.appUrl,
      isCas,
      isAppEnter: 0
    });

    let lastError = null;
    for (const candidate of candidates) {
      try {
        const data = await uiasRequest(jar, "AppToken", { params: candidate.params });
        const token = data?.value || data?.token || data;
        if (token && typeof token === "string") return token;
        throw new HttpError(502, `UIAS 未返回应用 token（${candidate.label}）。`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new HttpError(502, "UIAS 未返回应用 token。");
  }

  function easytongSignPayload(input = {}) {
    const payload = { ...input };
    payload.Time ||= formatDateCompact();
    const values = Object.keys(payload)
      .sort()
      .map((key) => payload[key])
      .join("|");
    payload.Sign = md5(`${values}|${EASYTONG_MD5_KEY}`);
    payload.ContentType = "application/json";
    return payload;
  }

  function formatDateCompact(date = new Date()) {
    // School signatures expect Beijing time, while many public servers run in UTC.
    const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const y = chinaTime.getUTCFullYear();
    const mo = String(chinaTime.getUTCMonth() + 1).padStart(2, "0");
    const d = String(chinaTime.getUTCDate()).padStart(2, "0");
    const h = String(chinaTime.getUTCHours()).padStart(2, "0");
    const mi = String(chinaTime.getUTCMinutes()).padStart(2, "0");
    const s = String(chinaTime.getUTCSeconds()).padStart(2, "0");
    return `${y}${mo}${d}${h}${mi}${s}`;
  }

  function tripleBase64Decode(value) {
    let output = String(value || "");
    for (let i = 0; i < 3; i += 1) {
      try {
        output = Buffer.from(decodeURIComponent(output), "base64").toString("utf8");
      } catch {
        return value;
      }
    }
    return output || value;
  }

  function normalizeRemoteError(payload, fallback) {
    if (!payload) return fallback;
    return payload.msg || payload.Msg || payload.message || fallback;
  }

  function upstreamErrorContext(error, stage = "") {
    return {
      stage,
      status: error?.status || null,
      code: error?.code || error?.details?.code || null,
      endpoint: error?.details?.endpoint || null,
      message: error?.message || "unknown upstream error"
    };
  }

  function isEasytongAuthMessage(message) {
    return /access[_-]?token|token|Token|TOKEN|ticket|Ticket|TICKET|未登录|登录已失效|登录过期|授权/.test(String(message || ""));
  }

  function easytongErrorStatus(payload) {
    const code = payload?.code ?? payload?.Code;
    const message = normalizeRemoteError(payload, "");
    if (String(code) === "40004" || isEasytongAuthMessage(message)) return 401;
    return 502;
  }

  async function easytongRawPost(jar, path, body, token = "") {
    const requestUrl = new URL(path, YKT_ORIGIN);
    const headers = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; charset=utf-8",
      referer: `${YKT_ORIGIN}/easytong_webapp/index.html`,
      origin: YKT_ORIGIN
    };
    if (token) headers.Authorization = token;

    const response = await fetchWithJar(requestUrl.href, {
      jar,
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    if (!response.ok) throw new HttpError(response.status, `一卡通返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });
    return parseJsonLike(text || "{}");
  }

  async function easytongRequest(jar, path, data = {}, token = "") {
    const requestUrl = new URL(path, YKT_ORIGIN);
    const payload = easytongSignPayload(cleanParams(data));
    const headers = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
      h5Req: "Y",
      referer: `${YKT_ORIGIN}/easytong_webapp/index.html`,
      origin: YKT_ORIGIN
    };
    if (token) headers.Authorization = token;

    const response = await fetchWithJar(requestUrl.href, {
      jar,
      method: "POST",
      headers,
      body: formEncode(payload),
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    if (!response.ok) throw new HttpError(response.status, `一卡通返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });

    const payloadJson = parseJsonLike(text || "{}");
    if (payloadJson.Code && payloadJson.Code !== "1") {
      throw new HttpError(easytongErrorStatus(payloadJson), normalizeRemoteError(payloadJson, "一卡通接口返回失败"), { endpoint: path, code: payloadJson.Code });
    }
    if (payloadJson.code !== undefined && payloadJson.code !== 1) {
      throw new HttpError(easytongErrorStatus(payloadJson), normalizeRemoteError(payloadJson, "一卡通接口返回失败"), { endpoint: path, code: payloadJson.code });
    }
    return payloadJson;
  }

  async function loginEasytongByUiasToken(jar, appToken) {
    const login = await easytongRawPost(jar, "/easytong_app/h5uia/uiaApp", { token: appToken });
    if (login.code !== 1 || !login.token) {
      throw new HttpError(401, normalizeRemoteError(login, "一卡通应用 token 换取失败"));
    }

    const accNum = tripleBase64Decode(login.accNum);
    const accInfo = await easytongRequest(jar, "/easytong_app/GetAccInfo", { AccNum: accNum }, login.token);
    const campus = jar.meta.campus ||= {};
    campus.easytong = {
      token: login.token,
      accNum: accInfo.accNum || accNum,
      epId: accInfo.epid || accInfo.epId || login.epid || null,
      perCode: accInfo.personId || null,
      accName: accInfo.accName || null,
      capturedAt: new Date().toISOString()
    };
    return campus.easytong;
  }

  function isEasytongAuthError(error) {
    return error?.status === 401 || isEasytongAuthMessage(error?.message);
  }

  async function refreshEasytongSession(jar) {
    try {
      const appToken = await getUiasAppToken(jar, EASYTONG_UIAS_APP, 1);
      await loginEasytongByUiasToken(jar, appToken);
    } catch {
      await loginUiasByCas(jar, {});
      const appToken = await getUiasAppToken(jar, EASYTONG_UIAS_APP, 1);
      await loginEasytongByUiasToken(jar, appToken);
    }
    jar.meta.campus ||= {};
    jar.meta.campus.lastError = null;
    await saveSessionJar(jar);
  }

  async function easytongAuthedRequest(jar, path, dataFactory = {}, options = {}) {
    const { retryOnAuth = true } = options;
    const buildData = () => {
      const session = campusAuth(jar, "easytong");
      const data = typeof dataFactory === "function" ? dataFactory(session) : dataFactory;
      return { session, data };
    };

    try {
      const { session, data } = buildData();
      return await easytongRequest(jar, path, data, session.token);
    } catch (error) {
      if (!retryOnAuth || !isEasytongAuthError(error)) throw error;
      await refreshEasytongSession(jar);
      const { session, data } = buildData();
      return easytongRequest(jar, path, data, session.token);
    }
  }

  function uwcMd5Base64(text) {
    const hex = createHash("md5").update(text, "utf8").digest("hex");
    return Buffer.from(hex, "utf8").toString("base64");
  }

  function uwcSign(input = {}) {
    const payload = { ...input, merchantKey: UWC_SIGN_KEY };
    const source = Object.keys(payload)
      .sort()
      .map((key) => `${key}=${payload[key]}`)
      .join("&");
    return uwcMd5Base64(source);
  }

  function uwcEncrypt(text) {
    const cipher = createCipheriv("des-ede3-cbc", Buffer.from(UWC_3DES_KEY, "utf8"), Buffer.from(UWC_3DES_IV, "utf8"));
    return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("base64");
  }

  function uwcDecryptWithKey(text, keyText) {
    const decipher = createDecipheriv("des-ede3-cbc", Buffer.from(keyText, "utf8"), Buffer.from(UWC_3DES_IV, "utf8"));
    return Buffer.concat([decipher.update(Buffer.from(text, "base64")), decipher.final()]).toString("utf8");
  }

  function uwcDecrypt(text) {
    const keys = [UWC_3DES_KEY, UWC_RESPONSE_3DES_KEY];
    for (const key of keys) {
      try {
        const decrypted = uwcDecryptWithKey(text, key);
        if (decrypted) return decrypted;
      } catch {
        // Try the alternate key used by some UWC deployments for response payloads.
      }
    }
    throw new HttpError(502, "生活用水接口响应解密失败。");
  }

  async function uwcRequest(jar, path, data = {}, token = "") {
    const requestUrl = new URL(`/uwc_web_app${path}`, YKT_ORIGIN);
    const payload = cleanParams(data);
    payload.sign = uwcSign(payload);
    const encrypted = uwcEncrypt(JSON.stringify(payload));
    const headers = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
      timestamp: String(Date.now()),
      nonceStr: randomUUID(),
      referer: `${YKT_ORIGIN}/uwc_webapp/`,
      origin: YKT_ORIGIN
    };
    if (token) headers.token = token;

    const response = await fetchWithJar(requestUrl.href, {
      jar,
      method: "POST",
      headers,
      body: `paramStr=${encodeURIComponent(encrypted)}`,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    if (!response.ok) throw new HttpError(response.status, `生活用水返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });

    const raw = parseJsonLike(text || "{}");
    if (!raw.resultMap) throw new HttpError(502, "生活用水接口未返回加密结果。", { endpoint: path, raw });
    const decrypted = parseJsonLike(uwcDecrypt(raw.resultMap));
    if (decrypted.code !== "1") {
      const status = decrypted.code === "-2" ? 401 : 400;
      throw new HttpError(status, decrypted.msg || "生活用水接口返回失败", { endpoint: path, code: decrypted.code });
    }

    const responseSign = decrypted.sign;
    delete decrypted.sign;
    if (responseSign && responseSign !== uwcSign(decrypted)) {
      throw new HttpError(502, "生活用水接口签名校验失败。", { endpoint: path });
    }
    if (decrypted.data && typeof decrypted.data === "string" && !path.includes("getUserToYM")) {
      decrypted.data = parseJsonLike(decrypted.data);
    }
    return decrypted;
  }

  function isUwcAuthError(error) {
    const message = String(error?.message || "");
    return error?.status === 401 || /账号在其他地方登录|未登录|登录已失效|登录过期|token|Token|TOKEN|ticket|Ticket|TICKET|授权/.test(message);
  }

  async function refreshUwcSession(jar) {
    try {
      const appToken = await getUiasAppToken(jar, UWC_UIAS_APP, 1);
      await loginUwcByUiasToken(jar, appToken);
    } catch {
      await activateCampusSessions(jar, {});
    }
    jar.meta.campus ||= {};
    jar.meta.campus.lastError = null;
    await saveSessionJar(jar);
  }

  async function uwcAuthedRequest(jar, path, dataFactory = {}, options = {}) {
    const { retryOnAuth = true, maxAuthRecoveries = 2 } = options;
    const buildData = () => {
      const session = campusAuth(jar, "uwc");
      const data = typeof dataFactory === "function" ? dataFactory(session) : dataFactory;
      return { session, data };
    };

    return runWithAuthRecovery(async () => {
      const { session, data } = buildData();
      return uwcRequest(jar, path, data, session.token);
    }, {
      isAuthError: isUwcAuthError,
      maxRecoveries: retryOnAuth ? maxAuthRecoveries : 0,
      onRecovery: async ({ attempt, error }) => {
        logger.info("uwc_session_auto_recovery", {
          userId: currentUserId(),
          endpoint: path,
          attempt,
          message: error?.message || "UWC authentication expired"
        });
      },
      recover: async () => refreshUwcSession(jar)
    });
  }

  async function getAppdmConfig(jar) {
    try {
      const response = await fetchWithJar(`${YKT_ORIGIN}/appdm-home/appsys/sys/config/listAll`, {
        jar,
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8",
          origin: YKT_ORIGIN,
          referer: `${YKT_ORIGIN}/appdm-home/wxweb/`
        },
        body: JSON.stringify({ timestamp: Date.now(), key: "" }),
        timeoutMs: REQUEST_TIMEOUT_MS
      });
      const text = await readUpstreamText(response);
      if (!response.ok) throw new HttpError(response.status, `公寓系统配置返回 HTTP ${response.status}`);
      const payload = parseJsonLike(text || "{}");
      if (payload.code !== 0) throw new HttpError(502, normalizeRemoteError(payload, "公寓系统配置读取失败"));
      const config = Object.fromEntries(
        (Array.isArray(payload.configList) ? payload.configList : [])
          .map((item) => [item.label || item.configKey, item.value ?? item.configValue])
          .filter(([key, value]) => key && value !== undefined && value !== null)
      );
      return {
        mobileCasUrl: config.MOBILE_CAS_URL || APPDM_MOBILE_CAS_URL_FALLBACK,
        aesKey: config.interfaceParam || APPDM_AES_KEY_FALLBACK
      };
    } catch {
      return {
        mobileCasUrl: APPDM_MOBILE_CAS_URL_FALLBACK,
        aesKey: APPDM_AES_KEY_FALLBACK
      };
    }
  }

  function appdmHashParams(finalUrl) {
    const hash = new URL(finalUrl).hash || "";
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(query);
  }

  function decryptAppdmSqCode(sqcode, aesKey) {
    const normalized = decodeURIComponent(String(sqcode || "")).replace(/\s/g, "+");
    const key = Buffer.from(aesKey, "utf8");
    const algorithm = key.length === 24 ? "aes-192-ecb" : key.length === 32 ? "aes-256-ecb" : "aes-128-ecb";
    const decipher = createDecipheriv(algorithm, key, null);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(normalized, "base64")), decipher.final()]).toString("utf8");
    if (!decrypted) throw new HttpError(401, "公寓系统授权解析失败，请重新登录学校账号。");
    return decrypted;
  }

  async function loginAppdmByCas(jar) {
    const config = await getAppdmConfig(jar);
    let currentUrl = config.mobileCasUrl;
    let finalUrl = currentUrl;
    let finalHtml = "";

    for (let i = 0; i < 10; i += 1) {
      const response = await fetchWithJar(currentUrl, {
        jar,
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        timeoutMs: REQUEST_TIMEOUT_MS
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await discardUpstreamResponse(response);
        if (!location) break;
        currentUrl = assertAllowedSchoolUrl(new URL(location, currentUrl).href);
        finalUrl = currentUrl;
        if (currentUrl.includes("#/hoyOauth?")) break;
        continue;
      }

      finalHtml = await readUpstreamText(response).catch(() => "");
      break;
    }

    const params = appdmHashParams(finalUrl);
    const sqcode = params.get("sqcode");
    if (!sqcode) {
      if (/id=["']fm1["']|统一身份认证|登录/.test(finalHtml)) {
        throw new HttpError(401, "统一身份认证会话已过期，请重新登录学校账号。");
      }
      throw new HttpError(401, "公寓系统授权未返回 token，请重新登录学校账号。");
    }

    const campus = jar.meta.campus ||= {};
    campus.appdm = {
      token: decryptAppdmSqCode(sqcode, config.aesKey),
      personId: params.get("personId") || null,
      capturedAt: new Date().toISOString()
    };
    campus.appdmLastError = null;
    return campus.appdm;
  }

  function isAppdmAuthError(error) {
    const message = String(error?.message || "");
    return error?.status === 401 || /token|Token|TOKEN|未登录|登录已失效|登录过期|授权|无效/.test(message);
  }

  async function appdmRequest(jar, path, {
    method = "POST",
    params = {},
    data = {},
    token = ""
  } = {}) {
    const upperMethod = method.toUpperCase();
    const requestUrl = new URL(`/appdm-home${path}`, YKT_ORIGIN);
    Object.entries(cleanParams({ ...params, t: Date.now() })).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, String(value));
    });

    const headers = {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      origin: YKT_ORIGIN,
      referer: `${YKT_ORIGIN}/appdm-home/wxweb/`
    };
    if (token) headers.token = token;

    const response = await fetchWithJar(requestUrl.href, {
      jar,
      method: upperMethod,
      headers,
      body: upperMethod === "GET" || upperMethod === "DELETE" ? undefined : JSON.stringify(data || {}),
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    if (!response.ok) throw new HttpError(response.status, `公寓系统返回 HTTP ${response.status}`, { endpoint: path, sample: text.slice(0, 200) });

    const payload = parseJsonLike(text || "{}");
    if (payload.code !== undefined && payload.code !== 0) {
      const status = payload.code === 401 || payload.code === 403 ? 401 : 502;
      throw new HttpError(status, normalizeRemoteError(payload, "公寓系统接口返回失败"), { endpoint: path, code: payload.code });
    }
    return payload;
  }

  async function appdmAuthedRequest(jar, path, options = {}) {
    const { retryOnAuth = true, ...requestOptions } = options;
    try {
      const session = campusAuth(jar, "appdm");
      return await appdmRequest(jar, path, { ...requestOptions, token: session.token });
    } catch (error) {
      if (!retryOnAuth || !isAppdmAuthError(error)) throw error;
      await loginAppdmByCas(jar);
      const session = campusAuth(jar, "appdm");
      return appdmRequest(jar, path, { ...requestOptions, token: session.token });
    }
  }

  async function loginUwcByUiasToken(jar, appToken) {
    const login = await uwcRequest(jar, "/miniapps/loginByToken", { uiastoken: appToken });
    if (login.code !== "1" || !login.data?.token) {
      throw new HttpError(401, normalizeRemoteError(login, "生活用水 token 换取失败"));
    }
    const campus = jar.meta.campus ||= {};
    campus.uwc = {
      token: login.data.token,
      accNum: login.data.accNum,
      epId: login.data.epId,
      userId: login.data.userId || null,
      perCode: login.data.perCode || null,
      accName: login.data.accName || null,
      capturedAt: new Date().toISOString()
    };
    return campus.uwc;
  }

  async function activateCampusSessions(jar, credentials) {
    let stage = "uias-cas-login";
    try {
      await loginUiasByCas(jar, credentials);
      const portalApps = await getUiasPortalApps(jar);
      stage = "uias-easytong-token";
      const easytongAppToken = await getUiasAppToken(jar, EASYTONG_UIAS_APP, 1, { portalApps });
      stage = "uias-uwc-token";
      const uwcAppToken = await getUiasAppToken(jar, UWC_UIAS_APP, 1, { portalApps });
      stage = "easytong-login";
      await loginEasytongByUiasToken(jar, easytongAppToken);
      stage = "uwc-login";
      await loginUwcByUiasToken(jar, uwcAppToken);
      await loginAppdmByCas(jar).catch((error) => {
        jar.meta.campus ||= {};
        jar.meta.campus.appdmLastError = error.message || "公寓系统自动连接失败";
      });
      jar.meta.campus ||= {};
      jar.meta.campus.lastError = null;
    } catch (error) {
      logger.warn("campus_activation_failed", {
        userId: currentUserId(),
        ...upstreamErrorContext(error, stage)
      });
      throw error;
    }
  }

  function campusAuth(jar, key) {
    const session = jar.meta?.campus?.[key];
    if (!session?.token) {
      throw new HttpError(401, "校园一卡通尚未连接，请重新登录学校账号。");
    }
    return session;
  }

  const campusBills = createCampusBillService({
    campusAuth,
    easytongAuthedRequest,
    uwcAuthedRequest
  });

  async function getCampusCard(queryInput = {}) {
    const billQuery = normalizeCampusBillQuery(queryInput);
    const jar = await readSessionJar();
    campusAuth(jar, "easytong");
    const wallet = await easytongAuthedRequest(jar, "/easytong_app/GetWalletMoney", (session) => ({
      AccNum: session.accNum,
      EPID: session.epId || 0
    }));
    // The wallet request performs the single auth-recovery step. The remaining
    // independent reads can then share that known-good token without racing two refreshes.
    const [cardsResult, billResult] = await Promise.allSettled([
      easytongAuthedRequest(jar, "/easytong_app/GetAccCardInfoForDev", (session) => ({
        AccNum: session.accNum,
        CardStatus: 2
      }), { retryOnAuth: false }),
      campusBills.getCardBill(jar, billQuery, { retryOnAuth: false })
    ]);
    const cards = cardsResult.status === "fulfilled" ? cardsResult.value : null;
    const bill = billResult.status === "fulfilled" ? billResult.value : {
      code: 1,
      list: [],
      msg: billResult.reason?.message || "暂无一卡通账单"
    };

    await saveSessionJar(jar);
    const session = campusAuth(jar, "easytong");
    const walletList = Array.isArray(wallet.list) ? wallet.list : [];
    return {
      account: {
        accNum: session.accNum,
        accName: session.accName,
        epId: session.epId
      },
      wallet,
      cards,
      bill,
      billQuery,
      totalBalance: walletList.reduce((sum, item) => sum + Number(item.walletMoney ?? item.ewalletMoney ?? 0), 0)
    };
  }

  async function getCampusWater(queryInput = {}) {
    const billQuery = normalizeCampusBillQuery(queryInput);
    const waterMonth = billQuery.mode === "month" ? billQuery.time : defaultMonth();
    const jar = await readSessionJar();
    campusAuth(jar, "uwc");
    // UWC can invalidate the earlier token when concurrent requests both refresh it.
    // Resolve the user-facing code first, then reuse the recovered session for bills.
    const waterCode = await uwcAuthedRequest(jar, "/randomWaterCodeApp/queryRanCode", (currentSession) => ({
      accNum: currentSession.accNum,
      epId: currentSession.epId
    })).catch((error) => ({ error: error.message }));
    const waterBill = await campusBills.getWaterBill(jar, waterMonth).catch((error) => ({ error: error.message }));

    const session = campusAuth(jar, "uwc");
    await saveSessionJar(jar);
    return {
      account: {
        accNum: session.accNum,
        accName: session.accName,
        epId: session.epId
      },
      waterCode,
      waterBill,
      billQuery: {
        mode: "month",
        time: waterMonth,
        label: waterMonth
      }
    };
  }

  async function refreshCampusWaterCode() {
    await ensureCampusSessions();
    const jar = await readSessionJar();
    const waterCode = await uwcAuthedRequest(jar, "/randomWaterCodeApp/createRanCode", (session) => ({
      accNum: session.accNum,
      epId: session.epId
    }));
    const session = campusAuth(jar, "uwc");
    await saveSessionJar(jar);
    return {
      account: {
        accNum: session.accNum,
        accName: session.accName,
        epId: session.epId
      },
      waterCode,
      generatedAt: new Date().toISOString()
    };
  }

  async function ensureCampusSessions() {
    const jar = await readSessionJar();
    const campus = campusSessionSummary(jar);
    if (campus.hasEasytongToken && campus.hasUwcToken && campus.hasAppdmToken) return;

    try {
      if (!campus.hasEasytongToken || !campus.hasUwcToken) {
        await activateCampusSessions(jar, {});
      } else if (!campus.hasAppdmToken) {
        await loginAppdmByCas(jar);
      }
    } catch (error) {
      jar.meta.campus ||= {};
      if (!campus.hasEasytongToken || !campus.hasUwcToken) {
        jar.meta.campus.lastError = error.message || "校园一卡通自动连接失败";
      } else {
        jar.meta.campus.appdmLastError = error.message || "公寓系统自动连接失败";
      }
    }
    await saveSessionJar(jar);
  }

  async function getCampusAccommodation() {
    const jar = await readSessionJar();
    if (!jar.meta?.campus?.appdm?.token) {
      try {
        await loginAppdmByCas(jar);
      } catch (error) {
        jar.meta.campus ||= {};
        jar.meta.campus.appdmLastError = error.message || "公寓系统自动连接失败";
        await saveSessionJar(jar);
        throw error;
      }
    }

    const userInfo = await appdmAuthedRequest(jar, "/appsys/sys/user/info", { method: "GET" });
    const username = userInfo.user?.username || jar.meta?.campus?.appdm?.personId;
    if (!username) throw new HttpError(502, "公寓系统未返回学号，无法查询住宿信息。");

    const now = formatDateCompact();
    const personPayload = await appdmAuthedRequest(jar, "/appou/person/search/queryPersonDetailInfoByPersonsn", {
      method: "POST",
      params: {
        personsn: username,
        accessKey: md5(`${username}SQ${now}`),
        timestamp: Date.now()
      }
    });
    const person = personPayload.personvo || personPayload.data?.personvo || personPayload.data || {};
    const bedCode = person.bedCode || "";

    const [roomiesResult, deviceResult] = await Promise.allSettled([
      bedCode
        ? appdmAuthedRequest(jar, "/appdm/scattered/scatteredreside/selectInRoomStudentInfoListBybedCode", {
          method: "POST",
          params: {
            bedCode,
            accessKey: md5(`${bedCode}SQ${formatDateCompact()}`),
            timestamp: Date.now()
          }
        })
        : Promise.resolve({ page: { list: [] } }),
      bedCode
        ? appdmAuthedRequest(jar, "/appdm/dormitory/dormitorydevice/getDeviceInfo", {
          method: "POST",
          params: { bedCode, type: "10" }
        })
        : Promise.resolve({})
    ]);

    await saveSessionJar(jar);

    const checkInDate = person.checkInDate || "";
    const checkOutDate = person.checkOutDate || "";
    const accommodationStatus = person.accommodationStatus === "是"
      ? "已入住"
      : person.accommodationStatus === "否"
        ? "未入住"
        : (person.accommodationStatus || "--");

    return {
      account: {
        username,
        realName: userInfo.user?.realName || person.personname || null,
        personId: jar.meta?.campus?.appdm?.personId || null
      },
      profile: {
        studentNo: person.personsn || username,
        name: person.personname || userInfo.user?.realName || "--",
        collegeInfo: person.collegeInfo || person.department || "--",
        dormitoryInfo: person.dormitoryinfo || person.dormitoryinfo2 || "--",
        bedCode,
        planStatus: person.planStatus || "--",
        accommodationStatus,
        checkInDate,
        checkOutDate,
        accommodationDate: [checkInDate, checkOutDate].filter(Boolean).join(" 至 ") || "--",
        fees: person.fees || "--"
      },
      roomies: roomiesResult.status === "fulfilled" && Array.isArray(roomiesResult.value?.page?.list)
        ? roomiesResult.value.page.list
        : [],
      roomiesError: roomiesResult.status === "rejected" ? roomiesResult.reason.message : null,
      device: deviceResult.status === "fulfilled" ? (deviceResult.value?.dormitoryDevice || null) : null,
      deviceError: deviceResult.status === "rejected" ? deviceResult.reason.message : null,
      capturedAt: new Date().toISOString()
    };
  }

  async function getCampusSummary(queryInput = {}) {
    const billQuery = normalizeCampusBillQuery(queryInput);
    await ensureCampusSessions();
    // These connectors share one persisted UIAS/CAS jar. Run them in order so a
    // later login cannot invalidate a token while another connector is using it.
    const [cardResult] = await Promise.allSettled([getCampusCard(billQuery)]);
    const [waterResult] = await Promise.allSettled([getCampusWater(billQuery)]);
    const [accommodationResult] = await Promise.allSettled([getCampusAccommodation()]);
    const jar = await readSessionJar();
    const status = campusSessionSummary(jar);
    const campusError = status.lastError || null;
    const cardError = cardResult.status === "rejected"
      ? (status.hasEasytongToken ? cardResult.reason.message : (campusError || cardResult.reason.message))
      : null;
    const waterError = waterResult.status === "rejected"
      ? (status.hasUwcToken ? waterResult.reason.message : (campusError || waterResult.reason.message))
      : null;
    return {
      time: billQuery.time,
      billMode: billQuery.mode,
      billLabel: billQuery.label,
      status,
      card: cardResult.status === "fulfilled" ? cardResult.value : { error: cardError },
      water: waterResult.status === "fulfilled" ? waterResult.value : { error: waterError },
      accommodation: accommodationResult.status === "fulfilled" ? accommodationResult.value : { error: accommodationResult.reason.message }
    };
  }

  async function getCampusRechargeLink() {
    await ensureCampusSessions();
    const jar = await readSessionJar();
    let token;
    try {
      token = await getUiasAppToken(jar, EASYTONG_RECHARGE_UIAS_APP, 1);
    } catch {
      await activateCampusSessions(jar, {});
      token = await getUiasAppToken(jar, EASYTONG_RECHARGE_UIAS_APP, 1);
    }
    await saveSessionJar(jar);
    return {
      url: `${EASYTONG_RECHARGE_APP_URL}&token=${encodeURIComponent(token)}`,
      target: "official",
      note: "Open the official campus-card recharge page. Payment is completed on ykt.hgu.edu.cn."
    };
  }
  return {
    uwcAuthedRequest,
    activateCampusSessions,
    getCampusCard,
    getCampusWater,
    refreshCampusWaterCode,
    ensureCampusSessions,
    getCampusAccommodation,
    getCampusSummary,
    getCampusRechargeLink
  };
}
