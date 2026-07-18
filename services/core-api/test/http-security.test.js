const test = require('node:test');
const assert = require('node:assert/strict');

const {
    contentSecurityPolicyDirectives,
    sanitizeRequestUrl
} = require('../utils/httpSecurity');

test('request logging redacts scan codes and other query-string secrets', () => {
    const result = sanitizeRequestUrl({
        originalUrl: '/api/auth/qrcode/status?qrToken=secret-scan-token&page=2&code=one-time-code'
    });

    assert.match(result, /^\/api\/auth\/qrcode\/status\?/);
    assert.match(result, /page=2/);
    assert.doesNotMatch(result, /secret-scan-token|one-time-code/);
    assert.match(result, /REDACTED/);
});

test('CSP permits external application scripts without inline script execution', () => {
    assert.equal(contentSecurityPolicyDirectives['script-src'].includes("'unsafe-inline'"), false);
    assert.deepEqual(contentSecurityPolicyDirectives['script-src-attr'], ["'none'"]);
    assert.ok(contentSecurityPolicyDirectives['script-src'].includes("'self'"));
    assert.equal(contentSecurityPolicyDirectives['script-src'].includes('https://cdnjs.cloudflare.com'), false);
    assert.equal(contentSecurityPolicyDirectives['connect-src'].some(origin => origin.startsWith('http://')), false);
    assert.deepEqual(contentSecurityPolicyDirectives['object-src'], ["'none'"]);
    assert.deepEqual(contentSecurityPolicyDirectives['frame-ancestors'], ["'none'"]);
});
