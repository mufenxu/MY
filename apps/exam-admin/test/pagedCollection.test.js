import assert from 'node:assert/strict';
import test from 'node:test';

import { collectPagedItems } from '../src/api/pagedCollection.js';

function response(list, total) {
    return { data: { code: 0, data: { list, total } } };
}

test('paged collection loads every bounded page exactly once', async () => {
    const source = Array.from({ length: 205 }, (_, index) => ({ _id: `question-${index + 1}` }));
    const calls = [];
    const result = await collectPagedItems(({ page, pageSize }) => {
        calls.push({ page, pageSize });
        const start = (page - 1) * pageSize;
        return response(source.slice(start, start + pageSize), source.length);
    });

    assert.equal(result.items.length, 205);
    assert.equal(result.items.at(-1)._id, 'question-205');
    assert.deepEqual(calls, [
        { page: 1, pageSize: 100 },
        { page: 2, pageSize: 100 },
        { page: 3, pageSize: 100 },
    ]);
});

test('paged collection fails closed when total or identities change mid-load', async () => {
    await assert.rejects(
        collectPagedItems(({ page }) => response(
            page === 1 ? [{ _id: 'a' }] : [{ _id: 'b' }],
            page === 1 ? 2 : 3,
        ), { pageSize: 1 }),
        (error) => error.code === 'COLLECTION_CHANGED_DURING_LOAD',
    );

    await assert.rejects(
        collectPagedItems(() => response([{ _id: 'same' }], 2), { pageSize: 1 }),
        (error) => error.code === 'COLLECTION_CHANGED_DURING_LOAD',
    );
});

test('paged collection rejects a category above the editor safety ceiling', async () => {
    await assert.rejects(
        collectPagedItems(() => response([{ _id: 'a' }], 10001)),
        (error) => error.code === 'COLLECTION_TOO_LARGE',
    );
});
