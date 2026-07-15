function untrustedUrlError(url) {
  const location = url ? `${url.protocol}//${url.hostname || "未知主机"}` : "无法解析的地址";
  const error = new Error(`学校系统返回了不受信任的跳转地址（${location}）。`);
  error.code = "UNTRUSTED_SCHOOL_REDIRECT";
  return error;
}

export function normalizeAllowedSchoolUrl(value, { extraHosts = [] } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw untrustedUrlError(null);
  }

  const configuredHosts = extraHosts instanceof Set
    ? extraHosts
    : new Set(Array.from(extraHosts, (host) => String(host).trim().toLowerCase()).filter(Boolean));
  const allowedHost = url.hostname === "hgu.edu.cn"
    || url.hostname.endsWith(".hgu.edu.cn")
    || configuredHosts.has(url.hostname);

  // 学校旧系统偶尔返回 http 链接。仅对已校验的校方域名升级为 HTTPS，绝不发送明文请求。
  if (url.protocol === "http:" && allowedHost) url.protocol = "https:";
  if (url.protocol !== "https:" || !allowedHost || url.username || url.password) {
    throw untrustedUrlError(url);
  }
  return url.href;
}
