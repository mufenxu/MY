const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPageMeta, parsePagination } = require('../utils/pagination');

test('pagination bounds page size and never creates a negative skip', () => {
    assert.deepEqual(
        parsePagination({ page: '-4', limit: '10000' }, { defaultLimit: 10, maxLimit: 50 }),
        { page: 1, limit: 50, skip: 0 },
    );
    assert.deepEqual(
        parsePagination({ page: '3', pageSize: '20' }, { defaultLimit: 10, maxLimit: 50 }),
        { page: 3, limit: 20, skip: 40 },
    );
});

test('buildPageMeta 补齐响应侧的分页元数据', () => {
    assert.deepEqual(
        buildPageMeta({ page: 2, limit: 20, total: 45 }),
        { page: 2, pageSize: 20, total: 45, totalPages: 3, hasMore: true },
    );
    // 末页
    assert.deepEqual(
        buildPageMeta({ page: 3, limit: 20, total: 45 }),
        { page: 3, pageSize: 20, total: 45, totalPages: 3, hasMore: false },
    );
    // 空集合仍然给出 1 页，避免前端出现 0/0
    assert.deepEqual(
        buildPageMeta({ page: 1, limit: 20, total: 0 }),
        { page: 1, pageSize: 20, total: 0, totalPages: 1, hasMore: false },
    );
});
