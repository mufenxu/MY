import test from "node:test";
import assert from "node:assert/strict";
import {
  discardUpstreamResponse,
  releaseUpstreamResponse,
  trackUpstreamResponse
} from "../src/lib/upstream-response.js";

test("upstream response capacity is released exactly once", () => {
  const response = {};
  let releases = 0;
  trackUpstreamResponse(response, () => { releases += 1; });

  releaseUpstreamResponse(response);
  releaseUpstreamResponse(response);

  assert.equal(releases, 1);
});

test("discarding a redirect body also releases its capacity", async () => {
  let cancelled = 0;
  let releases = 0;
  const response = {
    body: {
      cancel: async () => { cancelled += 1; }
    }
  };
  trackUpstreamResponse(response, () => { releases += 1; });

  await discardUpstreamResponse(response);

  assert.equal(cancelled, 1);
  assert.equal(releases, 1);
});
