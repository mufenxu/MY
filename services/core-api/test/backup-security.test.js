const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareRestoredUsers } = require('../utils/backupSecurity');

test('restored users retain an active super admin and invalidate old token versions', () => {
    const restored = prepareRestoredUsers([
        { _id: 'root', role: 'super_admin', status: 'active', tokenVersion: 2 },
        { _id: 'user', role: 'user', status: 'active', tokenVersion: 8 }
    ], new Map([
        ['root', 7],
        ['user', 3]
    ]));

    assert.equal(restored[0].tokenVersion, 8);
    assert.equal(restored[1].tokenVersion, 9);
});

test('restore rejects user collections without an active super admin', () => {
    assert.throws(
        () => prepareRestoredUsers([
            { _id: 'root', role: 'super_admin', status: 'disabled', tokenVersion: 1 },
            { _id: 'admin', role: 'admin', status: 'active', tokenVersion: 1 }
        ]),
        (error) => error.statusCode === 400 && /active super_admin/.test(error.message)
    );
});
