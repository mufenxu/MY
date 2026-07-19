import test from "node:test";
import assert from "node:assert/strict";
import { createHttpToolkit, sanitizeHostHeader, sanitizePublicHttpsOrigin } from "../src/lib/http.js";

function responseRecorder() {
  return {
    body: undefined,
    headers: undefined,
    status: undefined,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}

test("JSON responses include hardened headers and request correlation", () => {
  const toolkit = createHttpToolkit({ enableHsts: true, getRequestId: () => "request-1" });
  const response = responseRecorder();

  toolkit.json(response, 200, { ok: true });

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-request-id"], "request-1");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-dns-prefetch-control"], "off");
  assert.equal(response.headers["x-permitted-cross-domain-policies"], "none");
  assert.match(response.headers["strict-transport-security"], /max-age=31536000/);
  assert.equal(response.body, JSON.stringify({ ok: true }));
});

test("HTTPS redirects only trust proxy headers when explicitly enabled", () => {
  const request = { headers: { host: "campus.example.edu:22101", "x-forwarded-proto": "http" } };
  const url = new URL("http://localhost/path?value=1");
  const untrustedResponse = responseRecorder();
  const trustedResponse = responseRecorder();

  assert.equal(createHttpToolkit({ enableHttpsRedirect: true }).maybeRedirectHttps(
    request,
    untrustedResponse,
    url
  ), false);
  assert.equal(createHttpToolkit({ enableHttpsRedirect: true, trustProxy: true }).maybeRedirectHttps(
    request,
    trustedResponse,
    url
  ), true);
  assert.equal(trustedResponse.status, 308);
  assert.equal(trustedResponse.headers.location, "https://campus.example.edu:22101/path?value=1");
});

test("HTTPS redirects can use a configured public origin behind local proxies", () => {
  const request = { headers: { host: "127.0.0.1:22101", "x-forwarded-proto": "http" } };
  const url = new URL("http://localhost/path?value=1");
  const response = responseRecorder();

  assert.equal(createHttpToolkit({
    enableHttpsRedirect: true,
    publicOrigin: "https://hgu.pxyb.cn",
    trustProxy: true
  }).maybeRedirectHttps(request, response, url), true);
  assert.equal(response.status, 308);
  assert.equal(response.headers.location, "https://hgu.pxyb.cn/path?value=1");
});

test("host sanitization rejects redirect injection and invalid ports", () => {
  assert.equal(sanitizeHostHeader("example.edu"), "example.edu");
  assert.equal(sanitizeHostHeader("[::1]:22101"), "[::1]:22101");
  assert.equal(sanitizeHostHeader("example.edu:99999"), "");
  assert.equal(sanitizeHostHeader("example.edu/path"), "");
  assert.equal(sanitizeHostHeader("example..edu"), "");
});

test("public HTTPS origin sanitization rejects non-origin values", () => {
  assert.equal(sanitizePublicHttpsOrigin("https://hgu.pxyb.cn"), "https://hgu.pxyb.cn");
  assert.equal(sanitizePublicHttpsOrigin("http://hgu.pxyb.cn"), "");
  assert.equal(sanitizePublicHttpsOrigin("https://hgu.pxyb.cn/app"), "");
  assert.equal(sanitizePublicHttpsOrigin("https://user:pass@example.com"), "");
});
