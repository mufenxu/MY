import test from "node:test";
import assert from "node:assert/strict";
import { invalidateRequestMemo, requestMemo, setRequestMemo } from "../src/lib/request-memo.js";

test("request memo coalesces concurrent loads and returns isolated clones", async () => {
  const context = {};
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { nested: { value: 1 } };
  };
  const clone = structuredClone;
  const [first, second] = await Promise.all([
    requestMemo(context, "session:user-1", loader, { clone }),
    requestMemo(context, "session:user-1", loader, { clone })
  ]);

  assert.equal(loads, 1);
  first.nested.value = 2;
  assert.equal(second.nested.value, 1);

  setRequestMemo(context, "session:user-1", { nested: { value: 3 } });
  assert.equal((await requestMemo(context, "session:user-1", loader, { clone })).nested.value, 3);
  invalidateRequestMemo(context, "session:");
  assert.equal((await requestMemo(context, "session:user-1", loader, { clone })).nested.value, 1);
  assert.equal(loads, 2);
});

test("request memo does not retain rejected loads", async () => {
  const context = {};
  let attempts = 0;
  const loader = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary");
    return "ok";
  };

  await assert.rejects(requestMemo(context, "retry", loader), /temporary/);
  assert.equal(await requestMemo(context, "retry", loader), "ok");
  assert.equal(attempts, 2);
});
