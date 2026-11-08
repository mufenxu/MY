import test from "node:test";
import assert from "node:assert/strict";
import { createReservationService } from "../src/services/reservation-service.js";
import { MemoryCampusRepository } from "../src/storage/campus-repository.js";

async function seatAutoFixture(onBooking) {
  const repository = new MemoryCampusRepository();
  const task = { id: "auto-seat-1", user_id: "user-1", enabled: true, status: "scheduled",
    venue_id: "v1", venue_name: "图书馆", floor_id: "f1", floor_name: "二层",
    date: "2026-11-09", start_minute: 540, end_minute: 660, seat_labels: [8],
    run_date: "2026-11-08", run_minute: 1315 };
  await repository.insertLibrarySeatAutoTask(task);
  const calls = [];
  let saves = 0;
  let jar = { cookies: [], meta: { librarySeat: { token: "fixture-session", expiresAt: new Date(Date.now() + 600_000).toISOString() } } };
  const service = createReservationService({ repository, currentUserId: () => "user-1",
    logger: { info() {}, warn() {} }, nowIso: () => new Date().toISOString(),
    readSessionJar: async () => structuredClone(jar), saveSessionJar: async (value) => { saves++; jar = structuredClone(value); },
    parseJsonLike: JSON.parse, readUpstreamText: (response) => response.text(),
    fetchWithJar: async (url, options) => {
      const path = new URL(url).pathname;
      calls.push({ path, at: Date.now() });
      let data;
      if (path.includes("findRoomDuration")) data = [{ id: "a1", name: "甲区", seatFree: 0 }];
      else if (path.includes("querySeatLayout")) data = JSON.stringify({ objects: [{ seat: { id: "s8", label: "8" } }, { seat: { id: "s9", label: "9" } }] });
      else if (path.includes("freeBook")) {
        const payload = await onBooking(path);
        options.onDispatch?.();
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      else throw new Error("unexpected school endpoint: " + path);
      return new Response(JSON.stringify({ code: 200, data }), { status: 200 });
    }
  });
  return { service, task, repository, calls, saves: () => saves };
}

test("prewarmed tasks submit at the deadline and persist their session only after execution", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-08T21:54:15+08:00") });
  const fixture = await seatAutoFixture(async () => ({ code: 200 }));
  await fixture.service.prepareLibrarySeatAutoTask(fixture.task, { id: "user-1" });
  assert.equal(fixture.saves(), 0);
  t.mock.timers.tick(45_000);
  const result = await fixture.service.runLibrarySeatAutoTask(fixture.task, { id: "user-1" }, new Date());
  assert.equal(result.status, "success");
  assert.equal(result.seatId, "s8");
  assert.equal(result.timings.firstRequestDelayMs, 0);
  assert.equal(fixture.saves(), 1);
  assert.deepEqual(fixture.calls.filter((call) => call.at >= Date.parse("2026-11-08T21:55:00+08:00")).map((call) => call.path),
    ["/jsq/static/frontApi/make/freeBook/s8/2026-11-09/540/660"]);
  assert.equal((await fixture.repository.getLibrarySeatAutoTask("user-1", fixture.task.id)).enabled, false);
});

test("a not-open response retries the preferred seat promptly instead of choosing a fallback", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-08T21:54:15+08:00") });
  let bookings = 0;
  const fixture = await seatAutoFixture(async () => ++bookings === 1
    ? { code: 500, message: "尚未开放预约" } : { code: 200 });
  await fixture.service.prepareLibrarySeatAutoTask(fixture.task, { id: "user-1" });
  t.mock.timers.tick(45_000);
  const operation = fixture.service.runLibrarySeatAutoTask(fixture.task, { id: "user-1" }, new Date());
  await new Promise(setImmediate);
  assert.equal(bookings, 1);
  t.mock.timers.tick(749);
  await new Promise(setImmediate);
  assert.equal(bookings, 1);
  t.mock.timers.tick(1);
  const result = await operation;
  assert.equal(result.status, "success");
  assert.equal(result.seatId, "s8");
  assert.equal(bookings, 2);
});

