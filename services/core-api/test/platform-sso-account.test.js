const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlatformSsoUser } = require('../services/platformSsoAccountService');

function createUserModel(initial = []) {
    const users = initial.map((user) => ({ ...user }));
    return {
        users,
        findOne({ userId }) {
            return { lean: async () => users.find((user) => user.userId === userId) || null };
        },
        async countDocuments() {
            return users.filter((user) => ['admin', 'super_admin'].includes(user.role)).length;
        },
        async create(user) {
            users.push({ ...user });
            return user;
        },
    };
}

test('core creates an SSO-only super admin when the database has no admin', async () => {
    const UserModel = createUserModel();
    const user = await resolvePlatformSsoUser({
        mappedUserId: 'admin',
        UserModel,
        hashPassword: async () => 'random-password-hash',
        randomPassword: () => 'random-password',
    });

    assert.equal(user.userId, 'admin');
    assert.equal(user.role, 'super_admin');
    assert.equal(user.status, 'active');
    assert.equal(UserModel.users[0].password, 'random-password-hash');
});

test('core reuses a mapped legacy admin without a stored status', async () => {
    const legacyAdmin = { _id: 'legacy-admin', userId: 'admin', role: 'super_admin' };
    const UserModel = createUserModel([legacyAdmin]);

    const user = await resolvePlatformSsoUser({ mappedUserId: 'admin', UserModel });

    assert.equal(user._id, 'legacy-admin');
    assert.equal(UserModel.users.length, 1);
});

test('core does not create an account when another admin already exists', async () => {
    const UserModel = createUserModel([{ _id: 'owner', userId: 'owner', role: 'admin', status: 'active' }]);

    const user = await resolvePlatformSsoUser({ mappedUserId: 'admin', UserModel });

    assert.equal(user, null);
    assert.equal(UserModel.users.length, 1);
});

test('core never promotes a regular user that has the mapped user ID', async () => {
    const UserModel = createUserModel([{ _id: 'member', userId: 'admin', role: 'user', status: 'active' }]);

    const user = await resolvePlatformSsoUser({ mappedUserId: 'admin', UserModel });

    assert.equal(user, null);
    assert.equal(UserModel.users[0].role, 'user');
});
