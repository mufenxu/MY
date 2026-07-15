import test from "node:test";
import assert from "node:assert/strict";
import {
  UIAS_ENDPOINTS,
  casServiceFromTicketRedirect,
  casLoginUrlWithService,
  uiasCasServiceUrl
} from "../src/lib/uias-cas.js";

const CAS_ORIGIN = "https://cas.hgu.edu.cn";
const YKT_ORIGIN = "https://ykt.hgu.edu.cn";
const EASYTONG_REDIRECT_URL = `${YKT_ORIGIN}/easytong_webapp/index.html#/aotoLogin?name=balance`;
const CAS_ENTRY_SERVICE_URL = `${YKT_ORIGIN}/uias-h5/login`;
const CAS_EXCHANGE_SERVICE_URL = `${YKT_ORIGIN}/uias-h5/login?redirectUrl=${encodeURIComponent(`${YKT_ORIGIN}/easytong_webapp/index.html`)}`;

test("UIAS CAS login reads the official login-page endpoint", () => {
  assert.equal(UIAS_ENDPOINTS.CasLoginUrl, "/uias/authentication/index/cas/login-page");
  assert.equal(UIAS_ENDPOINTS.CasLogin, "/uias/authentication/index/cas/login");
});

test("UIAS portal app discovery endpoints are available", () => {
  assert.equal(UIAS_ENDPOINTS.MyApplication, "/uias/portal-manage/portal-h5/my-functions");
  assert.equal(UIAS_ENDPOINTS.MyRecommendApplication, "/uias/portal-manage/portal-h5/recommend-apps");
});

test("the UIAS CAS service uses the bare portal login URL", () => {
  const serviceUrl = uiasCasServiceUrl(YKT_ORIGIN);

  assert.equal(serviceUrl, CAS_ENTRY_SERVICE_URL);
  assert.equal(serviceUrl.includes("redirectUrl"), false);
  assert.equal(serviceUrl.includes(EASYTONG_REDIRECT_URL), false);
});

test("the UIAS-provided CAS login URL keeps the bare service binding", () => {
  const loginUrl = casLoginUrlWithService(`${CAS_ORIGIN}/cas/login`, CAS_ENTRY_SERVICE_URL, CAS_ORIGIN);
  const parsed = new URL(loginUrl);

  assert.equal(parsed.origin, CAS_ORIGIN);
  assert.equal(parsed.pathname, "/cas/login");
  assert.equal(parsed.searchParams.get("service"), CAS_ENTRY_SERVICE_URL);
});

test("the CAS service does not embed an application route", () => {
  const loginUrl = casLoginUrlWithService(`${CAS_ORIGIN}/cas/login`, CAS_ENTRY_SERVICE_URL, CAS_ORIGIN);

  assert.doesNotMatch(loginUrl, /redirectUrl/);
  assert.doesNotMatch(loginUrl, /easytong_webapp/);
});

test("a bare CAS ticket redirect preserves the exact service", () => {
  const redirectUrl = `${CAS_ENTRY_SERVICE_URL}?ticket=ST-bare`;
  const result = casServiceFromTicketRedirect(redirectUrl);

  assert.equal(result.ticket, "ST-bare");
  assert.equal(result.serviceUrl, CAS_ENTRY_SERVICE_URL);
});

test("CAS ticket redirect yields the official UIAS exchange service without consuming ticket", () => {
  const redirectUrl = `${YKT_ORIGIN}/uias-h5/login?redirectUrl=${YKT_ORIGIN}/easytong_webapp/index.html&ticket=ST-12345#/aotoLogin?name=balance`;
  const result = casServiceFromTicketRedirect(redirectUrl);

  assert.equal(result.ticket, "ST-12345");
  assert.equal(result.serviceUrl, CAS_EXCHANGE_SERVICE_URL);
});

test("CAS ticket removal preserves the official encoded query form", () => {
  const redirectUrl = `${YKT_ORIGIN}/uias-h5/login?redirectUrl=${encodeURIComponent(`${YKT_ORIGIN}/easytong_webapp/index.html`)}&ticket=ST-abc#/aotoLogin?name=balance`;
  const result = casServiceFromTicketRedirect(redirectUrl);

  assert.equal(result.ticket, "ST-abc");
  assert.equal(result.serviceUrl, CAS_EXCHANGE_SERVICE_URL);
});
