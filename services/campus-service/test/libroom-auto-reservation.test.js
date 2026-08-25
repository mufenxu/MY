import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAutoReservationTaskInput,
  isAutoReservationDue,
  executeAutoReservationCandidates
} from "../src/lib/libroom-auto-reservation.js";

const baseInput = {
  name: "周三研讨",
  enabled: true,
  reservationDate: "2026-08-27",
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
      executeTime: "08:30",
      candidates: baseInput.candidates,
      title: "个人学习",
      content: "完成课程阅读",
      mobile: "13800138000",
      open: false
    }
  );
});

test("matches only the configured reservation date after the start time", () => {
  assert.equal(
    isAutoReservationDue(
      normalizeAutoReservationTaskInput(baseInput),
      new Date("2026-08-27T08:30:00+08:00")
    ),
    true
  );
  assert.equal(
    isAutoReservationDue(
      normalizeAutoReservationTaskInput(baseInput),
      new Date("2026-08-27T08:29:59+08:00")
    ),
    false
  );
  assert.equal(
    isAutoReservationDue(
      normalizeAutoReservationTaskInput(baseInput),
      new Date("2026-08-28T08:30:00+08:00")
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
