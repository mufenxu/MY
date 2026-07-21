import { randomUUID } from "node:crypto";
import { issueServiceRequest } from "@my-platform/platform-auth";

export async function enqueueCampusNotification(payload, {
  serviceUrl = process.env.NOTIFICATION_SERVICE_URL,
  apiKey = process.env.CAMPUS_NOTIFICATION_API_KEY || process.env.NOTIFY_API_KEY,
  requestId = randomUUID(),
  fetchImpl = fetch,
  timeoutMs = 8_000
} = {}) {
  const origin = String(serviceUrl || "").replace(/\/+$/, "");
  const secret = String(apiKey || "").trim();
  if (!origin || !secret) throw new Error("Campus notification delivery is not configured.");

  const pathname = "/enqueue";
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
