import test from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_SEAT_AUTO_TASK_DEFAULT_RUN_MINUTE,
  librarySeatAutoTaskNextRunDelay,
  librarySeatAutoTaskRunAtMs,
  librarySeatAutoTaskRunPlan,
  librarySeatAutoTaskTimes,
  normalizeLibrarySeatAutoTaskInput,
  pickLibrarySeatAutoTaskSeat,
  previousDate,
  scanLibrarySeatAutoTask
} from "../src/lib/library-seat-auto-task.js";

function beijingNow(date, minute) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60, 0, 0) - 8 * 60 * 60 * 1000);
}

const baseInput = {
  venueId: "1744276833606668288",
  venueName: "图书馆",
  floorId: "1935932081147318272",
  floorName: "二层",
  date: "2026-11-09",
  startMinute: 540,
  endMinute: 660,
  minLabel: 1,
  maxLabel: 45
};

test("defaults the run date to the day before the target and the run time to 21:55", () => {
  const result = normalizeLibrarySeatAutoTaskInput(baseInput);
  assert.equal(result.runDate, "2026-11-08");
  assert.equal(result.runMinute, LIBRARY_SEAT_AUTO_TASK_DEFAULT_RUN_MINUTE);
  assert.equal(result.runMinute, 21 * 60 + 55);
});

test("keeps an explicit run date and run time", () => {
  const result = normalizeLibrarySeatAutoTaskInput({
    ...baseInput,
    runDate: "2026-11-09",
    runMinute: 7 * 60
  });
  assert.equal(result.runDate, "2026-11-09");
  assert.equal(result.runMinute, 420);
});

test("rejects a run date after the target date", () => {
  assert.throws(
    () => normalizeLibrarySeatAutoTaskInput({ ...baseInput, runDate: "2026-11-10" }),
    /运行日期不能晚于预约目标日期/
  );
});

test("previousDate rolls back across a month boundary", () => {
  assert.equal(previousDate("2026-11-01"), "2026-10-31");
  assert.equal(previousDate("2026-03-01"), "2026-02-28");
});

test("run plan waits before the run time, is due on the minute, and expires after the slot", () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const before = librarySeatAutoTaskRunPlan(task, beijingNow("2026-11-08", 21 * 60 + 54));
  const onTime = librarySeatAutoTaskRunPlan(task, beijingNow("2026-11-08", 21 * 60 + 55));
  const after = librarySeatAutoTaskRunPlan(task, beijingNow("2026-11-09", 11 * 60 + 1));

  assert.equal(before.waiting, true);
  assert.equal(before.due, false);
  assert.equal(onTime.waiting, false);
  assert.equal(onTime.due, true);
  assert.equal(after.due, false);
  assert.equal(after.expired, true);
});

test("run plan ignores a disabled task", () => {
  const task = { ...normalizeLibrarySeatAutoTaskInput(baseInput), enabled: false };
  const plan = librarySeatAutoTaskRunPlan(task, beijingNow("2026-11-08", 22 * 60));
  assert.equal(plan.waiting, false);
  assert.equal(plan.due, false);
});

test("run time resolves to the exact Beijing instant", () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  assert.equal(librarySeatAutoTaskRunAtMs(task), beijingNow("2026-11-08", 21 * 60 + 55).getTime());
});

test("next delay wakes up right on the run minute instead of the slow tick", () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const oneMinuteBefore = beijingNow("2026-11-08", 21 * 60 + 54);
  const delay = librarySeatAutoTaskNextRunDelay([task], oneMinuteBefore, { slowMs: 600_000, activeMs: 20_000 });
  assert.ok(delay <= 61_000, `expected a wake-up within a minute, got ${delay}`);
});

test("pick prefers the requested seat, then a neighbour, then the range, then anywhere", () => {
  const seats = [
    { id: "s7", label: 7, isFree: false },
    { id: "s8", label: 8, isFree: false },
    { id: "s9", label: 9, isFree: true },
    { id: "s30", label: 30, isFree: true },
    { id: "s60", label: 60, isFree: true }
  ];
  const requestedTaken = pickLibrarySeatAutoTaskSeat(seats, { seatLabels: [8], minLabel: 1, maxLabel: 45 });
  assert.equal(requestedTaken.label, 9);
  assert.equal(requestedTaken.tier, "neighbour");

  const requestedFree = pickLibrarySeatAutoTaskSeat(seats, { seatLabels: [30], minLabel: 1, maxLabel: 45 });
  assert.equal(requestedFree.label, 30);
  assert.equal(requestedFree.tier, "preferred");

  const rangeFirst = pickLibrarySeatAutoTaskSeat(seats, { minLabel: 1, maxLabel: 45 });
  assert.equal(rangeFirst.label, 9);
  assert.equal(rangeFirst.tier, "range");

  const outOfRange = pickLibrarySeatAutoTaskSeat([{ id: "s60", label: 60, isFree: true }], { minLabel: 1, maxLabel: 45 });
  assert.equal(outOfRange.label, 60);
  assert.equal(outOfRange.tier, "fallback");
});

