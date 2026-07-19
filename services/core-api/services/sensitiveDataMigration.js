const AppClient = require('../models/AppClient');
const PlatformConfig = require('../models/PlatformConfig');
const { encrypt, isEncrypted } = require('../utils/crypto');

async function migrateField(Model, field) {
    let migrated = 0;
    const cursor = Model.collection.find({
        [field]: { $exists: true, $type: 'string', $ne: '' },
    }, { projection: { [field]: 1 } });
    for await (const document of cursor) {
        const current = document[field];
        if (!current || isEncrypted(String(current))) continue;
        const result = await Model.collection.updateOne(
            { _id: document._id, [field]: current },
            { $set: { [field]: encrypt(String(current)) } },
        );
        migrated += Number(result.modifiedCount) || 0;
    }
    return migrated;
}

async function migrateSensitiveData() {
    const [appClientSecrets, platformSecrets] = await Promise.all([
        migrateField(AppClient, 'secret'),
        migrateField(PlatformConfig, 'secretKey'),
    ]);
    return { appClientSecrets, platformSecrets };
}

module.exports = { migrateField, migrateSensitiveData };
