const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EASE = 2.3;
const MIN_EASE = 1.3;
const MAX_EASE = 3;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function addDays(at, days) {
    return new Date(at.getTime() + (days * DAY_MS));
}

function buildInitialReviewState(at = new Date()) {
    return {
        reviewStage: 0,
        reviewIntervalDays: 0,
        reviewEase: DEFAULT_EASE,
        reviewCount: 0,
        lapseCount: 0,
        lastReviewedAt: null,
        dueAt: new Date(at),
    };
}

function scheduleReview(state = {}, rating, at = new Date()) {
    if (!['unknown', 'fuzzy', 'known'].includes(rating)) {
        throw new TypeError('rating must be unknown, fuzzy, or known');
    }

    const currentStage = Math.max(0, Math.floor(toFiniteNumber(state.reviewStage, 0)));
    const currentInterval = Math.max(0, Math.floor(toFiniteNumber(state.reviewIntervalDays, 0)));
    const currentEase = clamp(toFiniteNumber(state.reviewEase, DEFAULT_EASE), MIN_EASE, MAX_EASE);
    let reviewStage;
    let reviewIntervalDays;
    let reviewEase;
    let lapseIncrement = 0;

    if (rating === 'unknown') {
        reviewStage = 0;
        reviewIntervalDays = 1;
        reviewEase = clamp(currentEase - 0.2, MIN_EASE, MAX_EASE);
        lapseIncrement = 1;
    } else if (rating === 'fuzzy') {
        reviewStage = Math.max(1, currentStage);
        reviewIntervalDays = currentInterval <= 1
            ? 2
            : Math.max(currentInterval + 1, Math.round(currentInterval * 1.5));
        reviewEase = clamp(currentEase - 0.05, MIN_EASE, MAX_EASE);
    } else {
        reviewStage = currentStage + 1;
        if (reviewStage === 1) {
            reviewIntervalDays = 1;
        } else if (reviewStage === 2) {
            reviewIntervalDays = 3;
        } else if (reviewStage === 3) {
            reviewIntervalDays = 7;
        } else {
            reviewIntervalDays = Math.max(
                currentInterval + 1,
                Math.round(Math.max(currentInterval, 7) * currentEase),
            );
        }
        reviewEase = clamp(currentEase + 0.05, MIN_EASE, MAX_EASE);
    }

    return {
        reviewStage,
        reviewIntervalDays,
        reviewEase: Number(reviewEase.toFixed(2)),
        reviewCount: Math.max(0, Math.floor(toFiniteNumber(state.reviewCount, 0))) + 1,
        lapseCount: Math.max(0, Math.floor(toFiniteNumber(state.lapseCount, 0))) + lapseIncrement,
        lastReviewedAt: new Date(at),
        dueAt: addDays(at, reviewIntervalDays),
        status: rating === 'known' && reviewStage >= 2 ? 'mastered' : 'needsReview',
        masteredAt: rating === 'known' && reviewStage >= 2
            ? (state.masteredAt || new Date(at))
            : null,
    };
}

module.exports = {
    DAY_MS,
    buildInitialReviewState,
    scheduleReview,
};
