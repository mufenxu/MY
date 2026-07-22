const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination } = require('../utils/pagination');

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
