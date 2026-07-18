function normalizeTokenVersion(value) {
    const version = Number(value);
    return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

function backupInputError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function prepareRestoredUsers(docs, currentVersions = new Map()) {
    if (!Array.isArray(docs)) {
        throw backupInputError('User backup collection must be an array.');
    }

    const hasActiveSuperAdmin = docs.some((user) => (
        user
        && user.role === 'super_admin'
        && (!user.status || user.status === 'active')
    ));
    if (!hasActiveSuperAdmin) {
        throw backupInputError('Backup must contain at least one active super_admin.');
    }

    return docs.map((user) => {
        if (!user || typeof user !== 'object' || Array.isArray(user) || !user._id) {
            throw backupInputError('Backup contains an invalid user record.');
        }
        const previousVersion = normalizeTokenVersion(currentVersions.get(String(user._id)));
        const backupVersion = normalizeTokenVersion(user.tokenVersion);
        return {
            ...user,
            tokenVersion: Math.max(previousVersion, backupVersion) + 1
        };
    });
}

module.exports = { prepareRestoredUsers };
