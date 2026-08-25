import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAutoReservationTaskInput,
  isAutoReservationDue,
  executeAutoReservationCandidates
} from "../src/lib/libroom-auto-reservation.js";

const baseInput = {
  name: "工作日研讨",
  enabled: true,
  recurrenceMode: "weekly",
  weekdays: [1, 3, 5],
  startDate: "2026-08-24",
  endDate: "2026-09-30",
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

test("normalizes an editable weekly auto-reservation task", () => {
  assert.deepEqual(
    normalizeAutoReservationTaskInput(baseInput),
    {
      name: "工作日研讨",
      enabled: true,
      recurrenceMode: "weekly",
      weekdays: [1, 3, 5],
      startDate: "2026-08-24",
      endDate: "2026-09-30",
      executeTime: "08:30",
      candidates: baseInput.candidates,
      title: "个人学习",
      content: "完成课程阅读",
      mobile: "13800138000",
      open: false
    }
  );
});

test("matches a daily or weekly task only inside its active date window", () => {
  assert.equal(
    isAutoReservationDue(
      normalizeAutoReservationTaskInput({ ...baseInput, recurrenceMode: "daily", weekdays: [] }),
      new Date("2026-08-25T08:30:00+08:00")
    ),
    true
  );
  assert.equal(
    isAutoReservationDue(
      normalizeAutoReservationTaskInput(baseInput),
      new Date("2026-08-25T08:30:00+08:00")
    ),
    false
  );
  assert.equal(
    isAutoReservationDue(
      normalizeAutoReservationTaskInput(baseInput),
      new Date("2026-09-30T08:29:59+08:00")
    ),
    false
  );
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
      error.status = 401;
      throw error;
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.candidateIndex, 0);
  assert.equal(calls, 1);
});
