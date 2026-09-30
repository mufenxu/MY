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
    // Exam is consumed by the miniapp, which paginates with `pageSize`.
    // `limit` stays accepted as a secondary alias. Do not "align" this with
    // services/core-api, whose primary client sends `limit` instead: swapping
    // the operands silently changes which value wins when a caller sends both.
    const limit = boundedInteger(query.pageSize ?? query.limit, defaultLimit, 1, maxLimit);
    return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
    boundedInteger,
    parsePagination,
};
