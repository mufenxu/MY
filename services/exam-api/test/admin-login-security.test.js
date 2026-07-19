const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_test';
process.env.EXAM_JWT_SECRET ||= 'test-jwt-secret-at-least-32-characters';

const {
    buildFailedLoginUpdate,
    registerFailedLoginAtomic,
    resetFailedLoginAtomic,
} = require('../src/services/adminLoginSecurity');

class FakeAdminModel {
    constructor() {
        this.admin = { _id: 'admin-1', failedLoginCount: 0, lockedUntil: null };
    }

    findOneAndUpdate(query, update) {
        const now = query.$or[2].lockedUntil.$lte;
        const activeLock = this.admin.lockedUntil && this.admin.lockedUntil > now;
        let result = null;
        if (!activeLock) {
            if (Array.isArray(update)) {
                if (this.admin.lockedUntil && this.admin.lockedUntil <= now) {
                    this.admin.failedLoginCount = 0;
                    this.admin.lockedUntil = null;
                }
                this.admin.failedLoginCount += 1;
                const maxAttempts = update[2].$set.lockedUntil.$cond[0].$gte[1];
                if (this.admin.failedLoginCount >= maxAttempts) {
                    this.admin.lockedUntil = update[2].$set.lockedUntil.$cond[1];
                }
            } else {
                Object.assign(this.admin, update.$set);
            }
            result = { ...this.admin };
        }
        return { select: async () => result };
    }
}

test('failed login update is an aggregation pipeline with an atomic threshold', () => {
    const now = new Date('2026-07-19T00:00:00.000Z');
    const update = buildFailedLoginUpdate(now, 5, 900000);
    assert.equal(update[1].$set.failedLoginCount.$add[1], 1);
    assert.deepEqual(update[2].$set.lockedUntil.$cond[0], { $gte: ['$failedLoginCount', 5] });
    assert.equal(update[2].$set.lockedUntil.$cond[1].getTime(), now.getTime() + 900000);
});

test('concurrent failures stop mutating once the account becomes locked', async () => {
    const adminModel = new FakeAdminModel();
    const now = new Date('2026-07-19T00:00:00.000Z');
    const results = await Promise.all(Array.from({ length: 10 }, () => registerFailedLoginAtomic({
        adminModel,
        adminId: 'admin-1',
        now,
        maxAttempts: 5,
        lockMs: 900000,
    })));

    assert.equal(adminModel.admin.failedLoginCount, 5);
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal(adminModel.admin.lockedUntil.getTime(), now.getTime() + 900000);
    assert.equal(await resetFailedLoginAtomic({ adminModel, adminId: 'admin-1', now }), null);
});
