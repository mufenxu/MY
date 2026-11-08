import test from "node:test";
import assert from "node:assert/strict";
import { createBackgroundSchedulers, groupAutoReservationTasksByUser } from "../src/services/background-schedulers.js";
import { AsyncLocalStorage } from "node:async_hooks";

test("seat auto tasks prewarm and run at their own deadline without waiting for waitlists", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-08T21:54:00+08:00") });
  const events = [];
  const task = { id: "task-1", user_id: "user-1", enabled: true, venue_id: "v1", venue_name: "图书馆",
    floor_id: "f1", floor_name: "二层", date: "2026-11-09", start_minute: 540, end_minute: 660,
    run_date: "2026-11-08", run_minute: 1315 };
  const schedulers = createBackgroundSchedulers({
    repository: { listEnabledLibrarySeatAutoTasks: async () => [task], findUserById: async () => ({ id: "user-1" }) },
    logger: { info() {}, warn() {} }, userContextStorage: new AsyncLocalStorage(),
    isShuttingDown: () => false, nowIso: () => new Date().toISOString(),
    reloginSchoolSessionIfWanted: async () => {},
    prepareLibrarySeatAutoTask: async () => { events.push(["prepared", Date.now()]); },
    runLibrarySeatAutoTask: async () => { events.push(["run", Date.now()]); return { status: "success" }; }
  });
  try {
    schedulers.startLibrarySeatAutoTaskScheduler();
    t.mock.timers.tick(0);
    await new Promise(setImmediate);
    t.mock.timers.tick(15_000);
    await new Promise(setImmediate);
    assert.deepEqual(events, [["prepared", Date.parse("2026-11-08T21:54:15+08:00")]]);
    t.mock.timers.tick(45_000);
    await new Promise(setImmediate);
    assert.deepEqual(events[1], ["run", Date.parse("2026-11-08T21:55:00+08:00")]);
  } finally { schedulers.stopBackgroundSchedulers(); }
});

test("groups auto-reservation tasks by user while preserving scheduler order", () => {
  const tasks = [
    { id: "task-1", user_id: "user-1" },
    { id: "task-2", user_id: "user-2" },
    { id: "task-3", user_id: "user-1" },
    { id: "task-4", user_id: "user-3" }
  ];

  assert.deepEqual(groupAutoReservationTasksByUser(tasks), [
    ["user-1", [tasks[0], tasks[2]]],
    ["user-2", [tasks[1]]],
    ["user-3", [tasks[3]]]
  ]);
});
