import test from "node:test";
import assert from "node:assert/strict";
import { createReservationService } from "../src/services/reservation-service.js";

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
