const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'core-auth-test-secret';

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const authService = require('../services/authService');
const auth = require('../middleware/auth');

function userQuery(user) {
    return {
        select() { return this; },
        async lean() { return user; }
    };
}

function invokeAuth(token) {
    return new Promise((resolve) => {
        const req = {
            headers: {},
            header(name) {
                return name === 'Authorization' ? `Bearer ${token}` : undefined;
            }
        };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ req, res: this, body }); }
        };
        auth.verifyToken(req, res, (error) => resolve({ req, res, error }));
    });
}

test('legacy version-0 JWT uses current database role and is revoked after version increment', async () => {
    const originalFindById = User.findById;
    const legacyToken = jwt.sign(
        { id: 'user-1', role: 'user' },
        process.env.CORE_JWT_SECRET,
        { expiresIn: '5m', issuer: 'miniprogram-admin', audience: 'miniprogram-api' }
    );

    try {
        User.findById = () => userQuery({
            _id: 'user-1',
            role: 'admin',
            permissions: ['view_ct8'],
            status: 'active',
            tokenVersion: 0
        });
        const accepted = await invokeAuth(legacyToken);
        assert.equal(accepted.error, undefined);
        assert.equal(accepted.req.user.role, 'admin');

        User.findById = () => userQuery({
            _id: 'user-1',
            role: 'admin',
            permissions: [],
            status: 'active',
            tokenVersion: 1
        });
        const revoked = await invokeAuth(legacyToken);
        assert.equal(revoked.res.statusCode, 401);
        assert.equal(revoked.body.code, 'AUTH_TOKEN_REVOKED');
    } finally {
        User.findById = originalFindById;
    }
});

test('disabled account is rejected even when JWT is otherwise valid', async () => {
    const originalFindById = User.findById;
    const token = authService.generateToken({ _id: 'user-2', role: 'admin', tokenVersion: 0 });
    User.findById = () => userQuery({
        _id: 'user-2',
        role: 'admin',
        permissions: [],
        status: 'disabled',
        tokenVersion: 0
    });

    try {
        const result = await invokeAuth(token);
        assert.equal(result.res.statusCode, 403);
        assert.equal(result.body.code, 'AUTH_ACCOUNT_DISABLED');
    } finally {
        User.findById = originalFindById;
    }
});

test('refresh tokens are hashed at rest and legacy tokens are atomically consumed', async () => {
    const originalCreate = RefreshToken.create;
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const originalFindById = User.findById;
    const created = [];
    let consumeFilter;

    RefreshToken.create = async (doc) => {
        created.push(doc);
        return doc;
    };
    RefreshToken.findOneAndUpdate = async (filter) => {
        consumeFilter = filter;
        return {
            userId: 'user-3',
            familyId: 'legacy-family',
            expiresAt: new Date(Date.now() + 60_000)
        };
    };
    User.findById = async () => ({
        _id: 'user-3',
        role: 'user',
        status: 'active',
        tokenVersion: 0
    });

    try {
        const raw = await authService.generateRefreshToken('user-3');
        assert.notEqual(created[0].token, raw);
        assert.equal(created[0].token, authService.hashRefreshToken(raw));
        assert.equal(created[0].tokenVersion, 0);
        assert.ok(created[0].familyId);

        const refreshed = await authService.refreshAccessToken('legacy-plaintext-token');
        assert.ok(refreshed.refreshToken);
        assert.deepEqual(consumeFilter.token.$in, [
            authService.hashRefreshToken('legacy-plaintext-token'),
            'legacy-plaintext-token'
        ]);
        assert.ok(consumeFilter.expiresAt.$gt instanceof Date);
    } finally {
        RefreshToken.create = originalCreate;
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        User.findById = originalFindById;
    }
});

test('refresh token version binding survives deletion failures during password changes', async () => {
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const originalDeleteMany = RefreshToken.deleteMany;
    const originalFindById = User.findById;
    let revokedUser;
    RefreshToken.findOneAndUpdate = async () => ({
        userId: 'user-4',
        tokenVersion: 0,
        expiresAt: new Date(Date.now() + 60_000)
    });
    RefreshToken.deleteMany = async (filter) => { revokedUser = filter; };
    User.findById = async () => ({
        _id: 'user-4',
        role: 'admin',
        status: 'active',
        tokenVersion: 1
    });

    try {
        await assert.rejects(
            authService.refreshAccessToken('old-token-after-password-change'),
            (error) => {
                assert.equal(error.statusCode, 401);
                assert.equal(error.code, 'AUTH_REFRESH_TOKEN_REVOKED');
                return true;
            }
        );
        assert.deepEqual(revokedUser, { userId: 'user-4' });
    } finally {
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        RefreshToken.deleteMany = originalDeleteMany;
        User.findById = originalFindById;
    }
});

test('refresh token reuse revokes the family and invalidates issued access tokens', async () => {
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const originalFindOne = RefreshToken.findOne;
    const originalDeleteMany = RefreshToken.deleteMany;
    const originalUserUpdateOne = User.updateOne;
    let revokedFilter;
    let versionUpdate;

    RefreshToken.findOneAndUpdate = async () => null;
    RefreshToken.findOne = async () => ({
        userId: 'user-compromised',
        familyId: 'family-1',
        status: 'used',
        expiresAt: new Date(Date.now() + 60_000)
    });
    RefreshToken.deleteMany = async (filter) => { revokedFilter = filter; };
    User.updateOne = async (filter, update) => { versionUpdate = { filter, update }; };

    try {
        await assert.rejects(
            authService.refreshAccessToken('already-used-token'),
            (error) => {
                assert.equal(error.statusCode, 401);
                assert.equal(error.code, 'AUTH_REFRESH_TOKEN_REUSED');
                return true;
            }
        );
        assert.deepEqual(versionUpdate, {
            filter: { _id: 'user-compromised' },
            update: { $inc: { tokenVersion: 1 } }
        });
        assert.deepEqual(revokedFilter, { userId: 'user-compromised' });
    } finally {
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        RefreshToken.findOne = originalFindOne;
        RefreshToken.deleteMany = originalDeleteMany;
        User.updateOne = originalUserUpdateOne;
    }
});
