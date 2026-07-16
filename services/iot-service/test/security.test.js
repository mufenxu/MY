const assert = require('node:assert/strict');
const test = require('node:test');
const { createApiDocsMarkdown } = require('../src/http/routes/apiDocs');
const {
  isAllowedRealtimeOrigin,
  setSecurityHeaders
} = require('../src/http/middleware/security');

function proxiedRequest(origin) {
  return {
    app: { get: () => 1 },
    headers: {
      host: 'iot-service:22102',
      origin,
      'x-forwarded-host': 'admin.example.com',
      'x-forwarded-proto': 'https'
    },
    protocol: 'http',
    socket: { encrypted: false }
  };
}

test('realtime sessions require the exact browser origin', () => {
  assert.equal(isAllowedRealtimeOrigin(proxiedRequest('https://admin.example.com')), true);
  assert.equal(isAllowedRealtimeOrigin(proxiedRequest('https://evil.example.com')), false);
  assert.equal(isAllowedRealtimeOrigin(proxiedRequest(undefined)), false);
});

test('IoT responses disallow inline scripts and canonical docs use the unified API path', () => {
  const headers = new Map();
  setSecurityHeaders({}, { setHeader: (name, value) => headers.set(name, value) }, () => {});
  const csp = headers.get('Content-Security-Policy');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);

  const markdown = createApiDocsMarkdown('https://admin.example.com/api/iot');
  assert.match(markdown, /https:\/\/admin\.example\.com\/api\/iot\/devices/);
  assert.match(markdown, /Path.*`\/api\/iot\/devices`/);
});
