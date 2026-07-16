const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlatformSsoAdmin } = require('../src/services/platformSsoAccountService');

function createAdminModel(initial = []) {
    const admins = initial.map((admin) => ({ ...admin }));
    return {
        admins,
        findOne({ username }) {
            return { lean: async () => admins.find((admin) => admin.username === username) || null };
        },
        async countDocuments() {
            return admins.length;
        },
        async create(admin) {
            const created = { _id: `admin-${admins.length + 1}`, tokenVersion: 0, ...admin };
            admins.push(created);
            return created;
        },
    };
}

test('exam creates an SSO-only admin when the database has no admin', async () => {
    const AdminModel = createAdminModel();
    const admin = await resolvePlatformSsoAdmin({
        mappedUsername: 'admin',
        AdminModel,
        hashPassword: async () => 'random-password-hash',
        randomPassword: () => 'random-password',
    });

    assert.equal(admin.username, 'admin');
    assert.equal(AdminModel.admins[0].password, 'random-password-hash');
});

test('exam reuses the configured administrator', async () => {
    const AdminModel = createAdminModel([{ _id: 'existing', username: 'operator' }]);

    const admin = await resolvePlatformSsoAdmin({ mappedUsername: 'operator', AdminModel });

    assert.equal(admin._id, 'existing');
    assert.equal(AdminModel.admins.length, 1);
});

test('exam does not create an account when another admin already exists', async () => {
    const AdminModel = createAdminModel([{ _id: 'existing', username: 'operator' }]);

    const admin = await resolvePlatformSsoAdmin({ mappedUsername: 'admin', AdminModel });

    assert.equal(admin, null);
    assert.equal(AdminModel.admins.length, 1);
});
