const crypto = require('crypto');
const PrivilegedMutationLock = require('../models/PrivilegedMutationLock');

const LOCK_ID = 'active-super-admin-invariant';
const LEASE_MS = 5 * 60 * 1000;
const WAIT_TIMEOUT_MS = 10 * 1000;
let localTail = Promise.resolve();

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireDatabaseLock() {
    if (process.env.NODE_ENV !== 'production' && PrivilegedMutationLock.db.readyState !== 1) {
        return async () => {};
    }

    const holder = crypto.randomUUID();
    const deadline = Date.now() + WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const now = new Date();
        try {
            const lock = await PrivilegedMutationLock.findOneAndUpdate({
                _id: LOCK_ID,
                $or: [
                    { expiresAt: { $lte: now } },
                    { holder }
                ]
            }, {
                $set: {
                    holder,
                    expiresAt: new Date(now.getTime() + LEASE_MS)
                }
            }, {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            });

            if (lock && lock.holder === holder) {
                return async () => {
                    await PrivilegedMutationLock.deleteOne({ _id: LOCK_ID, holder });
                };
            }
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }

        await delay(25 + Math.floor(Math.random() * 25));
    }

    const error = new Error('Another privileged account operation is still in progress.');
    error.statusCode = 503;
    throw error;
}

async function acquirePrivilegedMutationLock() {
    const previous = localTail;
    let releaseLocal;
    localTail = new Promise((resolve) => { releaseLocal = resolve; });
    await previous;

    let releaseDatabase;
    try {
        releaseDatabase = await acquireDatabaseLock();
    } catch (error) {
        releaseLocal();
        throw error;
    }

    let released = false;
    return async () => {
        if (released) return;
        released = true;
        try {
            await releaseDatabase();
        } finally {
            releaseLocal();
        }
    };
}

module.exports = { acquirePrivilegedMutationLock };
