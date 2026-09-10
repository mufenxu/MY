import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAutoReservationTaskInput,
  autoReservationRunPlan,
  autoReservationNextScanDelay,
  isAutoReservationDue,
  executeAutoReservationCandidates
} from "../src/lib/libroom-auto-reservation.js";

const baseInput = {
  name: "周三研讨",
  enabled: true,
  reservationDate: "2026-08-27",
  executeDate: "2026-08-24",
  executeTime: "08:30",
  candidates: [
    { areaId: 9, startTime: "09:00", endTime: "11:00" },
    { areaId: 10, startTime: "14:00", endTime: "16:00" }
  ],
  title: "个人学习",
  content: "完成课程阅读",
  mobile: "13800138000",
  open: false
};

test("normalizes an editable one-time auto-reservation task", () => {
  assert.deepEqual(
    normalizeAutoReservationTaskInput(baseInput),
    {
      name: "周三研讨",
      enabled: true,
      reservationDate: "2026-08-27",
      executeDate: "2026-08-24",
      executeTime: "08:30",
      candidates: baseInput.candidates,
      title: "个人学习",
      content: "完成课程阅读",
      mobile: "13800138000",
      open: false
    }
  );
});

test("runs at the configured execute date for a future target date", () => {
  const task = normalizeAutoReservationTaskInput(baseInput);

  assert.equal(
    isAutoReservationDue(
      task,
      new Date("2026-08-24T08:30:00+08:00")
    ),
    true
  );
  assert.equal(
    isAutoReservationDue(
      task,
      new Date("2026-08-24T08:29:59+08:00")
    ),
    false
  );
  assert.equal(
    isAutoReservationDue(
      task,
      new Date("2026-08-23T08:30:00+08:00")
    ),
    false
  );
  assert.deepEqual(
    autoReservationRunPlan(task, new Date("2026-08-24T08:30:00+08:00")),
    {
      due: true,
      state: "ready",
      reason: null,
      targetDate: "2026-08-27",
      executeDate: "2026-08-24",
      executeTime: "08:30",
      nextRunAt: null,
      runKey: "2026-08-27:2026-08-24T08:30"
    }
  );
});

test("schedules the next scan exactly at the configured Beijing run minute", () => {
  const task = normalizeAutoReservationTaskInput({
    ...baseInput,
    reservationDate: "2026-08-28",
    executeDate: "2026-08-26",
    executeTime: "07:43"
  });

  assert.equal(
    autoReservationNextScanDelay(
      [task],
      new Date("2026-08-25T23:42:58.250Z"),
      { fallbackMs: 15_000 }
    ),
    1_750
  );
  assert.equal(
    autoReservationNextScanDelay(
      [task],
      new Date("2026-08-25T23:43:00.000Z"),
      { fallbackMs: 15_000 }
    ),
    0
  );
});

test("classifies waiting, ready, invalid, and expired auto-reservation tasks", () => {
  const waitingTask = normalizeAutoReservationTaskInput({
    ...baseInput,
    reservationDate: "2026-08-28",
    executeDate: "2026-08-26",
    executeTime: "07:43"
  });

  assert.deepEqual(
    autoReservationRunPlan(waitingTask, new Date("2026-08-25T23:42:58.250Z")),
    {
      due: false,
      state: "waiting",
      reason: null,
      targetDate: "2026-08-28",
      executeDate: "2026-08-26",
      executeTime: "07:43",
      nextRunAt: "2026-08-25T23:43:00.000Z",
      runKey: "2026-08-28:2026-08-26T07:43"
    }
  );

  const readyTask = normalizeAutoReservationTaskInput(baseInput);
  assert.equal(
    autoReservationRunPlan(readyTask, new Date("2026-08-24T08:30:00+08:00")).state,
    "ready"
  );

  const invalidTask = { ...readyTask, executeDate: "2026-08-20" };
  assert.equal(
    autoReservationRunPlan(invalidTask, new Date("2026-08-24T08:30:00+08:00")).state,
    "invalid"
  );

  const expiredTask = { ...readyTask, reservationDate: "2026-08-23", executeDate: "2026-08-23" };
  const expiredPlan = autoReservationRunPlan(expiredTask, new Date("2026-08-24T08:30:00+08:00"));
  assert.equal(expiredPlan.state, "expired");
  assert.match(expiredPlan.reason, /预约目标日期已过期/);
});

