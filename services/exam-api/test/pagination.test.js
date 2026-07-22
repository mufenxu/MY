const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination } = require('../src/utils/pagination');
const manageValidator = require('../src/validators/manageValidator');
const consoleValidator = require('../src/validators/consoleValidator');

test('API pagination clamps invalid and oversized client values', () => {
    assert.deepEqual(
        parsePagination({ page: '-2', limit: '9999' }, { maxLimit: 50 }),
        { page: 1, limit: 50, skip: 0 },
    );
    assert.deepEqual(
        parsePagination({ page: '4', pageSize: '25', limit: '2' }),
        { page: 4, limit: 25, skip: 75 },
    );
});

test('question pagination validation matches the runtime page-size ceiling', () => {
    assert.equal(manageValidator.paginationQuery.query.validate({ pageSize: 100 }).error, undefined);
    assert.ok(manageValidator.paginationQuery.query.validate({ pageSize: 101 }).error);
    assert.equal(consoleValidator.paginationQuery.query.validate({ limit: 100 }).error, undefined);
    assert.ok(consoleValidator.paginationQuery.query.validate({ limit: 101 }).error);
});
