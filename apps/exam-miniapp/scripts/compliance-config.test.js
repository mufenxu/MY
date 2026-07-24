const assert = require('node:assert/strict');
const test = require('node:test');
const { checkEnvironment, getComplianceErrors } = require('./check-compliance-config');

test('trial and release compliance config passes distribution checks', () => {
    assert.deepEqual(checkEnvironment('trial'), []);
    assert.deepEqual(checkEnvironment('release'), []);
});

test('placeholder compliance values block distribution', () => {
    assert.ok(getComplianceErrors({
        companyName: '__REQUIRED_COMPANY_NAME__',
        supportEmail: '__REQUIRED_SUPPORT_EMAIL__',
    }).length > 0);
});

test('realistic compliance values pass validation', () => {
    assert.deepEqual(getComplianceErrors({
        companyName: '示例科技有限公司',
        supportEmail: 'support@valid-company.test',
    }), []);
});
