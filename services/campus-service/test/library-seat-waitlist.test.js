import test from "node:test";
import assert from "node:assert/strict";
import {
  librarySeatWaitlistNextScanDelay,
  librarySeatWaitlistRunPlan,
  normalizeLibrarySeatWaitlistInput,
  pickLibrarySeatWaitlistFreeSeat,
  scanLibrarySeatWaitlist
} from "../src/lib/library-seat-waitlist.js";

function beijingNow(date, minute) {
  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(minute / 60);
  const minuteOfHour = minute % 60;
  return new Date(Date.UTC(year, month - 1, day, hour, minuteOfHour, 0, 0) - 8 * 60 * 60 * 1000);
}

const baseTask = {
  venueId: "1744276833606668288",
  venueName: "图书馆",
  floorId: "1935932081147318272",
  floorName: "二层",
  date: "2026-09-03",
  startMinute: 600,
  endMinute: 720,
  minLabel: 1,
  maxLabel: 45,
  enabled: true
};

test("normalizes waitlist input with second-floor default range", () => {
  const result = normalizeLibrarySeatWaitlistInput({
    venueId: "1744276833606668288",
    floorId: "1935932081147318272",
    venueName: "图书馆",
    floorName: "二层",
    date: "2026-09-03",
    startMinute: 480,
    endMinute: 600
  });
  assert.equal(result.minLabel, 1);
  assert.equal(result.maxLabel, 45);
  assert.equal(result.enabled, true);
  assert.equal(result.startMinute, 480);
  assert.equal(result.endMinute, 600);
});

test("rejects invalid waitlist input", () => {
  assert.throws(
    () => normalizeLibrarySeatWaitlistInput({ ...baseTask, endMinute: 600 }),
    /结束时间必须晚于开始时间/
  );
  assert.throws(
    () => normalizeLibrarySeatWaitlistInput({ ...baseTask, endMinute: 1440 }),
    /不能超过 4 小时/
  );
  assert.throws(
    () => normalizeLibrarySeatWaitlistInput({ ...baseTask, minLabel: 46, maxLabel: 10 }),
    /最小座位号不能大于最大座位号/
  );
});

test("keeps disabled flag when disabling a task", () => {
  const result = normalizeLibrarySeatWaitlistInput({ ...baseTask, enabled: false });
  assert.equal(result.enabled, false);
});

test("run plan marks a task expired after its time window ends", () => {
  const beforeEnd = beijingNow("2026-09-03", 719);
  const afterEnd = beijingNow("2026-09-03", 721);
  assert.equal(librarySeatWaitlistRunPlan(baseTask, beforeEnd).due, true);
  assert.equal(librarySeatWaitlistRunPlan(baseTask, beforeEnd).expired, false);
  assert.equal(librarySeatWaitlistRunPlan(baseTask, afterEnd).due, false);
  assert.equal(librarySeatWaitlistRunPlan(baseTask, afterEnd).expired, true);
});

test("next scan delay uses fast interval inside the hot window", () => {
  const now = beijingNow("2026-09-03", 480);
  const delay = librarySeatWaitlistNextScanDelay([baseTask], now, {
    fastMs: 20_000,
    mediumMs: 120_000,
    slowMs: 600_000,
    hotWindowMs: 2 * 60 * 60 * 1000,
    mediumWindowMs: 24 * 60 * 60 * 1000
  });
  assert.equal(delay, 20_000);
});

test("next scan delay uses medium interval for a same-day slot hours away", () => {
  const now = beijingNow("2026-09-03", 300);
  const delay = librarySeatWaitlistNextScanDelay([baseTask], now, {
    fastMs: 20_000,
    mediumMs: 120_000,
    slowMs: 600_000,
    hotWindowMs: 2 * 60 * 60 * 1000,
    mediumWindowMs: 24 * 60 * 60 * 1000
  });
  assert.equal(delay, 120_000);
});

