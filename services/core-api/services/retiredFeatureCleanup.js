async function dropCollectionIfPresent(db, collectionName) {
    try {
        await db.collection(collectionName).drop();
        return true;
    } catch (error) {
        if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return false;
        throw error;
    }
}

async function cleanupRetiredFeatureData(db) {
    const [appClientsDropped, authScanLogsDropped, defaultResource] = await Promise.all([
        dropCollectionIfPresent(db, 'appclients'),
        dropCollectionIfPresent(db, 'authscanlogs'),
        db.collection('resourceconfigs').deleteOne({ _id: 'default' }),
    ]);

    return {
        appClientsDropped,
        authScanLogsDropped,
        defaultResourceConfigsDeleted: Number(defaultResource.deletedCount) || 0,
    };
}

module.exports = { cleanupRetiredFeatureData, dropCollectionIfPresent };
