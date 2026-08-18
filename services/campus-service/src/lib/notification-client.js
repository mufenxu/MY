import { createHash, randomUUID } from "node:crypto";
import { issueServiceRequest } from "@my-platform/platform-auth";

function formatCourseReminderTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function buildCourseReminderDelivery(preference, occurrence, now) {
  const leadMinutes = Number(preference.lead_minutes || 15);
  const scheduledAt = new Date(Math.max(now.getTime(), occurrence.startAt.getTime() - leadMinutes * 60_000));
  const reminderTime = formatCourseReminderTime(occurrence.startAt);
  const location = String(occurrence.location || "");
  const identity = createHash("sha256")
    .update(`${preference.user_id}|${occurrence.id}|${occurrence.startAt.toISOString()}`)
    .digest("hex")
    .slice(0, 48);
  const dedupeKey = `campus-course-${identity}`;
  const appRecipientId = String(preference.app_recipient_id || "");
  const wecomRecipientId = String(preference.recipient_id || "");

  if (!appRecipientId) {
    const locationLine = location ? `\n地点：${location}` : "";
    return {
      kind: "legacy",
      payload: {
        msgType: "text",
        content: `【课程提醒】\n${occurrence.courseName} 将在 ${leadMinutes} 分钟后开始\n时间：${reminderTime}${locationLine}`,
        target: { touser: wecomRecipientId },
        scheduledAt: scheduledAt.toISOString(),
        dedupeKey,
        dedupeWindowSeconds: 86400,
        maxAttempts: 4
      }
    };
  }

  const items = [{ key: "时间", value: reminderTime }];
  if (location) items.push({ key: "地点", value: location });
  return {
    kind: "canonical",
    payload: {
      idempotencyKey: dedupeKey,
      audience: { users: [appRecipientId] },
      channels: wecomRecipientId ? ["app", "wecom"] : ["app"],
      priority: "normal",
      category: "campus.course.reminder",
      content: {
        kind: "text",
        title: "课程即将开始",
        summary: `${occurrence.courseName}将在 ${leadMinutes} 分钟后开始`,
        blocks: [{ type: "keyValue", items }]
      },
      source: { service: "campus-service", entityType: "course", entityId: occurrence.id },
      actions: [{ id: "open-today", label: "查看今日", deepLink: "mycontrol://open?destination=today" }],
      ...(wecomRecipientId ? { wecom: { touser: wecomRecipientId } } : {}),
      scheduledAt: scheduledAt.toISOString(),
      dedupeKey,
      dedupeWindowSeconds: 86400,
      maxAttempts: 4
    }
  };
}

async function postCampusNotification(pathname, payload, {
  serviceUrl = process.env.NOTIFICATION_SERVICE_URL,
  apiKey = process.env.CAMPUS_NOTIFICATION_API_KEY || process.env.NOTIFY_API_KEY,
  requestId = randomUUID(),
  fetchImpl = fetch,
  timeoutMs = 8_000
} = {}) {
  const origin = String(serviceUrl || "").replace(/\/+$/, "");
  const secret = String(apiKey || "").trim();
  if (!origin || !secret) throw new Error("Campus notification delivery is not configured.");

  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${origin}${pathname}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-request-id": requestId,
        ...issueServiceRequest({
          caller: "campus-service",
          secret,
          method: "POST",
          pathname,
          body
        })
      },
      body,
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || result.message || `Notification service returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export function enqueueCampusNotification(payload, options = {}) {
  return postCampusNotification("/enqueue", payload, options);
}

export function sendCampusNotification(payload, options = {}) {
  return postCampusNotification("/v1/notifications", payload, options);
}
