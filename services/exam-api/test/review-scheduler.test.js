const assert = require('node:assert/strict');
const test = require('node:test');

const {
    DAY_MS,
    buildInitialReviewState,
    scheduleReview,
} = require('../src/services/reviewScheduler');

test('new wrong questions are immediately due without a migration', () => {
    const at = new Date('2026-07-21T03:00:00.000Z');
    const state = buildInitialReviewState(at);

    assert.equal(state.reviewStage, 0);
    assert.equal(state.dueAt.getTime(), at.getTime());
    assert.equal(state.reviewCount, 0);
});

test('known reviews advance through stable one, three, and seven day intervals', () => {
    const at = new Date('2026-07-21T03:00:00.000Z');
    const first = scheduleReview({}, 'known', at);
    const second = scheduleReview(first, 'known', at);
    const third = scheduleReview(second, 'known', at);

    assert.equal(first.reviewIntervalDays, 1);
    assert.equal(second.reviewIntervalDays, 3);
    assert.equal(third.reviewIntervalDays, 7);
    assert.equal(second.status, 'mastered');
    assert.equal(third.dueAt.getTime(), at.getTime() + (7 * DAY_MS));
});

test('fuzzy reviews grow conservatively and remain in needs-review state', () => {
    const at = new Date('2026-07-21T03:00:00.000Z');
    const result = scheduleReview({ reviewStage: 2, reviewIntervalDays: 4, reviewEase: 2.3 }, 'fuzzy', at);

    assert.equal(result.reviewStage, 2);
    assert.equal(result.reviewIntervalDays, 6);
    assert.equal(result.reviewEase, 2.25);
    assert.equal(result.status, 'needsReview');
});

test('unknown reviews reset progress, count lapses, and never lower ease below the floor', () => {
    const at = new Date('2026-07-21T03:00:00.000Z');
    const result = scheduleReview({
        reviewStage: 5,
        reviewIntervalDays: 30,
        reviewEase: 1.35,
        reviewCount: 4,
        lapseCount: 2,
        masteredAt: new Date('2026-07-01T00:00:00.000Z'),
    }, 'unknown', at);

    assert.equal(result.reviewStage, 0);
    assert.equal(result.reviewIntervalDays, 1);
    assert.equal(result.reviewEase, 1.3);
    assert.equal(result.reviewCount, 5);
    assert.equal(result.lapseCount, 3);
    assert.equal(result.masteredAt, null);
});
