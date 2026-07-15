import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const LEGACY_SESSION_KEY = "hgu_app_session_token";
const PERSISTENT_SESSION_KEY = "hgu_wechat_app_session_v1";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

async function embeddedSessionFor(userAgent, {
  localStorage = storage({ [LEGACY_SESSION_KEY]: "legacy-token" }),
  sessionStorage = storage()
} = {}) {
  const source = await readFile("public/browser-check.js", "utf8");
  const window = {
    localStorage,
    navigator: { userAgent },
    sessionStorage,
    setTimeout() {}
  };
  vm.runInNewContext(source, { window });
  return { localStorage, session: window.__HGU_EMBEDDED_SESSION__, sessionStorage };
}

test("embedded WeChat persists its fallback across WebView sessions", async () => {
  const context = await embeddedSessionFor("Mozilla/5.0 Mobile MicroMessenger/8.0.48");

  context.session.store("current-token", "2099-01-01T00:00:00.000Z");

  assert.equal(context.session.read(), "current-token");
  assert.equal(context.sessionStorage.getItem(LEGACY_SESSION_KEY), "current-token");
  assert.equal(JSON.parse(context.localStorage.getItem(PERSISTENT_SESSION_KEY)).token, "current-token");
  assert.equal(context.localStorage.getItem(LEGACY_SESSION_KEY), null);

  const reopened = await embeddedSessionFor("Mozilla/5.0 Mobile MicroMessenger/8.0.48", {
    localStorage: context.localStorage,
    sessionStorage: storage()
  });
  assert.equal(reopened.session.read(), "current-token");

  context.session.store("");
  assert.equal(context.session.read(), "");
  assert.equal(context.localStorage.getItem(PERSISTENT_SESSION_KEY), null);
});

test("regular browsers cannot enable the embedded session fallback", async () => {
  const context = await embeddedSessionFor("Mozilla/5.0 Chrome/126.0 Safari/537.36");

  context.session.store("must-not-persist");

  assert.equal(context.session.read(), "");
  assert.equal(context.sessionStorage.getItem(LEGACY_SESSION_KEY), null);
  assert.equal(context.localStorage.getItem(PERSISTENT_SESSION_KEY), null);
  assert.equal(context.localStorage.getItem(LEGACY_SESSION_KEY), null);
});

test("expired persistent WeChat sessions are removed before use", async () => {
  const localStorage = storage({
    [PERSISTENT_SESSION_KEY]: JSON.stringify({ token: "expired-token", expiresAt: "2000-01-01T00:00:00.000Z" })
  });
  const context = await embeddedSessionFor("Mozilla/5.0 Mobile MicroMessenger/8.0.48", {
    localStorage,
    sessionStorage: storage()
  });

  assert.equal(context.session.read(), "");
  assert.equal(localStorage.getItem(PERSISTENT_SESSION_KEY), null);
});
