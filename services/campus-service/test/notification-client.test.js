import test from "node:test";
import assert from "node:assert/strict";
import { verifyServiceRequest } from "@my-platform/platform-auth";
import * as notificationClient from "../src/lib/notification-client.js";

const { enqueueCampusNotification, sendCampusNotification } = notificationClient;

test("campus notification enqueue signs the exact request body", async () => {
  const secret = "test-notification-secret-with-enough-entropy";
  let captured = null;
  const payload = {
    msgType: "text",
    content: "【课程提醒】",
    target: { touser: "student-1" }
  };
  const result = await enqueueCampusNotification(payload, {
    serviceUrl: "http://notification.internal",
    apiKey: secret,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ id: "job-1" }), {
        status: 202,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.equal(result.id, "job-1");
  assert.equal(captured.url, "http://notification.internal/enqueue");
  assert.deepEqual(JSON.parse(captured.options.body), payload);
  assert.ok(verifyServiceRequest({
    headers: captured.options.headers,
    secret,
    allowedCallers: ["campus-service"],
    method: "POST",
    pathname: "/enqueue",
    body: captured.options.body
  }));
});

test("campus canonical notification signs the v1 request path and exact body", async () => {
  const secret = "test-notification-secret-with-enough-entropy";
  let captured = null;
  const payload = {
    idempotencyKey: "campus-course:user-1:course-1",
    audience: { users: ["platform-user"] },
    channels: ["app"],
    priority: "normal",
    category: "campus.course.reminder",
    content: { kind: "text", title: "课程即将开始", summary: "15 分钟后上课", blocks: [] },
    source: { service: "campus-service", entityType: "course", entityId: "course-1" },
    scheduledAt: "2026-08-18T01:00:00.000Z"
  };
  const result = await sendCampusNotification(payload, {
    serviceUrl: "http://notification.internal",
    apiKey: secret,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ scheduled: true, jobId: "job-1" }), {
        status: 202,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.equal(result.jobId, "job-1");
  assert.equal(captured.url, "http://notification.internal/v1/notifications");
  assert.deepEqual(JSON.parse(captured.options.body), payload);
  assert.ok(verifyServiceRequest({
    headers: captured.options.headers,
    secret,
    allowedCallers: ["campus-service"],
    method: "POST",
    pathname: "/v1/notifications",
    body: captured.options.body
  }));
});

test("course reminders with verified App and WeCom recipients use the canonical payload", () => {
  const build = notificationClient.buildCourseReminderDelivery;
  assert.equal(typeof build, "function");
  const delivery = build?.({
    user_id: "campus-user",
    app_recipient_id: "platform-user",
    recipient_id: "student-1",
    lead_minutes: 15
  }, {
    id: "course-occurrence-1",
    courseName: "数据结构",
    location: "综合楼 101",
    startAt: new Date("2026-08-18T02:00:00.000Z")
  }, new Date("2026-08-18T00:00:00.000Z"));

  assert.deepEqual(delivery, {
    kind: "canonical",
    payload: {
      idempotencyKey: "campus-course-7d7299d519414708db6080a4835a3668ef15fb3f67e1bad6",
      audience: { users: ["platform-user"] },
      channels: ["app", "wecom"],
      priority: "normal",
      category: "campus.course.reminder",
      content: {
        kind: "text",
        title: "课程即将开始",
        summary: "数据结构将在 15 分钟后开始",
        blocks: [{
          type: "keyValue",
          items: [
            { key: "时间", value: "08/18周二 10:00" },
            { key: "地点", value: "综合楼 101" }
          ]
        }]
      },
      source: { service: "campus-service", entityType: "course", entityId: "course-occurrence-1" },
      actions: [{ id: "open-today", label: "查看今日", deepLink: "mycontrol://open?destination=today" }],
      wecom: { touser: "student-1" },
      scheduledAt: "2026-08-18T01:45:00.000Z",
      dedupeKey: "campus-course-7d7299d519414708db6080a4835a3668ef15fb3f67e1bad6",
      dedupeWindowSeconds: 86400,
      maxAttempts: 4
    }
  });
});

test("course reminders without a WeCom recipient remain App-only", () => {
  const build = notificationClient.buildCourseReminderDelivery;
  assert.equal(typeof build, "function");
  const delivery = build?.({
    user_id: "campus-user",
    app_recipient_id: "platform-user",
    recipient_id: "",
    lead_minutes: 15
  }, {
    id: "course-occurrence-1",
    courseName: "数据结构",
    location: "",
    startAt: new Date("2026-08-18T02:00:00.000Z")
  }, new Date("2026-08-18T00:00:00.000Z"));

  assert.equal(delivery.kind, "canonical");
  assert.deepEqual(delivery.payload.channels, ["app"]);
  assert.equal("wecom" in delivery.payload, false);
  assert.deepEqual(delivery.payload.content.blocks[0].items, [
    { key: "时间", value: "08/18周二 10:00" }
  ]);
});

test("course reminders without a verified App recipient retain the legacy WeCom payload", () => {
  const build = notificationClient.buildCourseReminderDelivery;
  assert.equal(typeof build, "function");
  const delivery = build?.({
    user_id: "campus-user",
    app_recipient_id: "",
    recipient_id: "student-1",
    lead_minutes: 15
  }, {
    id: "course-occurrence-1",
    courseName: "数据结构",
    location: "综合楼 101",
    startAt: new Date("2026-08-18T02:00:00.000Z")
  }, new Date("2026-08-18T00:00:00.000Z"));

  assert.deepEqual(delivery, {
    kind: "legacy",
    payload: {
      msgType: "text",
      content: "【课程提醒】\n数据结构 将在 15 分钟后开始\n时间：08/18周二 10:00\n地点：综合楼 101",
      target: { touser: "student-1" },
      scheduledAt: "2026-08-18T01:45:00.000Z",
      dedupeKey: "campus-course-7d7299d519414708db6080a4835a3668ef15fb3f67e1bad6",
      dedupeWindowSeconds: 86400,
      maxAttempts: 4
    }
  });
});
