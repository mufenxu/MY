import test from "node:test";
import assert from "node:assert/strict";
import * as schoolUrl from "../src/lib/school-url.js";
const { normalizeAllowedSchoolUrl } = schoolUrl;

test("school URL policy upgrades known HGU HTTP redirects without allowing external origins", () => {
  assert.equal(
    normalizeAllowedSchoolUrl("http://newjwxs.hgu.edu.cn/student/index?from=cas"),
    "https://newjwxs.hgu.edu.cn/student/index?from=cas"
  );
  assert.throws(
    () => normalizeAllowedSchoolUrl("https://example.com/steal-cookie"),
    (error) => error.code === "UNTRUSTED_SCHOOL_REDIRECT"
  );
  assert.throws(
    () => normalizeAllowedSchoolUrl("https://hgu.edu.cn@example.com/steal-cookie"),
    (error) => error.code === "UNTRUSTED_SCHOOL_REDIRECT"
  );
});

test("extra school hosts are exact, explicit allow-list entries", () => {
  const extraHosts = new Set(["service.official-campus.cn"]);
  assert.equal(
    normalizeAllowedSchoolUrl("https://service.official-campus.cn/callback", { extraHosts }),
    "https://service.official-campus.cn/callback"
  );
  assert.throws(
    () => normalizeAllowedSchoolUrl("https://sub.service.official-campus.cn/callback", { extraHosts }),
    (error) => error.code === "UNTRUSTED_SCHOOL_REDIRECT"
  );
});

test("extracts WebVPN verify URL from a protected resource redirect", () => {
  const location = "https://webvpn.hgu.edu.cn/controller/v1/public/verify?t=verify-ticket";
  assert.equal(
    schoolUrl.webvpnVerifyUrlFromRedirect(location, "https://libroom.hgu.edu.cn/v4/login/cas"),
    location
  );
});
