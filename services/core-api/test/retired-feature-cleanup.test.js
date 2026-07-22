const test = require('node:test');
const assert = require('node:assert/strict');
const {
    cleanupRetiredFeatureData,
    dropCollectionIfPresent,
} = require('../services/retiredFeatureCleanup');

test('retired scan collections and the default global resource document are removed', async () => {
    const dropped = [];
    let resourceFilter;
    const db = {
        collection(name) {
            if (name === 'resourceconfigs') {
                return {
                    async deleteOne(filter) {
                        resourceFilter = filter;
                        return { deletedCount: 1 };
                    },
                };
            }
            return {
                async drop() {
                    dropped.push(name);
                },
            };
        },
    };

    const result = await cleanupRetiredFeatureData(db);

    assert.deepEqual(dropped.sort(), ['appclients', 'authscanlogs']);
    assert.deepEqual(resourceFilter, { _id: 'default' });
    assert.deepEqual(result, {
        appClientsDropped: true,
        authScanLogsDropped: true,
        defaultResourceConfigsDeleted: 1,
    });
});

test('missing retired collections make cleanup a no-op', async () => {
    const db = {
        collection() {
            return {
                async drop() {
                    const error = new Error('namespace not found');
                    error.code = 26;
                    throw error;
                },
            };
        },
    };

    assert.equal(await dropCollectionIfPresent(db, 'missing'), false);
});
