const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'core-security-test-secret';

const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const AuditLog = require('../models/AuditLog');
const userController = require('../controllers/userController');

function invoke(handler, req) {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(body) {
                resolve({ res: this, body });
            }
        };
        handler(req, res, (error) => resolve({ res, error }));
    });
}

test('admin cannot assign roles or permissions', async () => {
    const originalFindById = User.findById;
    let queried = false;
    User.findById = async () => {
        queried = true;
        return null;
    };

    try {
        for (const body of [
            { role: 'super_admin' },
            { permissions: ['manage_ct8'] }
        ]) {
            const { res, error } = await invoke(userController.updateUser, {
                user: { _id: 'admin-1', role: 'admin' },
                params: { id: 'admin-1' },
                body
            });
            assert.equal(res.statusCode, 403);
            assert.match(error.message, /Only super_admin/);
        }
        assert.equal(queried, false, 'forbidden privilege fields must be rejected before loading the target');
    } finally {
        User.findById = originalFindById;
    }
});

test('last active super_admin cannot be downgraded or disabled', async () => {
    const originalFindById = User.findById;
    const originalCountDocuments = User.countDocuments;
    User.findById = async () => ({
        _id: 'root-1',
        userId: '10001',
        role: 'super_admin',
        status: 'active',
        permissions: []
    });
    User.countDocuments = async () => 0;

    try {
        for (const body of [{ role: 'admin' }, { status: 'disabled' }]) {
            const { error } = await invoke(userController.updateUser, {
                user: { _id: 'root-1', role: 'super_admin' },
                params: { id: 'root-1' },
                body
            });
            assert.equal(error.statusCode, 409);
            assert.match(error.message, /last active super_admin/);
        }
    } finally {
        User.findById = originalFindById;
        User.countDocuments = originalCountDocuments;
    }
});

test('last active super_admin cannot be deleted', async () => {
    const originalFindById = User.findById;
    const originalCountDocuments = User.countDocuments;
    User.findById = async () => ({
        _id: 'root-2',
        userId: '10002',
        nickName: 'Root',
        role: 'super_admin',
        status: 'active'
    });
    User.countDocuments = async () => 0;

    try {
        const { error } = await invoke(userController.deleteUser, {
            user: { _id: 'root-1', role: 'super_admin' },
            params: { id: 'root-2' },
            body: {}
        });
        assert.equal(error.statusCode, 409);
        assert.match(error.message, /last active super_admin/);
    } finally {
        User.findById = originalFindById;
        User.countDocuments = originalCountDocuments;
    }
});

test('role and permission changes increment tokenVersion and revoke refresh tokens', async () => {
    const originalFindById = User.findById;
    const originalFindByIdAndUpdate = User.findByIdAndUpdate;
    const originalDeleteMany = RefreshToken.deleteMany;
    const originalAuditCreate = AuditLog.create;
    let update;
    let revokedFilter;

    User.findById = async () => ({
        _id: 'admin-2',
        userId: '10002',
        role: 'admin',
        status: 'active',
        permissions: []
    });
    User.findByIdAndUpdate = async (_id, value) => {
        update = value;
        return { _id, role: 'admin', permissions: ['manage_ct8'] };
    };
    RefreshToken.deleteMany = async (filter) => { revokedFilter = filter; };
    AuditLog.create = async () => ({});

    try {
        const result = await invoke(userController.updateUser, {
            user: { _id: 'root-1', role: 'super_admin' },
            params: { id: 'admin-2' },
            body: { permissions: ['manage_ct8'] },
            headers: {}
        });
        assert.equal(result.body.success, true);
        assert.deepEqual(update.$inc, { tokenVersion: 1 });
        assert.deepEqual(revokedFilter, { userId: 'admin-2' });
    } finally {
        User.findById = originalFindById;
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
        RefreshToken.deleteMany = originalDeleteMany;
        AuditLog.create = originalAuditCreate;
    }
});