test("next scan delay uses slow interval for distant windows", () => {
  const now = new Date(Date.UTC(2026, 8, 3, 4, 0, 0, 0) - 8 * 60 * 60 * 1000);
  const farTask = { ...baseTask, date: "2026-09-05" };
  const delay = librarySeatWaitlistNextScanDelay([farTask], now, {
    fastMs: 20_000,
    mediumMs: 120_000,
    slowMs: 600_000,
    hotWindowMs: 2 * 60 * 60 * 1000,
    mediumWindowMs: 24 * 60 * 60 * 1000
  });
  assert.equal(delay, 600_000);
});

test("picks the smallest free seat inside the label range", () => {
  const seats = [
    { id: "s50", label: "50", isFree: true },
    { id: "s7", label: "7", isFree: true },
    { id: "s3", label: "3", isFree: false }
  ];
  assert.equal(pickLibrarySeatWaitlistFreeSeat(seats, 1, 45).id, "s7");
  assert.equal(pickLibrarySeatWaitlistFreeSeat(seats, 10, 45), null);
});

test("scans and books the first released seat in range", async () => {
  const calls = [];
  const client = {
    listAreas: async () => ({
      areas: [{ id: "room-a", name: "二层电子阅览区", seatFree: 1 }]
    }),
    getSeats: async (input) => {
      calls.push(["seats", input.roomId]);
      return [
        { id: "seat-1", label: "1", isFree: false },
        { id: "seat-42", label: "42", isFree: true }
      ];
    },
    submitReservation: async (input) => {
      calls.push(["book", input.seatId, input.date, input.startMinute, input.endMinute]);
      return { makeId: "mk-1" };
    }
  };
  const now = beijingNow("2026-09-03", 540);
  const result = await scanLibrarySeatWaitlist({ task: baseTask, client, now });
  assert.equal(result.status, "success");
  assert.equal(result.seat.seatId, "seat-42");
  assert.equal(result.seat.seatLabel, "42");
  assert.deepEqual(calls, [
    ["seats", "room-a"],
    ["book", "seat-42", "2026-09-03", 600, 720]
  ]);
});

test("continues to the next released seat after a 409 conflict", async () => {
  const submit = async (input) => {
    if (input.seatId === "seat-7") {
      const error = new Error("座位已被预约");
      error.status = 409;
      throw error;
    }
    return { makeId: "mk-2" };
  };
  const client = {
    listAreas: async () => ({
      areas: [
        { id: "room-a", name: "一层", seatFree: 1 },
        { id: "room-b", name: "二层", seatFree: 1 }
      ]
    }),
    getSeats: async (input) => input.roomId === "room-a"
      ? [{ id: "seat-7", label: "7", isFree: true }]
      : [{ id: "seat-9", label: "9", isFree: true }],
    submitReservation: submit
  };
  const now = beijingNow("2026-09-03", 540);
  const result = await scanLibrarySeatWaitlist({ task: baseTask, client, now });
  assert.equal(result.status, "success");
  assert.equal(result.seat.seatId, "seat-9");
});

test("returns listening when no free seat is found in range", async () => {
  const client = {
    listAreas: async () => ({
      areas: [{ id: "room-a", name: "二层电子阅览区", seatFree: 1 }]
    }),
    getSeats: async () => [
      { id: "seat-50", label: "50", isFree: true },
      { id: "seat-8", label: "8", isFree: false }
    ],
    submitReservation: async () => {
      throw new Error("should not submit");
    }
  };
  const now = beijingNow("2026-09-03", 540);
  const result = await scanLibrarySeatWaitlist({ task: baseTask, client, now });
  assert.equal(result.status, "listening");
});

test("returns listening without area requests when nothing is free", async () => {
  let areaCalls = 0;
  const client = {
    listAreas: async () => {
      areaCalls += 1;
      return { areas: [{ id: "room-a", name: "二层电子阅览区", seatFree: 0 }] };
    },
    getSeats: async () => {
      throw new Error("should not query seats");
    },
    submitReservation: async () => {
      throw new Error("should not submit");
    }
  };
  const now = beijingNow("2026-09-03", 540);
  const result = await scanLibrarySeatWaitlist({ task: baseTask, client, now });
  assert.equal(result.status, "listening");
  assert.equal(areaCalls, 1);
});
