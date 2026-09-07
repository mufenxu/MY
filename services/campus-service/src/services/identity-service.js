import bwipjs from "bwip-js";
import { cookieHeaderFor } from "../lib/session-jar.js";
import { HttpError } from "../lib/http.js";
import { normalizeHtmlText } from "../lib/academic-parsers.js";
import QRCode from "qrcode";

export function createIdentityService({
  CAS_ORIGIN,
  fetchWithJar,
  followRedirectsWithJar,
  getCasTicketRedirect,
  loginCasService,
  parseJsonLike,
  portalSessionSummary,
  readSessionJar,
  readUpstreamText,
  REQUEST_TIMEOUT_MS,
  saveSessionJar,
  storedSessionSummary,
}) {
  const MY_ORIGIN = "https://my.hgu.edu.cn";

  const MY_USERCENTER_HOME_URL = `${MY_ORIGIN}/yhzt/usercenter-front-web/home.html?isFrame=true`;

  const MY_INFO_PAGE_URL = `${MY_ORIGIN}/sopplus/_web/portalWechat/app/myInfo.html`;

  const MY_FACE_INFO_CALLBACK_URL = `${MY_ORIGIN}/commoncallback/yhzt/usercenter-front-web/home.html`;

  const PORTAL_LOGIN_REQUIRED_MESSAGE = "用户中心会话未连接，请在本系统重新登录学校账号后同步身份卡。";

  function looksLikePortalLogin(text, finalUrl = "") {
    const sample = String(text || "").slice(0, 5000);
    return finalUrl.includes("/cas/login")
      || /cas\/login|统一身份认证|name=["']execution["']|id=["']authcode["']|id=["']fm1["']/.test(sample);
  }

  async function requestPortalHtml(jar, url = MY_USERCENTER_HOME_URL, { referer = MY_ORIGIN } = {}) {
    const { response, url: finalUrl } = await followRedirectsWithJar(url, jar, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer
      }
    });
    const html = await readUpstreamText(response);
    if (looksLikePortalLogin(html, finalUrl)) {
      throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE, {
        endpoint: new URL(url).pathname,
        finalUrl
      });
    }
    if (response.status >= 400) {
      throw new HttpError(response.status, `用户中心页面返回 HTTP ${response.status}`, {
        endpoint: new URL(url).pathname,
        sample: normalizeHtmlText(html).slice(0, 240)
      });
    }
    return { html, finalUrl };
  }

  function portalPayloadResult(payload) {
    return payload?.result && typeof payload.result === "object" ? payload.result : payload;
  }

  function firstPortalDataItem(payload) {
    const result = portalPayloadResult(payload);
    if (Array.isArray(result?.data)) return result.data[0] || null;
    if (Array.isArray(payload?.data)) return payload.data[0] || null;
    if (Array.isArray(result)) return result[0] || null;
    return result?.data ?? payload?.data ?? result ?? null;
  }

  function portalFailureCode(value) {
    return value !== undefined && value !== null && value !== "" && value !== 0 && value !== "0";
  }

  function normalizePortalError(payload, fallback) {
    return payload?.errorMsg
      || payload?.message
      || payload?.msg
      || payload?.result?.errorMsg
      || payload?.result?.message
      || payload?.result?.msg
      || fallback;
  }

  function imageDataUrl(value, fallbackMime = "image/png") {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^data:/i.test(text) || /^https?:\/\//i.test(text)) return text;
    const mime = text.startsWith("/9j/") ? "image/jpeg" : fallbackMime;
    if (text.startsWith("/9j/")) return `data:${mime};base64,${text}`;
    if (text.startsWith("/")) return new URL(text, MY_ORIGIN).href;
    return `data:${mime};base64,${text}`;
  }

  function normalizeIdentityProfile(info = {}) {
    const field = (value) => {
      const text = String(value ?? "").trim();
      return text || null;
    };
    return {
      name: field(info.name),
      code: field(info.code),
      category: field(info.category),
      categoryName: field(info.categoryName),
      statusName: field(info.statusName),
      orgName: field(info.orgName),
      enterGrade: field(info.enterGrade),
      campus: field(info.campus),
      mobile: field(info.mobile),
      gender: field(info.gender),
      photoUrl: imageDataUrl(info.photo)
    };
  }

  function identityFaceOfficialServiceUrl() {
    const targetUrl = new URL(MY_FACE_INFO_CALLBACK_URL);
    targetUrl.searchParams.set("isFrame", "true");
    targetUrl.searchParams.set("timeStamp", String(Date.now()));
    return targetUrl.href;
  }

  function identityFaceOfficialUrl(targetUrl = identityFaceOfficialServiceUrl()) {
    const url = new URL(targetUrl);
    url.hash = "/faceinfo";
    return url.href;
  }

  async function getIdentityFaceOfficialLink() {
    const jar = await readSessionJar();
    if (!cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)) {
      throw new HttpError(401, "统一身份认证会话已过期，请在本系统重新登录学校账号后再打开官方采集页。");
    }

    try {
      const serviceUrl = identityFaceOfficialServiceUrl();
      const ticketUrl = await getCasTicketRedirect({ jar, serviceUrl });
      jar.meta.cas ||= {};
      jar.meta.cas.lastError = null;
      await saveSessionJar(jar);
      return {
        url: identityFaceOfficialUrl(ticketUrl),
        autoLogin: true
      };
    } catch (error) {
      if (error?.status === 401) {
        jar.meta.cas ||= {};
        jar.meta.cas.lastError = "统一身份认证会话已过期，请在本系统重新登录学校账号后再打开官方采集页。";
        await saveSessionJar(jar).catch(() => {});
        throw new HttpError(401, jar.meta.cas.lastError);
      }
      throw error;
    }
  }

  function normalizeIdentityFaceConfig(config = {}) {
    const mode = String(config.mode ?? config.collectMode ?? "").trim();
    const labels = {
      "0": "摄像头采集",
      "1": "上传照片",
      "2": "摄像头采集 / 上传照片"
    };
    return {
      mode: mode || null,
      modeText: labels[mode] || (mode ? `模式 ${mode}` : "学校默认模式"),
      enabled: config.enable ?? config.enabled ?? config.faceEnable ?? null
    };
  }

  function normalizeIdentityFaceInfo(statusPayload, configPayload) {
    const statusItem = firstPortalDataItem(statusPayload) || {};
    const status = statusItem.vo || statusItem;
    const configItem = firstPortalDataItem(configPayload) || {};
    const config = configItem.vo || configItem;
    const statusHasFaceFields = status.humanStatus !== undefined
      || status.humanPhoto
      || status.facePhoto
      || status.photo;
    const configHasFaceFields = config.humanStatus !== undefined
      || config.humanPhoto
      || config.facePhoto
      || config.photo;
    const face = statusHasFaceFields ? status : (configHasFaceFields ? config : status);
    const rawStatus = face.humanStatus ?? face.status ?? face.faceStatus ?? face.auditStatus ?? null;
    const statusTextValue = String(rawStatus ?? "").trim();
    const photoUrl = imageDataUrl(
      face.humanPhoto || face.facePhoto || face.photo || face.image || face.img,
      "image/jpeg"
    );
    const collected = statusTextValue === "1"
      || statusTextValue.toLowerCase() === "true"
      || Boolean(photoUrl);

    return {
      collected,
      statusCode: rawStatus,
      statusText: collected ? "已采集" : "未采集",
      message: collected
        ? "已有人脸照片，可以使用学校提供的人脸识别服务。"
        : "学校暂未返回已采集的人脸照片。",
      photoUrl,
      config: normalizeIdentityFaceConfig(config),
      officialUrl: identityFaceOfficialUrl(),
      fetchedAt: new Date().toISOString()
    };
  }

  function parseIdentityCodeConfig(payload) {
    const item = firstPortalDataItem(payload) || {};
    let value = item.value ?? item.configValue ?? item;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        value = {};
      }
    }
    const validity = Number(value?.validityPeriod);
    return {
      enabled: value?.enabled !== false && value?.enabled !== "false",
      validitySeconds: Number.isFinite(validity) && validity > 0 ? Math.min(Math.max(validity, 5), 300) : 10
    };
  }

  function svgDataUrl(svg) {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  async function identityCodeImages(rawCode) {
    const code = String(rawCode || "");
    if (!code) throw new HttpError(502, "学校没有返回个人身份码。");
    const barcodeText = code.split("|")[0] || code;
    const qrSvg = await QRCode.toString(code, {
      type: "svg",
      margin: 1,
      width: 220,
      color: {
        dark: "#111827",
        light: "#ffffff"
      }
    });
    const barcodeSvg = bwipjs.toSVG({
      bcid: "code128",
      text: barcodeText,
      scale: 2,
      height: 24,
      includetext: false,
      paddingwidth: 8,
      paddingheight: 4,
      backgroundcolor: "FFFFFF"
    });
    return {
      qrImage: svgDataUrl(qrSvg),
      barcodeImage: svgDataUrl(barcodeSvg)
    };
  }

  async function activatePortalSession(jar, credentials = {}) {
    await loginCasService({
      jar,
      username: credentials.username,
      password: credentials.password,
      rememberMe: credentials.rememberMe ?? true,
      serviceUrl: MY_USERCENTER_HOME_URL
    });
    await requestPortalHtml(jar, MY_USERCENTER_HOME_URL);
    await requestPortalHtml(jar, MY_INFO_PAGE_URL, { referer: MY_USERCENTER_HOME_URL }).catch(() => null);
    if (!cookieHeaderFor(jar, MY_USERCENTER_HOME_URL)) {
      throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE);
    }
    jar.meta.portalCapturedAt = new Date().toISOString();
    jar.meta.cas ||= {};
    jar.meta.cas.lastError = null;
    jar.meta.portal ||= {};
    jar.meta.portal.lastError = null;
    await saveSessionJar(jar);
  }

  async function portalApiRequest(path, {
    method = "GET",
    data,
    referer = `${MY_ORIGIN}/yhzt/usercenter-front-web/home.html?isFrame=true`,
    jar: explicitJar,
    retryOnAuth = true
  } = {}) {
    const jar = explicitJar || await readSessionJar();
    const upperMethod = method.toUpperCase();
    const targetUrl = new URL(path, MY_ORIGIN);
    if ((upperMethod === "GET" || upperMethod === "DELETE") && data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null || value === "") continue;
        targetUrl.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
    }

    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache",
      origin: MY_ORIGIN,
      referer,
      "x-requested-with": "XMLHttpRequest"
    };
    const body = upperMethod === "GET" || upperMethod === "DELETE" ? undefined : JSON.stringify(data || {});
    if (body) headers["content-type"] = "application/json;charset=UTF-8";

    const response = await fetchWithJar(targetUrl.href, {
      jar,
      method: upperMethod,
      headers,
      body,
      redirect: "manual",
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    const text = await readUpstreamText(response);
    const location = response.headers.get("location") || "";

    if ((response.status >= 300 && response.status < 400) || looksLikePortalLogin(text, location || targetUrl.href)) {
      if (!retryOnAuth) {
        throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE, {
          endpoint: targetUrl.pathname,
          location
        });
      }
      try {
        await activatePortalSession(jar, {});
      } catch (error) {
        throw new HttpError(401, PORTAL_LOGIN_REQUIRED_MESSAGE, {
          endpoint: targetUrl.pathname,
          cause: error.message
        });
      }
      return portalApiRequest(path, { method, data, referer, jar, retryOnAuth: false });
    }

    if (response.status >= 400) {
      throw new HttpError(response.status, `用户中心接口返回 HTTP ${response.status}`, {
        endpoint: targetUrl.pathname,
        sample: normalizeHtmlText(text).slice(0, 240)
      });
    }

    let payload;
    try {
      payload = parseJsonLike(text || "{}");
    } catch {
      throw new HttpError(502, "用户中心接口返回的 JSON 结构不符合预期。", {
        endpoint: targetUrl.pathname,
        sample: normalizeHtmlText(text).slice(0, 240)
      });
    }

    if (portalFailureCode(payload?.resultCode) || portalFailureCode(payload?.code) || payload?.success === false) {
      const status = payload?.resultCode === 401 || payload?.resultCode === 403 || payload?.code === 401 || payload?.code === 403 ? 401 : 502;
      throw new HttpError(status, normalizePortalError(payload, "用户中心接口返回失败。"), {
        endpoint: targetUrl.pathname
      });
    }

    jar.meta.portalCapturedAt = new Date().toISOString();
    jar.meta.portal ||= {};
    jar.meta.portal.lastError = null;
    return payload;
  }

  async function getIdentityCodeConfig(jar) {
    const requestOptions = {
      method: "POST",
      data: { code: ["IdentityQrCode"] },
      jar
    };
    const payload = await portalApiRequest("/ids/v1/config/list", requestOptions)
      .catch((error) => {
        if (error?.status === 401) throw error;
        return portalApiRequest("/pcen/v1/open/configList", requestOptions);
      });
    return parseIdentityCodeConfig(payload);
  }

  async function getIdentityProfileBundle(jar) {
    const [humanResult, backgroundResult, configResult] = await Promise.allSettled([
      portalApiRequest("/pcen/v1/human/currHumanInfo", { method: "POST", data: {}, jar }),
      portalApiRequest("/pcen/v1/human/background/idcode", { method: "GET", jar }),
      getIdentityCodeConfig(jar)
    ]);

    if (humanResult.status === "rejected") throw humanResult.reason;

    const humanItem = firstPortalDataItem(humanResult.value) || {};
    const humanInfo = humanItem.vo || humanItem;
    const background = backgroundResult.status === "fulfilled" ? (firstPortalDataItem(backgroundResult.value) || {}) : {};
    const codeConfig = configResult.status === "fulfilled" ? configResult.value : { enabled: true, validitySeconds: 10 };

    return {
      profile: normalizeIdentityProfile(humanInfo),
      background: {
        imageUrl: imageDataUrl(background.backgroundImg || background.image || background.img),
        color: background.backgroundColor || background.color || null
      },
      codeConfig,
      fetchedAt: new Date().toISOString()
    };
  }

  async function getIdentityDynamicCode(jar, validitySeconds = 10) {
    const payload = await portalApiRequest("/pcen/v1/human/idcode", {
      method: "POST",
      data: {},
      jar
    });
    const item = firstPortalDataItem(payload) || {};
    const rawCode = item.code;
    const generatedAt = new Date();
    const images = await identityCodeImages(rawCode);
    return {
      ...images,
      generatedAt: generatedAt.toISOString(),
      expiresAt: new Date(generatedAt.getTime() + validitySeconds * 1000).toISOString(),
      validitySeconds,
      status: "active"
    };
  }

  function canTryPortalSession(jar) {
    return Boolean(
      cookieHeaderFor(jar, MY_USERCENTER_HOME_URL)
      || cookieHeaderFor(jar, MY_INFO_PAGE_URL)
      || cookieHeaderFor(jar, `${CAS_ORIGIN}/cas/login`)
    );
  }

  async function getIdentityCard() {
    const jar = await readSessionJar();
    if (!canTryPortalSession(jar)) {
      const stored = storedSessionSummary(jar);
      throw new HttpError(401, stored.hasStoredSession
        ? PORTAL_LOGIN_REQUIRED_MESSAGE
        : "还没有连接学校账号，请先登录。");
    }

    try {
      const bundle = await getIdentityProfileBundle(jar);
      const code = bundle.codeConfig.enabled
        ? await getIdentityDynamicCode(jar, bundle.codeConfig.validitySeconds).catch((error) => ({ error: error.message }))
        : { error: "学校当前未开放个人身份码。" };
      await saveSessionJar(jar);
      return {
        ...bundle,
        code,
        status: portalSessionSummary(jar)
      };
    } catch (error) {
      jar.meta.portal ||= {};
      jar.meta.portal.lastError = error.message || "用户中心同步失败。";
      await saveSessionJar(jar);
      throw error;
    }
  }

  async function getIdentityFaceInfo() {
    const jar = await readSessionJar();
    if (!canTryPortalSession(jar)) {
      const stored = storedSessionSummary(jar);
      throw new HttpError(401, stored.hasStoredSession
        ? PORTAL_LOGIN_REQUIRED_MESSAGE
        : "还没有连接学校账号，请先登录。");
    }

    try {
      const [statusResult, configResult] = await Promise.allSettled([
        portalApiRequest("/imp/_web/_apps/selfservice/api/face/uploadStatus.rst", {
          method: "GET",
          jar,
          referer: MY_USERCENTER_HOME_URL
        }),
        portalApiRequest("/imp/_web/_apps/selfservice/api/face/config.rst", {
          method: "GET",
          jar,
          referer: MY_USERCENTER_HOME_URL
        })
      ]);
      if (statusResult.status === "rejected") throw statusResult.reason;
      const configPayload = configResult.status === "fulfilled" ? configResult.value : {};
      const info = normalizeIdentityFaceInfo(statusResult.value, configPayload);
      await saveSessionJar(jar);
      return info;
    } catch (error) {
      jar.meta.portal ||= {};
      jar.meta.portal.lastError = error.message || "人脸信息同步失败。";
      await saveSessionJar(jar);
      throw error;
    }
  }

  async function refreshIdentityCodeOnly() {
    const jar = await readSessionJar();
    if (!canTryPortalSession(jar)) {
      const stored = storedSessionSummary(jar);
      throw new HttpError(401, stored.hasStoredSession
        ? PORTAL_LOGIN_REQUIRED_MESSAGE
        : "还没有连接学校账号，请先登录。");
    }
    const config = await getIdentityCodeConfig(jar).catch(() => ({ enabled: true, validitySeconds: 10 }));
    if (!config.enabled) throw new HttpError(403, "学校当前未开放个人身份码。");
    try {
      const code = await getIdentityDynamicCode(jar, config.validitySeconds);
      await saveSessionJar(jar);
      return code;
    } catch (error) {
      jar.meta.portal ||= {};
      jar.meta.portal.lastError = error.message || "个人身份码刷新失败。";
      await saveSessionJar(jar);
      throw error;
    }
  }
  return {
    getIdentityFaceOfficialLink,
    activatePortalSession,
    getIdentityCard,
    getIdentityFaceInfo,
    refreshIdentityCodeOnly
  };
}
