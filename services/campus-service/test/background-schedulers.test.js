import test from "node:test";
import assert from "node:assert/strict";
import { groupAutoReservationTasksByUser } from "../src/services/background-schedulers.js";

test("groups auto-reservation tasks by user while preserving scheduler order", () => {
  const tasks = [
    { id: "task-1", user_id: "user-1" },
    { id: "task-2", user_id: "user-2" },
    { id: "task-3", user_id: "user-1" },
    { id: "task-4", user_id: "user-3" }
  ];

  assert.deepEqual(groupAutoReservationTasksByUser(tasks), [
    ["user-1", [tasks[0], tasks[2]]],
    ["user-2", [tasks[1]]],
    ["user-3", [tasks[3]]]
  ]);
});
