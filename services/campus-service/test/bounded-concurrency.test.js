import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../src/lib/bounded-concurrency.js";

test("bounded concurrency preserves result order and caps active work", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([5, 4, 3, 2, 1], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, value));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(results, [10, 8, 6, 4, 2]);
  assert.equal(peak, 2);
});
