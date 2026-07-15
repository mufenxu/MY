import test from "node:test";
import assert from "node:assert/strict";
import {
  cookieHeaderFor,
  emptySessionJar,
  mergeSessionJars,
  parseSetCookie,
  rememberCookie
} from "../src/lib/session-jar.js";

test("cookie parser rejects unrelated domains and honors secure/path/host-only rules", () => {
  assert.equal(parseSetCookie("SESSION=bad; Domain=example.com", "https://cas.hgu.edu.cn/login"), null);
  const jar = emptySessionJar();
  const cookie = parseSetCookie("SESSION=good; Secure; HttpOnly; Path=/cas", "https://cas.hgu.edu.cn/cas/login");
  rememberCookie(jar, cookie);
  assert.equal(cookieHeaderFor(jar, "http://cas.hgu.edu.cn/cas/login"), "");
  assert.equal(cookieHeaderFor(jar, "https://other.hgu.edu.cn/cas/login"), "");
  assert.equal(cookieHeaderFor(jar, "https://cas.hgu.edu.cn/casual"), "");
  assert.equal(cookieHeaderFor(jar, "https://cas.hgu.edu.cn/cas/login"), "SESSION=good");
});

test("session merge preserves a newer cookie and unrelated metadata", () => {
  const stored = emptySessionJar();
  stored.meta.academic = { capturedAt: "new" };
  stored.cookies["cas.hgu.edu.cn"] = {
    SESSION: { name: "SESSION", value: "new", domain: "cas.hgu.edu.cn", createdAt: "2026-01-02T00:00:00.000Z" }
  };
  const stale = emptySessionJar();
  stale.meta.portal = { capturedAt: "other" };
  stale.meta.academic = { capturedAt: "2026-01-01T00:00:00.000Z", token: "old" };
  stored.meta.academic = { capturedAt: "2026-01-02T00:00:00.000Z", token: "new" };
  stale.cookies["cas.hgu.edu.cn"] = {
    SESSION: { name: "SESSION", value: "old", domain: "cas.hgu.edu.cn", createdAt: "2026-01-01T00:00:00.000Z" }
  };
  const merged = mergeSessionJars(stored, stale);
  assert.equal(merged.cookies["cas.hgu.edu.cn"].SESSION.value, "new");
  assert.equal(merged.meta.academic.token, "new");
  assert.equal(merged.meta.portal.capturedAt, "other");
});
