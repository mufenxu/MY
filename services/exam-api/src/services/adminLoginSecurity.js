function buildUnlockedQuery(adminId, now) {
    return {
        _id: adminId,
        $or: [
            { lockedUntil: null },
            { lockedUntil: { $exists: false } },
            { lockedUntil: { $lte: now } },
        ],
    };
}

function buildFailedLoginUpdate(now, maxAttempts, lockMs) {
    const lockExpired = {
        $and: [
            { $ne: [{ $ifNull: ['$lockedUntil', null] }, null] },
            { $lte: ['$lockedUntil', now] },
        ],
    };

    return [
        {
            $set: {
                failedLoginCount: {
                    $cond: [lockExpired, 0, { $ifNull: ['$failedLoginCount', 0] }],
                },
                lockedUntil: {
                    $cond: [lockExpired, null, { $ifNull: ['$lockedUntil', null] }],
                },
            },
        },
        { $set: { failedLoginCount: { $add: ['$failedLoginCount', 1] } } },
        {
            $set: {
                lockedUntil: {
                    $cond: [
                        { $gte: ['$failedLoginCount', maxAttempts] },
                        new Date(now.getTime() + lockMs),
                        '$lockedUntil',
                    ],
                },
            },
        },
    ];
}

async function selectSecurityFields(query) {
    if (query && typeof query.select === 'function') {
        return query.select('+failedLoginCount +lockedUntil');
    }
    return query;
}

async function registerFailedLoginAtomic({
    adminModel,
    adminId,
    now = new Date(),
    maxAttempts,
    lockMs,
}) {
    return selectSecurityFields(adminModel.findOneAndUpdate(
        buildUnlockedQuery(adminId, now),
        buildFailedLoginUpdate(now, maxAttempts, lockMs),
        { new: true },
    ));
}

async function resetFailedLoginAtomic({ adminModel, adminId, now = new Date() }) {
    return selectSecurityFields(adminModel.findOneAndUpdate(
        buildUnlockedQuery(adminId, now),
        { $set: { failedLoginCount: 0, lockedUntil: null } },
        { new: true },
    ));
}

module.exports = {
    buildFailedLoginUpdate,
    buildUnlockedQuery,
    registerFailedLoginAtomic,
    resetFailedLoginAtomic,
};