test("capacity rejection does not record a request until the retry is dispatched", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-08T21:54:15+08:00") });
  let bookings = 0;
  const fixture = await seatAutoFixture(async () => {
    if (++bookings === 1) throw Object.assign(new Error("容量不足"), { status: 503, code: "UPSTREAM_CAPACITY_EXCEEDED" });
    return { code: 200 };
  });
  await fixture.service.prepareLibrarySeatAutoTask(fixture.task, { id: "user-1" });
  t.mock.timers.tick(45_000);
  const operation = fixture.service.runLibrarySeatAutoTask(fixture.task, { id: "user-1" }, new Date());
  await new Promise(setImmediate);
  assert.equal(bookings, 1);
  t.mock.timers.tick(750);
  const result = await operation;
  assert.equal(result.status, "success");
  assert.equal(result.timings.firstRequestDelayMs, 750);
  assert.equal(bookings, 2);
});

test("disabling a running task stops fallback submissions within the same scan", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-08T21:54:15+08:00") });
  const submitted = [];
  const fixture = await seatAutoFixture(async (path) => {
    submitted.push(path);
    await fixture.repository.updateLibrarySeatAutoTask("user-1", fixture.task.id, { enabled: false, run_owner: null }, new Date().toISOString());
    return { code: 500, message: "座位已被预约" };
  });
  await fixture.service.prepareLibrarySeatAutoTask(fixture.task, { id: "user-1" });
  t.mock.timers.tick(45_000);
  const operation = fixture.service.runLibrarySeatAutoTask(fixture.task, { id: "user-1" }, new Date());
  await new Promise(setImmediate);
  assert.equal(submitted.length, 1);
  const result = await operation;
  assert.equal(result.status, "stopped");
});

test("auto-reservation notifications use the user's reminder targets without leaking form details", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  process.env.NOTIFICATION_SERVICE_URL = "https://notifications.example.test";
  process.env.CAMPUS_NOTIFICATION_API_KEY = "test-secret";
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const service = createReservationService({
      logger: { info() {}, warn() {} },
      nowIso: () => "2026-08-24T00:00:00.000Z",
      repository: {
        async getReminderPreference() {
          return { app_recipient_id: "platform-user", recipient_id: "wecom-user" };
        }
      }
    });

    await service.notifyAutoReservationTask(
      { id: "user-1" },
      {
        id: "task-1",
        name: "周三研讨",
        reservationDate: "2026-08-27",
        executeDate: "2026-08-24",
        executeTime: "07:43",
        mobile: "13800138000",
        content: "不应出现在通知里"
      },
      {
        status: "succeeded",
        candidateIndex: 0,
        message: null,
        runAt: "2026-08-24T00:00:00.000Z"
      }
    );

    assert.equal(requests.length, 1);
    const payload = requests[0].body;
    assert.equal(payload.audience.users[0], "platform-user");
    assert.deepEqual(payload.channels, ["app", "wecom"]);
    assert.equal(payload.content.title, "研讨间自动预约成功");
    assert.equal(payload.content.summary, "“周三研讨”已自动预约 2026-08-27 的研讨间。");
    assert.equal(payload.source.entityId, "task-1");
    assert.equal(payload.idempotencyKey, "libroom-auto-reservation-task-1-succeeded-2026-08-24T00:00:00.000Z");
    assert.equal(JSON.stringify(payload).includes("13800138000"), false);
    assert.equal(JSON.stringify(payload).includes("不应出现在通知里"), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NOTIFICATION_SERVICE_URL;
    delete process.env.CAMPUS_NOTIFICATION_API_KEY;
  }
});

test("rejects another enabled auto-reservation task for the same target date", async () => {
  const service = createReservationService({
    logger: { info() {}, warn() {} },
    nowIso: () => "2026-08-24T00:00:00.000Z",
    repository: {
      async listAutoReservationTasks() {
        return [{
          id: "existing-task",
          enabled: true,
          reservationDate: "2026-08-27"
        }];
      }
    }
  });

  await assert.rejects(
    () => service.saveAutoReservationTask("user-1", {
      name: "重复任务",
      enabled: true,
      reservationDate: "2026-08-27",
      executeDate: "2026-08-24",
      executeTime: "07:43",
      candidates: [{ areaId: 9, startTime: "09:00", endTime: "11:00" }],
      title: "个人学习",
      content: "完成课程阅读",
      mobile: "13800138000",
      open: false
    }),
    (error) => error.status === 409 && error.code === "AUTO_RESERVATION_DUPLICATE_TARGET_DATE"
  );
});
