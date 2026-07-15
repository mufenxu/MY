import test from "node:test";
import assert from "node:assert/strict";
import { KeyedSerialQueue } from "../src/lib/keyed-serial-queue.js";

test("keyed queue serializes one user while allowing different users to proceed", async () => {
  const queue = new KeyedSerialQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = queue.run("user-a", async () => {
    events.push("a1:start");
    await firstGate;
    events.push("a1:end");
  });
  const second = queue.run("user-a", async () => events.push("a2"));
  const otherUser = queue.run("user-b", async () => events.push("b1"));

  await otherUser;
  assert.deepEqual(events, ["a1:start", "b1"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["a1:start", "b1", "a1:end", "a2"]);
  assert.equal(queue.size, 0);
});

test("keyed queue continues and cleans up after a failed operation", async () => {
  const queue = new KeyedSerialQueue();
  await assert.rejects(queue.run("user-a", async () => { throw new Error("failed"); }), /failed/);
  assert.equal(await queue.run("user-a", async () => "recovered"), "recovered");
  assert.equal(queue.size, 0);
});
