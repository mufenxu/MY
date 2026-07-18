const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'settings-security-test-secret';

const NotifyConfig = require('../models/NotifyConfig');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const bcrypt = require('bcryptjs');
const settingsService = require('../services/settingsService');
const { protectBackupDocuments } = require('../controllers/backupController');
const { decrypt, isEncrypted } = require('../utils/crypto');

function leanQuery(value) {
    return { async lean() { return value; } };
}

test('notification settings mask recoverable secrets on reads', async () => {
    const originalFindById = NotifyConfig.findById;
    NotifyConfig.findById = () => leanQuery({
        _id: 'default',
        smtpUser: 'sender@example.test',
        smtpPass: 'smtp-secret',
        qywxApiKey: 'wecom-secret'
    });

    try {
        const result = await settingsService.getNotifyConfig();
        assert.equal(result.smtpPass, '********');
        assert.equal(result.qywxApiKey, '********');
        assert.doesNotMatch(JSON.stringify(result), /smtp-secret|wecom-secret/);
    } finally {
        NotifyConfig.findById = originalFindById;
    }
});

test('saving a masked notification form preserves stored secrets and masks the response', async () => {
    const originalFindById = NotifyConfig.findById;
    const originalFindByIdAndUpdate = NotifyConfig.findByIdAndUpdate;
    let persisted;
    NotifyConfig.findById = () => leanQuery({
        _id: 'default',
        smtpPass: 'smtp-secret',
        qywxApiKey: 'wecom-secret'
    });
    NotifyConfig.findByIdAndUpdate = async (_id, update) => {
        persisted = update.$set;
        return { toObject: () => ({ _id: 'default', ...persisted }) };
    };

    try {
        const result = await settingsService.saveNotifyConfig({
            emailEnabled: true,
            smtpPass: '********',
            qywxApiKey: '********'
        });
        assert.equal(isEncrypted(persisted.smtpPass), true);
        assert.equal(isEncrypted(persisted.qywxApiKey), true);
        assert.equal(decrypt(persisted.smtpPass), 'smtp-secret');
        assert.equal(decrypt(persisted.qywxApiKey), 'wecom-secret');
        assert.equal(result.smtpPass, '********');
        assert.equal(result.qywxApiKey, '********');
    } finally {
        NotifyConfig.findById = originalFindById;
        NotifyConfig.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
});

test('NotifyConfig model and backup export keep notification credentials encrypted', () => {
    const doc = new NotifyConfig({
        _id: 'default',
        smtpPass: 'smtp-model-secret',
        qywxApiKey: 'wecom-model-secret'
    });
    const rawSmtpPass = doc.get('smtpPass', null, { getters: false });
    assert.equal(isEncrypted(rawSmtpPass), true);
    assert.equal(doc.smtpPass, 'smtp-model-secret');
    assert.equal(doc.toObject().smtpPass, 'smtp-model-secret');

    const protectedDocs = protectBackupDocuments('NotifyConfig', [{
        _id: 'default',
        smtpPass: 'legacy-smtp-secret',
        qywxApiKey: 'legacy-wecom-secret'
    }]);
    assert.equal(isEncrypted(protectedDocs[0].smtpPass), true);
    assert.equal(isEncrypted(protectedDocs[0].qywxApiKey), true);
    assert.doesNotMatch(JSON.stringify(protectedDocs), /legacy-(?:smtp|wecom)-secret/);
});

test('startup migration encrypts legacy notification credentials', async () => {
    const originalFindById = NotifyConfig.findById;
    const originalUpdateOne = NotifyConfig.updateOne;
    let update;
    NotifyConfig.findById = () => leanQuery({
        _id: 'default',
        smtpPass: 'legacy-smtp-secret',
        qywxApiKey: 'legacy-wecom-secret'
    });
    NotifyConfig.updateOne = async (_filter, value) => { update = value; };

    try {
        const result = await settingsService.migrateNotifySecrets();
        assert.equal(result.migrated, true);
        assert.equal(isEncrypted(update.$set.smtpPass), true);
        assert.equal(isEncrypted(update.$set.qywxApiKey), true);
        assert.equal(decrypt(update.$set.smtpPass), 'legacy-smtp-secret');
    } finally {
        NotifyConfig.findById = originalFindById;
        NotifyConfig.updateOne = originalUpdateOne;
    }
});

test('changing an admin password increments tokenVersion and revokes refresh tokens', async () => {
    const originalFindById = User.findById;
    const originalDeleteMany = RefreshToken.deleteMany;
    const originalHash = bcrypt.hash;
    const user = {
        _id: 'root-1',
        userId: '10001',
        password: undefined,
        tokenVersion: 4,
        async save() { this.saved = true; }
    };
    User.findById = () => ({ async select() { return user; } });
    let revokedFilter;
    RefreshToken.deleteMany = async (filter) => { revokedFilter = filter; };
    bcrypt.hash = async () => 'new-password-hash';

    try {
        await settingsService.updateAdminInfo('root-1', { newPassword: 'StrongPass123' });
        assert.equal(user.password, 'new-password-hash');
        assert.equal(user.tokenVersion, 5);
        assert.equal(user.saved, true);
        assert.deepEqual(revokedFilter, { userId: 'root-1' });
    } finally {
        User.findById = originalFindById;
        RefreshToken.deleteMany = originalDeleteMany;
        bcrypt.hash = originalHash;
    }
});