test("pick returns null when every seat is taken", () => {
  const seats = [{ id: "s1", label: 1, isFree: false }, { id: "s2", label: 2, isFree: false }];
  assert.equal(pickLibrarySeatAutoTaskSeat(seats, { minLabel: 1, maxLabel: 45 }), null);
});

test("scan submits the first free seat and reports how it was chosen", async () => {
  const task = { ...normalizeLibrarySeatAutoTaskInput(baseInput), seatLabels: [8] };
  const submitted = [];
  const client = {
    listAreas: async () => [{ id: "a1", name: "二层电子阅览区", seatFree: 2 }],
    getSeats: async () => [
      { id: "s8", label: 8, isFree: false },
      { id: "s9", label: 9, isFree: true }
    ],
    submitReservation: async (payload) => { submitted.push(payload); }
  };
  const result = await scanLibrarySeatAutoTask({ task, client, now: beijingNow("2026-11-08", 21 * 60 + 55) });
  assert.equal(result.status, "success");
  assert.equal(result.seat.seatLabel, "9");
  assert.equal(result.tier, "neighbour");
  assert.equal(submitted.length, 1);
});

test("scan reports empty when the whole area has no free seat", async () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const client = {
    listAreas: async () => [{ id: "a1", name: "二层电子阅览区", seatFree: 0 }],
    getSeats: async () => [],
    submitReservation: async () => { throw new Error("should not submit"); }
  };
  const result = await scanLibrarySeatAutoTask({ task, client, now: beijingNow("2026-11-08", 21 * 60 + 55) });
  assert.equal(result.status, "empty");
});

test("scan does nothing before the run time", async () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  let called = false;
  const client = {
    listAreas: async () => { called = true; return []; },
    getSeats: async () => [],
    submitReservation: async () => {}
  };
  const result = await scanLibrarySeatAutoTask({ task, client, now: beijingNow("2026-11-08", 20 * 60) });
  assert.equal(result.status, "waiting");
  assert.equal(called, false);
});

test("times render as HH:MM", () => {
  assert.deepEqual(librarySeatAutoTaskTimes(540, 660), { startTime: "09:00", endTime: "11:00" });
});

test("stored task fields reach the school query as normalized parameters", async () => {
  const task = { enabled: true, venue_id: baseInput.venueId, venue_name: baseInput.venueName,
    floor_id: baseInput.floorId, floor_name: baseInput.floorName, date: baseInput.date,
    start_minute: 540, end_minute: 660, run_date: "2026-11-08", run_minute: 1315 };
  let query;
  await scanLibrarySeatAutoTask({ task, now: beijingNow("2026-11-08", 1315), client: {
    listAreas: async (input) => { query = input; return []; }
  } });
  assert.equal(query.venueId, baseInput.venueId);
  assert.equal(query.startMinute, 540);
  assert.equal(query.floorId, baseInput.floorId);
});

test("a preferred seat in another area is tried before any fallback", async () => {
  const task = { ...normalizeLibrarySeatAutoTaskInput(baseInput), seatLabels: [8] };
  const submitted = [];
  const result = await scanLibrarySeatAutoTask({ task, now: beijingNow("2026-11-08", 1315), client: {
    listAreas: async () => [{ id: "a1", name: "甲区", seatFree: 10 }, { id: "a2", name: "乙区", seatFree: 1 }],
    getSeats: async ({ roomId }) => roomId === "a1" ? [{ id: "s1", label: 1, isFree: true }] : [{ id: "s8", label: 8, isFree: true }],
    submitReservation: async (input) => { submitted.push(input.seatId); }
  } });
  assert.equal(result.status, "success");
  assert.deepEqual(submitted, ["s8"]);
});

test("an occupied seat immediately falls back to another seat in the same area", async () => {
  const task = { ...normalizeLibrarySeatAutoTaskInput(baseInput), seatLabels: [8] };
  const submitted = [];
  const result = await scanLibrarySeatAutoTask({ task, now: beijingNow("2026-11-08", 1315), client: {
    listAreas: async () => [{ id: "a1", name: "甲区", seatFree: 2 }],
    getSeats: async () => [{ id: "s8", label: 8, isFree: true }, { id: "s9", label: 9, isFree: true }],
    submitReservation: async (input) => {
      submitted.push(input.seatId);
      if (input.seatId === "s8") throw Object.assign(new Error("座位已被预约"), { status: 409 });
    }
  } });
  assert.equal(result.status, "success");
  assert.deepEqual(submitted, ["s8", "s9"]);
});

