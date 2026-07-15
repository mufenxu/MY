export const UIAS_ENDPOINTS = Object.freeze({
  CasLoginUrl: "/uias/authentication/index/cas/login-page",
  CasLogin: "/uias/authentication/index/cas/login",
  AppToken: "/uias/authentication/index/token-h5",
  MyApplication: "/uias/portal-manage/portal-h5/my-functions",
  MyRecommendApplication: "/uias/portal-manage/portal-h5/recommend-apps",
  Profile: "/user-center/user-info"
});

export function uiasCasServiceUrl(uiasLoginUrl) {
  return new URL("/uias-h5/login", uiasLoginUrl).href;
}

export function casLoginUrlWithService(loginBaseUrl, serviceUrl, casOrigin) {
  const url = new URL(loginBaseUrl || "/cas/login", casOrigin);
  url.searchParams.set("service", serviceUrl);
  return url.href;
}

export function casServiceFromTicketRedirect(redirectUrl) {
  const parsed = new URL(redirectUrl);
  const ticket = parsed.searchParams.get("ticket");
  if (!ticket) return { ticket: null, serviceUrl: redirectUrl };

  parsed.searchParams.delete("ticket");
  const query = parsed.searchParams.toString();

  return {
    ticket,
    serviceUrl: `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ""}`
  };
}
