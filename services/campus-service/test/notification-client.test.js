import test from "node:test";
import assert from "node:assert/strict";
import { verifyServiceRequest } from "@my-platform/platform-auth";
import { enqueueCampusNotification } from "../src/lib/notification-client.js";

test("campus notification enqueue signs the exact request body", async () => {
  const secret = "test-notification-secret-with-enough-entropy";
  let captured = null;
  const payload = {
    msgType: "markdown",
    content: "### 课程提醒",
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
