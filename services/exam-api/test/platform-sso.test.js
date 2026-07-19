const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyPlatformSso } = require('../src/middleware/platformSso');
const { platformRoleAllowsRequest } = require('../src/middleware/platformRole');

function issue(claims, privateKey) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
}

test('exam accepts only gateway identities issued for the exam audience', () => {
    const previous = process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    const claims = {
        v: 1,
        iss: 'my-platform-gateway',
        aud: 'exam',
        sub: 'admin',
        role: 'viewer',
        csrf: 'csrf-token',
        m: 'GET',
        p: '/api/admin/me',
        session_exp: Math.floor(now / 1000) + 3600,
        reauth_exp: 0,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 30,
    };

    try {
        const req = { method: 'GET', url: '/api/admin/me', headers: { 'x-my-platform-sso': issue(claims, privateKey) } };
        assert.equal(verifyPlatformSso(req, 'exam', now).sub, 'admin');
        assert.equal(verifyPlatformSso({ ...req, headers: { 'x-my-platform-sso': issue({ ...claims, aud: 'core' }, privateKey) } }, 'exam', now), null);
        assert.equal(verifyPlatformSso({ ...req, url: '/api/admin/stats' }, 'exam', now), null);
    } finally {
        if (previous === undefined) delete process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
        else process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = previous;
    }
});

test('exam central roles enforce read-only viewer and reserve destructive operations', () => {
    assert.equal(platformRoleAllowsRequest('viewer', 'GET', '/api/manage/questions'), true);
    assert.equal(platformRoleAllowsRequest('viewer', 'POST', '/api/manage/questions'), false);
    assert.equal(platformRoleAllowsRequest('operator', 'POST', '/api/manage/questions'), true);
    assert.equal(platformRoleAllowsRequest('operator', 'DELETE', '/api/manage/questions/1'), false);
    assert.equal(platformRoleAllowsRequest('operator', 'POST', '/api/admin/change-password'), false);
    assert.equal(platformRoleAllowsRequest('super_admin', 'DELETE', '/api/manage/users'), true);
});
