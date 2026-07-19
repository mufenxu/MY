const test = require('node:test');
const assert = require('node:assert/strict');
const {
    applyEffectiveAccessToProfile,
    intersectPlatformAccess,
    platformRoleAllowsRequest,
} = require('../utils/platformAccess');

test('unified-platform access is the intersection of central and local roles', () => {
    assert.deepEqual(
        intersectPlatformAccess('viewer', { role: 'super_admin', permissions: ['manage_ct8', 'view_audit'] }),
        { role: 'admin', localRole: 'super_admin', centralRole: 'viewer', permissions: ['view_audit'] },
    );
    assert.deepEqual(
        intersectPlatformAccess('operator', { role: 'super_admin', permissions: ['manage_ct8'] }),
        { role: 'admin', localRole: 'super_admin', centralRole: 'operator', permissions: ['manage_ct8'] },
    );
    assert.deepEqual(
        intersectPlatformAccess('super_admin', { role: 'admin', permissions: [] }),
        { role: 'admin', localRole: 'admin', centralRole: 'super_admin', permissions: [] },
    );
    assert.equal(intersectPlatformAccess('platform_admin', { role: 'super_admin' }), null);
});

test('core central viewer is read-only while operator can perform normal mutations', () => {
    assert.equal(platformRoleAllowsRequest('viewer', 'GET'), true);
    assert.equal(platformRoleAllowsRequest('viewer', 'POST'), false);
    assert.equal(platformRoleAllowsRequest('operator', 'POST'), true);
    assert.equal(platformRoleAllowsRequest('super_admin', 'DELETE'), true);
    assert.equal(platformRoleAllowsRequest('platform_admin', 'GET'), false);
});

test('current-user profiles expose effective central access instead of the stored role', () => {
    assert.deepEqual(
        applyEffectiveAccessToProfile(
            { _id: 'root', role: 'super_admin', permissions: ['manage_ct8', 'view_audit'] },
            {
                role: 'admin',
                localRole: 'super_admin',
                centralRole: 'viewer',
                permissions: ['view_audit'],
            },
        ),
        {
            _id: 'root',
            role: 'admin',
            localRole: 'super_admin',
            centralRole: 'viewer',
            permissions: ['view_audit'],
        },
    );
});
