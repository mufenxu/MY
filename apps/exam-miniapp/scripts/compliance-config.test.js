const assert = require('node:assert/strict');
const test = require('node:test');
const { checkEnvironment, getComplianceErrors } = require('./check-compliance-config');

test('trial and release placeholders block distribution', () => {
    assert.ok(checkEnvironment('trial').length > 0);
    assert.ok(checkEnvironment('release').length > 0);
});

test('realistic compliance values pass validation', () => {
    assert.deepEqual(getComplianceErrors({
        companyName: '示例科技有限公司',
        supportEmail: 'support@valid-company.test',
    }), []);
});