test("legacy tasks without execute date run when the target enters the three-day booking window", () => {
  const legacyInput = { ...baseInput };
  delete legacyInput.executeDate;
  const task = normalizeAutoReservationTaskInput(legacyInput);

  assert.equal(task.executeDate, null);
  assert.equal(isAutoReservationDue(task, new Date("2026-08-23T08:30:00+08:00")), false);
  assert.equal(isAutoReservationDue(task, new Date("2026-08-24T08:29:59+08:00")), false);
  assert.equal(isAutoReservationDue(task, new Date("2026-08-24T08:30:00+08:00")), true);
});

test("rejects execute dates outside the school booking window", () => {
  assert.throws(
    () => normalizeAutoReservationTaskInput({ ...baseInput, executeDate: "2026-08-23" }),
    /运行日期必须在预约目标日期前 3 天至预约当天内/
  );
  assert.throws(
    () => normalizeAutoReservationTaskInput({ ...baseInput, executeDate: "2026-08-28" }),
    /运行日期必须在预约目标日期前 3 天至预约当天内/
  );
});

test("does not run stored tasks whose execute date is outside the booking window", () => {
  assert.equal(
    isAutoReservationDue(
      { ...normalizeAutoReservationTaskInput(baseInput), executeDate: "2026-08-23" },
      new Date("2026-08-24T08:30:00+08:00")
    ),
    false
  );
});

test("retries transient candidate failures a bounded number of times", async () => {
  const task = normalizeAutoReservationTaskInput(baseInput);
  let calls = 0;

  const result = await executeAutoReservationCandidates({
    task,
    date: task.reservationDate,
    submitReservation: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("学校预约系统暂时不可用。");
        error.status = 502;
        throw error;
      }
      return { id: "reservation-1" };
    },
    transientRetryDelayMs: 0
  });

  assert.equal(result.status, "succeeded");
  assert.equal(calls, 2);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].transient, true);
  assert.equal(result.attempts[0].attempt, 1);
});

test("does not retry authentication failures and pauses with an auth-required result", async () => {
  const task = normalizeAutoReservationTaskInput(baseInput);
  let calls = 0;

  const result = await executeAutoReservationCandidates({
    task,
    date: task.reservationDate,
    submitReservation: async () => {
      calls += 1;
      const error = new Error("空间预约会话已过期，请重新登录学校账号。");
      error.status = 401;
      throw error;
    },
    transientRetryDelayMs: 0
  });

  assert.equal(result.status, "auth_required");
  assert.equal(calls, 1);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].transient, false);
});

test("tries candidates in order and continues only after a conflict", async () => {
  const attempts = [];
  const result = await executeAutoReservationCandidates({
    task: normalizeAutoReservationTaskInput(baseInput),
    date: "2026-08-24",
    submitReservation: async (candidate) => {
      attempts.push(candidate);
      if (attempts.length === 1) {
        const error = new Error("时段已被预约");
        error.status = 409;
        throw error;
      }
      return { id: "reservation-2" };
    }
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.candidateIndex, 1);
  assert.equal(attempts[0].areaId, 9);
  assert.equal(attempts[1].areaId, 10);
});

test("stops on a non-conflict error", async () => {
  let calls = 0;
  const result = await executeAutoReservationCandidates({
    task: normalizeAutoReservationTaskInput(baseInput),
    date: "2026-08-24",
    submitReservation: async () => {
      calls += 1;
      const error = new Error("请重新登录学校账号");
      error.status = 400;
      throw error;
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.candidateIndex, 0);
  assert.equal(calls, 1);
});
