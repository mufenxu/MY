import test from "node:test";
import assert from "node:assert/strict";
import { FixedWindowAttemptLimiter } from "../src/lib/rate-limiter.js";

test("attempt limiter blocks at the configured limit and resets after the window", () => {
  const limiter = new FixedWindowAttemptLimiter({ limit: 2, windowMs: 1_000, maxEntries: 100 });
  assert.equal(limiter.check("client", 100).allowed, true);
  limiter.recordFailure("client", 100);
  assert.equal(limiter.check("client", 100).allowed, true);
  limiter.recordFailure("client", 101);
  assert.equal(limiter.check("client", 101).allowed, false);
  assert.equal(limiter.check("client", 1_101).allowed, true);
});

test("attempt limiter has a hard memory bound", () => {
  const limiter = new FixedWindowAttemptLimiter({ limit: 2, windowMs: 60_000, maxEntries: 100 });
  for (let index = 0; index < 500; index += 1) limiter.recordFailure(`client-${index}`, index);
  assert.ok(limiter.size <= 100);
});
