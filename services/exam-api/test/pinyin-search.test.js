const test = require('node:test');
const assert = require('node:assert/strict');
const { collectMatchingPage } = require('../src/utils/pinyinSearch');

async function* createItems(count) {
    for (let index = 0; index < count; index += 1) {
        yield { id: index };
    }
}

test('pinyin pagination scans the full result stream and returns an exact total', async () => {
    const result = await collectMatchingPage(createItems(5005), {
        startIndex: 2,
        limit: 2,
        getMatch: (item) => (item.id % 1000 === 0 ? ['content'] : []),
    });

    assert.equal(result.total, 6);
    assert.deepEqual(result.pageItems.map(({ item }) => item.id), [2000, 3000]);
    assert.deepEqual(result.pageItems[0].match, ['content']);
});
