const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ITEMS = 10000;

function collectionChangedError(message) {
    const error = new Error(message);
    error.code = 'COLLECTION_CHANGED_DURING_LOAD';
    return error;
}

export async function collectPagedItems(fetchPage, {
    pageSize = DEFAULT_PAGE_SIZE,
    maxItems = DEFAULT_MAX_ITEMS,
    getId = (item) => item?._id,
} = {}) {
    const items = [];
    const seenIds = new Set();
    const maxPages = Math.ceil(maxItems / pageSize);
    let firstResponse = null;
    let expectedTotal = null;

    for (let page = 1; page <= maxPages; page += 1) {
        const response = await fetchPage({ page, pageSize });
        if (!firstResponse) firstResponse = response;
        const payload = response?.data?.data || {};
        const pageItems = Array.isArray(payload.list) ? payload.list : [];
        const reportedTotal = Number(payload.total);

        if (!Number.isSafeInteger(reportedTotal) || reportedTotal < 0) {
            throw collectionChangedError('题目列表没有返回有效总数，请刷新后重试。');
        }
        if (reportedTotal > maxItems) {
            const error = new Error(`题库题目数超过编辑器上限 ${maxItems}，请拆分题库后重试。`);
            error.code = 'COLLECTION_TOO_LARGE';
            throw error;
        }
        if (expectedTotal === null) expectedTotal = reportedTotal;
        if (reportedTotal !== expectedTotal) {
            throw collectionChangedError('题目在加载过程中发生变化，请刷新后重试。');
        }

        for (const item of pageItems) {
            const id = String(getId(item) || '');
            if (!id || seenIds.has(id)) {
                throw collectionChangedError('题目分页结果不稳定，请刷新后重试。');
            }
            seenIds.add(id);
            items.push(item);
        }

        if (items.length === expectedTotal) {
            return { response: firstResponse, items, total: expectedTotal };
        }
        if (items.length > expectedTotal || pageItems.length === 0) {
            throw collectionChangedError('题目分页结果不完整，请刷新后重试。');
        }
    }

    throw collectionChangedError('题目分页超过安全加载范围，请拆分题库后重试。');
}

