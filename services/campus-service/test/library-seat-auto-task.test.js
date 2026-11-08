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
