import test from "node:test";
import assert from "node:assert/strict";
import { createStaticAssetHandler } from "../src/lib/static-assets.js";

function createResponse() {
  const response = { status: 0, headers: {}, body: null };
  response.writeHead = (status, headers = {}) => {
    response.status = status;
    for (const [name, value] of Object.entries(headers)) response.headers[name.toLowerCase()] = value;
    return response;
  };
  response.setHeader = (name, value) => { response.headers[name.toLowerCase()] = value; };
  response.end = (body) => { response.body = body ?? null; };
  return response;
}

async function request(path) {
  const serveStatic = createStaticAssetHandler({
    publicDir: "public",
    securityHeaders: () => ({}),
    json: (res, status, payload) => { res.writeHead(status, {}); res.end(JSON.stringify(payload)); }
  });
  const res = createResponse();
  const url = new URL(path, "http://campus.test");
  await serveStatic({ method: "GET", headers: {} }, res, url);
  return res;
}

test("the HTML shell is never cached as immutable, even with a version query", async () => {
  const page = await request("/index.html?v=anything");
  assert.equal(page.status, 200);
  assert.equal(page.headers["cache-control"], "no-cache");

  // 深链回退到 index.html 时同理
  const fallback = await request("/some/deep/link?v=1");
  assert.equal(fallback.headers["cache-control"], "no-cache");
});

test("versioned assets keep the year-long immutable cache", async () => {
  const versioned = await request("/formatters.js?v=1");
  assert.match(versioned.headers["cache-control"], /max-age=31536000, immutable/);

  const unversioned = await request("/formatters.js");
  assert.equal(unversioned.headers["cache-control"], "public, max-age=3600");
});
