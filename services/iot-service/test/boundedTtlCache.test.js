const assert = require('node:assert/strict');
const test = require('node:test');
const { BoundedTtlCache } = require('../src/utils/boundedTtlCache');

test('BoundedTtlCache expires entries and evicts least recently used values', () => {
  let now = 1000;
  const cache = new BoundedTtlCache({ maxEntries: 2, ttlMs: 100, now: () => now });
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);

  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.size, 2);

  now += 101;
  assert.equal(cache.get('a'), undefined);
  cache.prune();
  assert.equal(cache.size, 0);
});
