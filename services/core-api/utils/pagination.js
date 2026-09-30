function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function parsePagination(query = {}, {
    defaultLimit = 20,
    maxLimit = 100,
    maxPage = 10_000,
} = {}) {
    const page = boundedInteger(query.page, 1, 1, maxPage);
    // Core is consumed by the admin console, which paginates with `limit`.
    // `pageSize` stays accepted as a secondary alias. Do not "align" this with
    // services/exam-api, whose primary client sends `pageSize` instead: swapping
    // the operands silently changes which value wins when a caller sends both.
    const limit = boundedInteger(query.limit ?? query.pageSize, defaultLimit, 1, maxLimit);
    return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
    boundedInteger,
    parsePagination,
};
