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

/**
 * 统一的分页元数据（响应侧）。
 *
 * 请求侧的 `limit` / `pageSize` 优先级是锁定的有意设计，不要动；
 * 这里只解决"响应里没有页码信息、客户端只能自己推断有没有下一页"的问题。
 * 作为**增量字段**挂在既有响应上（`{ success, items, total, page }`），
 * 老客户端忽略 `page` 即可，不需要同步改造。
 */
function buildPageMeta({ page, limit, total }) {
    const pageSize = Number(limit) || 0;
    const count = Math.max(Number(total) || 0, 0);
    const totalPages = pageSize > 0 ? Math.max(Math.ceil(count / pageSize), 1) : 0;
    return {
        page: Number(page) || 1,
        pageSize,
        total: count,
        totalPages,
        hasMore: pageSize > 0 ? (Number(page) || 1) < totalPages : false,
    };
}

module.exports = {
    boundedInteger,
    buildPageMeta,
    parsePagination,
};
