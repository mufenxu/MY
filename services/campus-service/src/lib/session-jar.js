function isoNow() {
  return new Date().toISOString();
}

export function emptySessionJar() {
  return {
    version: 1,
    createdAt: isoNow(),
    updatedAt: isoNow(),
    meta: {},
    cookies: {},
    deletedCookies: {}
  };
}

function deepMergeObjects(base, incoming) {
  if (!base || typeof base !== "object" || Array.isArray(base)) return incoming;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming ?? base;
  const directTimestamp = (value) => Math.max(
    ...Object.entries(value)
      .filter(([key, item]) => /At$/.test(key) && typeof item === "string")
      .map(([, item]) => Date.parse(item))
      .filter(Number.isFinite),
    Number.NEGATIVE_INFINITY
  );
  const baseTimestamp = directTimestamp(base);
  const incomingTimestamp = directTimestamp(incoming);
  if (Number.isFinite(baseTimestamp) && Number.isFinite(incomingTimestamp) && incomingTimestamp < baseTimestamp) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? deepMergeObjects(base[key], value)
      : value;
  }
  return output;
}

function mergeCookieStores(base, incoming) {
  const output = deepMergeObjects({}, base || {});
  for (const [domain, cookies] of Object.entries(incoming || {})) {
    output[domain] ||= {};
    for (const [name, cookie] of Object.entries(cookies || {})) {
      const existing = output[domain][name];
      const existingTime = Date.parse(existing?.createdAt || 0);
      const incomingTime = Date.parse(cookie?.createdAt || 0);
      if (!existing || !Number.isFinite(existingTime) || !Number.isFinite(incomingTime) || incomingTime >= existingTime) {
        output[domain][name] = cookie;
      }
    }
  }
  return output;
}

export function mergeSessionJars(stored, incoming) {
  const merged = {
    ...stored,
    ...incoming,
    createdAt: stored.createdAt || incoming.createdAt || isoNow(),
    updatedAt: isoNow(),
    meta: deepMergeObjects(stored.meta || {}, incoming.meta || {}),
    cookies: mergeCookieStores(stored.cookies, incoming.cookies),
    deletedCookies: { ...(stored.deletedCookies || {}), ...(incoming.deletedCookies || {}) }
  };
  for (const [key, deletedAt] of Object.entries(merged.deletedCookies)) {
    const separator = key.indexOf("|");
    if (separator < 1) continue;
    const domain = key.slice(0, separator);
    const name = key.slice(separator + 1);
    const cookie = merged.cookies?.[domain]?.[name];
    const cookieTime = Date.parse(cookie?.createdAt || 0);
    const deletionTime = Date.parse(deletedAt || 0);
    if (!cookie || !Number.isFinite(cookieTime) || cookieTime <= deletionTime) {
      if (merged.cookies?.[domain]) delete merged.cookies[domain][name];
    } else {
      delete merged.deletedCookies[key];
    }
  }
  return merged;
}

function splitSetCookie(headerValue) {
  if (!headerValue) return [];
  return String(headerValue).split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((item) => item.trim()).filter(Boolean);
}

function responseSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  return splitSetCookie(response.headers.get("set-cookie"));
}

export function parseSetCookie(line, requestUrl) {
  const url = new URL(requestUrl);
  const parts = String(line).split(";").map((part) => part.trim());
  const first = parts.shift() || "";
  const eqIndex = first.indexOf("=");
  if (eqIndex <= 0) return null;
  const name = first.slice(0, eqIndex);
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return null;

  const cookie = {
    name,
    value: first.slice(eqIndex + 1),
    domain: url.hostname,
    hostOnly: true,
    path: "/",
    httpOnly: false,
    secure: false,
    createdAt: isoNow()
  };

  for (const part of parts) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey.toLowerCase();
    const value = rest.join("=");
    if (key === "domain" && value) {
      const requestedDomain = value.replace(/^\./, "").toLowerCase();
      const domainMatches = url.hostname === requestedDomain || url.hostname.endsWith(`.${requestedDomain}`);
      if (!domainMatches || !(requestedDomain === "hgu.edu.cn" || requestedDomain.endsWith(".hgu.edu.cn"))) return null;
      cookie.domain = requestedDomain;
      cookie.hostOnly = false;
    }
    if (key === "path" && value.startsWith("/")) cookie.path = value;
    if (key === "expires" && value) {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) cookie.expiresAt = new Date(ms).toISOString();
    }
    if (key === "max-age" && value) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) cookie.expiresAt = new Date(Date.now() + seconds * 1_000).toISOString();
    }
    if (key === "httponly") cookie.httpOnly = true;
    if (key === "secure") cookie.secure = true;
  }
  return cookie;
}

export function isCookieExpired(cookie, now = Date.now()) {
  return Boolean(cookie?.expiresAt && Date.parse(cookie.expiresAt) <= now);
}

export function rememberCookie(jar, cookie) {
  if (!cookie) return;
  const domain = cookie.domain.toLowerCase();
  jar.cookies[domain] ||= {};
  jar.deletedCookies ||= {};
  const tombstoneKey = `${domain}|${cookie.name}`;
  if (isCookieExpired(cookie) || cookie.value === "") {
    delete jar.cookies[domain][cookie.name];
    jar.deletedCookies[tombstoneKey] = isoNow();
    return;
  }
  jar.cookies[domain][cookie.name] = cookie;
  delete jar.deletedCookies[tombstoneKey];
}

export function updateJarFromResponse(jar, response, requestUrl) {
  for (const line of responseSetCookies(response)) {
    const cookie = parseSetCookie(line, requestUrl);
    rememberCookie(jar, cookie);
    if (cookie?.domain.endsWith("nrg.hgu.edu.cn") && cookie.name.toUpperCase().includes("JSESSIONID")) {
      jar.meta.nrgCapturedAt = isoNow();
    }
    if (cookie?.domain.endsWith("newjwxs.hgu.edu.cn") && cookie.name.toUpperCase().includes("JSESSIONID")) {
      jar.meta.academicCapturedAt = isoNow();
    }
    if (cookie?.domain.endsWith("my.hgu.edu.cn")) jar.meta.portalCapturedAt = isoNow();
  }
}

export function cookieHeaderFor(jar, targetUrl) {
  const url = new URL(targetUrl);
  const rows = [];
  for (const [domain, cookies] of Object.entries(jar.cookies || {})) {
    for (const cookie of Object.values(cookies)) {
      const hostMatches = cookie.hostOnly
        ? url.hostname === domain
        : (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
      if (!hostMatches || isCookieExpired(cookie)) continue;
      if (cookie.secure && url.protocol !== "https:") continue;
      const path = cookie.path || "/";
      const pathMatches = url.pathname === path || url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`);
      if (!pathMatches && path !== "/") continue;
      rows.push(`${cookie.name}=${cookie.value}`);
    }
  }
  return rows.join("; ");
}