test("prepared seat ids are submitted at the deadline without availability queries", async () => {
  const task = { ...normalizeLibrarySeatAutoTaskInput(baseInput), seatLabels: [8] };
  const prepared = { candidates: [{ seatId: "s8", seatLabel: "8", areaId: "a1", areaName: "甲区", tier: "preferred", label: 8 }], blocked: new Set() };
  const result = await scanLibrarySeatAutoTask({ task, prepared, now: beijingNow("2026-11-08", 1315), client: {
    listAreas: async () => { throw new Error("deadline must not query areas"); },
    getSeats: async () => { throw new Error("deadline must not query seats"); },
    submitReservation: async (input) => { assert.equal(input.seatId, "s8"); }
  } });
  assert.equal(result.status, "success");
});

test("a submission timeout confirms the existing booking before changing seats", async () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const prepared = { candidates: [{ seatId: "s8", seatLabel: "8", areaId: "a1", areaName: "甲区", tier: "preferred", label: 8 }], blocked: new Set() };
  let submissions = 0;
  const result = await scanLibrarySeatAutoTask({ task, prepared, now: beijingNow("2026-11-08", 1315), client: {
    submitReservation: async () => { submissions++; throw Object.assign(new Error("timeout"), { status: 504 }); },
    getMyReservations: async () => [{ seatId: "s8", date: "2026-11-09", startTime: "09:00", endTime: "11:00", status: "RESERVE" }]
  } });
  assert.equal(result.status, "success");
  assert.equal(submissions, 1);
});

test("local capacity rejection retries the same candidate without confirming a nonexistent request", async () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const prepared = { candidates: [{ seatId: "s8", seatLabel: "8", areaId: "a1", tier: "preferred", label: 8 }], blocked: new Set() };
  let submissions = 0;
  const client = {
    submitReservation: async () => {
      if (++submissions === 1) throw Object.assign(new Error("容量不足"), { status: 503, code: "UPSTREAM_CAPACITY_EXCEEDED" });
    },
    getMyReservations: async () => { assert.fail("no reservation was dispatched"); }
  };
  const options = { task, prepared, client, now: beijingNow("2026-11-08", 1315) };
  const first = await scanLibrarySeatAutoTask(options);
  assert.equal(first.status, "retry");
  assert.equal(first.retryAfterMs, 750);
  assert.equal(prepared.pending, undefined);
  assert.equal((await scanLibrarySeatAutoTask(options)).status, "success");
  assert.equal(submissions, 2);
});

test("stopping during an occupied response prevents the next candidate submission", async () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const prepared = { candidates: [{ seatId: "s8" }, { seatId: "s9" }], blocked: new Set() };
  let stopped = false;
  const submitted = [];
  const result = await scanLibrarySeatAutoTask({ task, prepared, now: beijingNow("2026-11-08", 1315),
    shouldStop: () => stopped, client: {
      submitReservation: async ({ seatId }) => {
        submitted.push(seatId);
        stopped = true;
        throw Object.assign(new Error("座位已被预约"), { status: 409, code: "LIBRARY_SEAT_OCCUPIED" });
      }
    } });
  assert.equal(result.status, "stopped");
  assert.deepEqual(submitted, ["s8"]);
});

test("unavailable confirmation keeps a submission pending without changing seats", async () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const prepared = { candidates: [{ seatId: "s8" }, { seatId: "s9" }], blocked: new Set() };
  let submissions = 0;
  let lookups = 0;
  const options = { task, prepared, now: beijingNow("2026-11-08", 1315), client: {
    submitReservation: async () => { submissions++; throw Object.assign(new Error("timeout"), { status: 504 }); },
    getMyReservations: async () => {
      if (++lookups === 1) throw new Error("lookup unavailable");
      return [];
    }
  } };
  assert.equal((await scanLibrarySeatAutoTask(options)).status, "confirming");
  assert.equal((await scanLibrarySeatAutoTask(options)).status, "confirming");
  assert.equal(prepared.pending.seatId, "s8");
  assert.equal(submissions, 1);
  assert.equal(lookups, 2);
});

test("deadline wake-up does not add a fixed delay", () => {
  const task = normalizeLibrarySeatAutoTaskInput(baseInput);
  const now = new Date("2026-11-08T21:54:59.800+08:00");
  assert.equal(librarySeatAutoTaskNextRunDelay([task], now, { prewarmMs: 0 }), 200);
});
