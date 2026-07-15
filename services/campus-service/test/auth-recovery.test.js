import test from "node:test";
import assert from "node:assert/strict";
import { runWithAuthRecovery } from "../src/lib/auth-recovery.js";

test("auth recovery retries until a bounded recovery succeeds", async () => {
  let calls = 0;
  let recoveries = 0;
  const result = await runWithAuthRecovery(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("expired"), { status: 401 });
    return "ok";
  }, {
    isAuthError: (error) => error.status === 401,
    recover: async () => { recoveries += 1; },
    maxRecoveries: 2
  });

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.equal(recoveries, 2);
});

test("auth recovery does not retry unrelated failures", async () => {
  let recoveries = 0;
  await assert.rejects(
    runWithAuthRecovery(async () => {
      throw Object.assign(new Error("upstream unavailable"), { status: 502 });
    }, {
      isAuthError: (error) => error.status === 401,
      recover: async () => { recoveries += 1; },
      maxRecoveries: 2
    }),
    /upstream unavailable/
  );
  assert.equal(recoveries, 0);
});

test("auth recovery stops after the configured limit", async () => {
  let calls = 0;
  let recoveries = 0;
  await assert.rejects(
    runWithAuthRecovery(async () => {
      calls += 1;
      throw Object.assign(new Error("still expired"), { status: 401 });
    }, {
      isAuthError: (error) => error.status === 401,
      recover: async () => { recoveries += 1; },
      maxRecoveries: 2
    }),
    /still expired/
  );
  assert.equal(calls, 3);
  assert.equal(recoveries, 2);
});
