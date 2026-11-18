import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

test("admin workspace reads role and school binding from row data, not from display text", async () => {
  const [app, admin] = await Promise.all([read("public/app.js"), read("public/admin.js")]);

  assert.match(app, /class="admin-user-row[^"]*"[^>]*data-role="\$\{[^}]+\}"[^>]*data-school-bound="\$\{[^}]+\}"/);
  assert.match(admin, /row\.dataset\.role === "admin"/);
  assert.match(admin, /row\.dataset\.schoolBound === "false"/);
  // 匹配界面文案的写法在文案改动后会静默失效。
  assert.doesNotMatch(admin, /textContent\.includes\(/);
});

test("rescheduling a discussion room keeps the request private unless the user opts in", async () => {
  const source = await read("public/libroom-records-page.js");

  assert.match(source, /id="libroomRescheduleOpen" type="checkbox"/);
  assert.match(source, /nodes\.open\.checked = false;/);
  assert.match(source, /open: nodes\.open\.checked/);
  assert.doesNotMatch(source, /open: true/);
});

test("platform logout reports failure instead of leaving a live session behind", async () => {
  const [runtime, app] = await Promise.all([read("public/platform-runtime.js"), read("public/app.js")]);

  assert.match(runtime, /if \(!response\.ok\) \{[\s\S]*?throw new Error/);
  assert.doesNotMatch(runtime, /\.catch\(\(\) => \{\}\)/);
  assert.match(app, /await p\.logout\(\);\s*\} catch \(error\) \{\s*setNotice\(/);
});

test("switching or locking the account clears cached reservation data", async () => {
  const [app, records, auto, seat] = await Promise.all([
    read("public/app.js"),
    read("public/libroom-records-page.js"),
    read("public/libroom-auto-page.js"),
    read("public/library-seat-page.js")
  ]);

  assert.match(app, /function clearAllData\(\) \{[\s\S]*?document\.dispatchEvent\(new CustomEvent\("resv:reset"\)\);\s*\}/);
  for (const source of [records, auto, seat]) {
    assert.match(source, /addEventListener\("resv:reset"/);
  }
  // 自动任务页只在预约路由下才主动请求，登录门上不发请求。
  assert.match(auto, /if \(window\.HguReservation\?\.isRoute\(\)\) route\(\);/);
});

test("routing is re-evaluated once the session is known", async () => {
  const app = await read("public/app.js");

  assert.match(app, /await refresh\(\{ initial: true \}\);[\s\S]{0,200}?handleRouting\(\);\s*\}/);
  assert.match(app, /if \(state\.appAuth\) window\.location\.hash = "#overview";/);
  // 存储受限时主题初始化不能让 init() 中断。
  assert.match(app, /try \{\s*saved = localStorage\.getItem\("hgu-theme"\)/);
});
