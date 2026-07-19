const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyPlatformSso } = require('../middleware/platformSso');

function issue(claims, privateKey) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
}

test('core accepts only valid audience-bound platform identities', () => {
    const previous = process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    const base = {
        v: 1,
        iss: 'my-platform-gateway',
        aud: 'core',
        sub: 'admin',
        role: 'viewer',
        csrf: 'csrf-token',
        m: 'GET',
        p: '/api/users/me',
        session_exp: Math.floor(now / 1000) + 3600,
        reauth_exp: 0,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 30,
    };

    try {
        const req = { method: 'GET', url: '/api/users/me', headers: { 'x-my-platform-sso': issue(base, privateKey) } };
        assert.equal(verifyPlatformSso(req, 'core', now).sub, 'admin');
        assert.equal(verifyPlatformSso({ ...req, headers: { 'x-my-platform-sso': issue({ ...base, aud: 'exam' }, privateKey) } }, 'core', now), null);
        assert.equal(verifyPlatformSso({ ...req, headers: { 'x-my-platform-sso': `${issue(base, privateKey)}x` } }, 'core', now), null);
        assert.equal(verifyPlatformSso({ ...req, method: 'POST' }, 'core', now), null);
    } finally {
        if (previous === undefined) delete process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
        else process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = previous;
    }
});
