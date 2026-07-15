import test from "node:test";
import assert from "node:assert/strict";
import {
  ROUTINE_REQUEST_SLOW_MS,
  shouldLogClientError,
  shouldLogRequestCompleted
} from "../src/lib/request-logging.js";

test("routine successful polling requests stay out of the access log", () => {
  for (const path of [
    "/api/ready",
    "/api/health",
    "/api/app-auth/status",
    "/api/identity-card/code",
    "/api/academic/evaluations/auto"
  ]) {
    assert.equal(shouldLogRequestCompleted({ path, status: 200, durationMs: 900 }), false);
  }
});

test("routine requests are logged when they fail or become slow", () => {
  assert.equal(shouldLogRequestCompleted({
    path: "/api/identity-card/code",
    status: 500,
    durationMs: 900
  }), true);
  assert.equal(shouldLogRequestCompleted({
    path: "/api/identity-card/code",
    status: 200,
    durationMs: ROUTINE_REQUEST_SLOW_MS
  }), true);
});

test("normal API requests remain in the access log", () => {
  assert.equal(shouldLogRequestCompleted({
    path: "/api/campus/summary",
    status: 200,
    durationMs: 300
  }), true);
});

test("routine client disconnects stay quiet while protocol errors are logged", () => {
  assert.equal(shouldLogClientError({ code: "ECONNRESET" }), false);
  assert.equal(shouldLogClientError({ code: "EPIPE" }), false);
  assert.equal(shouldLogClientError({ code: "HPE_INVALID_METHOD" }), true);
  assert.equal(shouldLogClientError(new Error("unexpected parser failure")), true);
});
