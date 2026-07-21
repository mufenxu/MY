import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const FETCH_FORBIDDEN_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 989, 990, 993, 995, 1_719, 1_720, 1_723, 2_049, 3_659, 4_045, 4_190, 5_060, 5_061,
  6_000, 6_566, 6_665, 6_666, 6_667, 6_668, 6_669, 6_679, 6_697, 10_080
]);

async function availablePort() {
  while (true) {
    const port = await new Promise((resolve, reject) => {
      const probe = createNetServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const { port: assignedPort } = probe.address();
        probe.close((error) => error ? reject(error) : resolve(assignedPort));
      });
    });
    if (!FETCH_FORBIDDEN_PORTS.has(port)) return port;
  }
}

async function waitForStartup(child) {
  const lines = createInterface({ input: child.stdout });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server startup timed out")), 10_000);
    child.once("exit", (code) => reject(new Error(`server exited during startup with code ${code}`)));
    lines.on("line", (line) => {
      try {
        const entry = JSON.parse(line);
        if (entry.event === "service_started") {
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // Ignore non-JSON output from native dependencies.
      }
    });
  });
}

test("server authentication, revocation, validation and static caching work together", { timeout: 30_000 }, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "hgu-test-"));
  const port = await availablePort();
  const initialPassword = "initial-password-123";
  const nextPassword = "updated-password-456";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HGU_HOST: "127.0.0.1",
      HGU_DATA_DIR: dataDir,
      HGU_STORAGE_DRIVER: "memory",
      HGU_ADMIN_USERNAME: "admin",
      HGU_ADMIN_PASSWORD: initialPassword,
      HGU_APP_SESSION_SECRET: randomBytes(32).toString("base64url"),
      HGU_APP_SESSION_TTL_HOURS: "720",
      HGU_DATA_ENCRYPTION_KEY: "",
      HGU_APP_COOKIE_SECURE: "true",
      HGU_TRUST_PROXY: "false",
      HGU_ENABLE_HSTS: "false",
      ACADEMIC_AUTO_REFRESH_MS: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.exitCode === null ? child.once("exit", resolve) : resolve());
    await rm(dataDir, { recursive: true, force: true });
  });

  await waitForStartup(child).catch((error) => {
    throw new Error(`${error.message}\n${stderr}`);
  });
  const origin = `http://127.0.0.1:${port}`;

  const ready = await fetch(`${origin}/api/ready`);
  assert.equal(ready.status, 200);

  const insecureForwarded = await fetch(`${origin}/app-auth/login?next=%2F`, {
    redirect: "manual",
    headers: {
      "x-forwarded-proto": "http"
    }
  });
  assert.equal(insecureForwarded.status, 200);
  assert.equal(insecureForwarded.headers.get("location"), null);

  const invalidJson = await fetch(`${origin}/api/app-auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  });
  assert.equal(invalidJson.status, 400);

  const oversizedJson = await fetch(`${origin}/api/app-auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(64 * 1024) })
  });
  assert.equal(oversizedJson.status, 413);

  let rejectedStatus = 0;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const rejected = await fetch(`${origin}/api/app-auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `198.51.100.${attempt + 1}`
      },
      body: JSON.stringify({ username: "ghost", password: "incorrect-password" })
    });
    rejectedStatus = rejected.status;
  }
  assert.equal(rejectedStatus, 429, "untrusted X-Forwarded-For values must not bypass login throttling");

  const login = await fetch(`${origin}/api/app-auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: initialPassword })
  });
  assert.equal(login.status, 200);
  const loginSetCookie = login.headers.get("set-cookie");
  assert.match(loginSetCookie, /Max-Age=2592000/);
  const oldCookie = loginSetCookie.split(";", 1)[0];
  const loginPayload = await login.json();
  assert.equal("sessionToken" in loginPayload.data, false);
  assert.ok(loginPayload.data.csrfToken);
  const sessionMs = Date.parse(loginPayload.data.expiresAt) - Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  assert.ok(sessionMs > 29.9 * 24 * 60 * 60 * 1000 && sessionMs <= thirtyDaysMs + 1_000,
    `expected a 30-day session, got ${sessionMs / (24 * 60 * 60 * 1000)} days`);

  const integrationSettings = await fetch(`${origin}/api/academic/integrations`, {
    headers: { cookie: oldCookie }
  });
  assert.equal(integrationSettings.status, 200);
  assert.equal((await integrationSettings.json()).data.calendar.enabled, false);

  const rotatedCalendar = await fetch(`${origin}/api/academic/calendar/rotate`, {
    method: "POST",
    headers: {
      cookie: oldCookie,
      "x-csrf-token": loginPayload.data.csrfToken
    }
  });
  assert.equal(rotatedCalendar.status, 201);
  const calendarSettings = await rotatedCalendar.json();
  assert.match(calendarSettings.data.calendar.path, /^\/api\/academic\/calendar\/[A-Za-z0-9_-]+\.ics$/);
  const calendarWithoutCache = await fetch(`${origin}${calendarSettings.data.calendar.path}`);
  assert.equal(calendarWithoutCache.status, 503);

  const reminderSettings = await fetch(`${origin}/api/academic/reminder`, {
    method: "PUT",
    headers: {
      cookie: oldCookie,
      "content-type": "application/json",
      "x-csrf-token": loginPayload.data.csrfToken
    },
    body: JSON.stringify({ enabled: true, recipientId: "student-1", leadMinutes: 15 })
  });
  assert.equal(reminderSettings.status, 200);
  assert.equal((await reminderSettings.json()).data.recipientId, "student-1");

  const inviteCreate = await fetch(`${origin}/api/invites`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cookie": oldCookie,
      "x-csrf-token": loginPayload.data.csrfToken
    },
    body: JSON.stringify({ role: "user", expiresInDays: 7 })
  });
  assert.equal(inviteCreate.status, 201);
  const invitePayload = await inviteCreate.json();
  assert.ok(invitePayload.data.code);
  const inviteList = await fetch(`${origin}/api/invites`, {
    headers: { "cookie": oldCookie }
  });
  assert.equal(inviteList.status, 200);
  const inviteListPayload = await inviteList.json();
  const savedInvite = inviteListPayload.data.find((invite) => invite.id === invitePayload.data.id);
  assert.equal(savedInvite?.code, invitePayload.data.code);

  const wechatLogin = await fetch(`${origin}/api/app-auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48"
    },
    body: JSON.stringify({ username: "admin", password: initialPassword })
  });
  assert.equal(wechatLogin.status, 200);
  const wechatPayload = await wechatLogin.json();
  assert.ok(wechatPayload.data.sessionToken);
  const wechatCookies = wechatLogin.headers.getSetCookie();
  assert.equal(wechatCookies.length, 1);
  const embeddedSetCookie = wechatCookies.find((cookie) => cookie.startsWith("hgu_app_session="));
  assert.ok(embeddedSetCookie);
  assert.match(embeddedSetCookie, /; Path=\/; SameSite=Lax;/);
  assert.match(embeddedSetCookie, /; HttpOnly;/);
  assert.match(embeddedSetCookie, /; Secure;/);
  assert.doesNotMatch(embeddedSetCookie, /; Domain=/i);
  const embeddedCookie = embeddedSetCookie.split(";", 1)[0];
  const embeddedStatus = await fetch(`${origin}/api/app-auth/status`, {
    headers: {
      cookie: embeddedCookie,
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48"
    }
  });
  assert.equal((await embeddedStatus.json()).data.authenticated, true);
  const headerFallbackStatus = await fetch(`${origin}/api/app-auth/status`, {
    headers: {
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48",
      "x-hgu-app-session": wechatPayload.data.sessionToken
    }
  });
  assert.equal((await headerFallbackStatus.json()).data.authenticated, true);
  const staleCookieStatus = await fetch(`${origin}/api/app-auth/status`, {
    headers: {
      cookie: "hgu_app_session=stale",
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48",
      "x-hgu-app-session": wechatPayload.data.sessionToken
    }
  });
  assert.equal((await staleCookieStatus.json()).data.authenticated, true);
  const regularBrowserHeaderStatus = await fetch(`${origin}/api/app-auth/status`, {
    headers: { "x-hgu-app-session": wechatPayload.data.sessionToken }
  });
  assert.equal((await regularBrowserHeaderStatus.json()).data.authenticated, false);
  const migratedStatus = await fetch(`${origin}/api/app-auth/status`, {
    headers: {
      cookie: `__Host-hgu_app_session=stale; ${embeddedCookie}`,
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48"
    }
  });
  assert.equal((await migratedStatus.json()).data.authenticated, true);

  const formLogin = await fetch(`${origin}/app-auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48"
    },
    body: new URLSearchParams({ username: "admin", password: initialPassword })
  });
  assert.equal(formLogin.status, 303);
  const formCookie = formLogin.headers.get("set-cookie").split(";", 1)[0];
  const formStatus = await fetch(`${origin}/api/app-auth/status`, {
    headers: {
      cookie: formCookie,
      "user-agent": "Mozilla/5.0 Mobile MicroMessenger/8.0.48"
    }
  });
  assert.equal((await formStatus.json()).data.authenticated, true);

  const passwordChange = await fetch(`${origin}/api/app-auth/password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: oldCookie,
      "x-csrf-token": loginPayload.data.csrfToken
    },
    body: JSON.stringify({ currentPassword: initialPassword, newPassword: nextPassword })
  });
  assert.equal(passwordChange.status, 200);
  const newCookie = passwordChange.headers.get("set-cookie").split(";", 1)[0];
  const passwordChangePayload = await passwordChange.json();

  const revoked = await fetch(`${origin}/api/users`, { headers: { cookie: oldCookie } });
  assert.equal(revoked.status, 401);
  const active = await fetch(`${origin}/api/users`, { headers: { cookie: newCookie } });
  assert.equal(active.status, 200);

  const logout = await fetch(`${origin}/api/app-auth/logout`, {
    method: "POST",
    headers: { cookie: newCookie, "x-csrf-token": passwordChangePayload.data.csrfToken }
  });
  assert.equal(logout.status, 200);
  const loggedOut = await fetch(`${origin}/api/users`, { headers: { cookie: newCookie } });
  assert.equal(loggedOut.status, 401);

  const asset = await fetch(`${origin}/styles.css?v=test`, { headers: { "accept-encoding": "br" } });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-encoding"), "br");
  assert.match(asset.headers.get("cache-control"), /immutable/);
  const etag = asset.headers.get("etag");
  const unchanged = await fetch(`${origin}/styles.css?v=test`, {
    headers: { "accept-encoding": "identity", "if-none-match": etag }
  });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("content-encoding"), null);

  const gzipAsset = await fetch(`${origin}/styles.css?v=test`, {
    headers: { "accept-encoding": "br;q=0, gzip;q=1" }
  });
  assert.equal(gzipAsset.status, 200);
  assert.equal(gzipAsset.headers.get("content-encoding"), "gzip");

  const headAsset = await fetch(`${origin}/app.js?v=test`, { method: "HEAD" });
  assert.equal(headAsset.status, 200);
  assert.equal((await headAsset.arrayBuffer()).byteLength, 0);
  assert.equal(headAsset.headers.get("x-dns-prefetch-control"), "off");

  const missingAsset = await fetch(`${origin}/missing.js`);
  assert.equal(missingAsset.status, 404);

  const appRoute = await fetch(`${origin}/campus`);
  assert.equal(appRoute.status, 200);
  assert.match(appRoute.headers.get("content-type"), /^text\/html/);
});
