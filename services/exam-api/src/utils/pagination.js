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
    const limit = boundedInteger(query.pageSize ?? query.limit, defaultLimit, 1, maxLimit);
    return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
    boundedInteger,
    parsePagination,
};
