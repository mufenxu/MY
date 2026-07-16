import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCampusRepository } from '../src/storage/campus-repository.js';

test('school session compare-and-set rejects stale writers', async () => {
  const repository = new MemoryCampusRepository();
  const userId = 'user-1';

  assert.equal(
    await repository.replaceSchoolSessionIfVersion(userId, null, 'initial', '2026-07-16T00:00:00.000Z'),
    true
  );
  const firstRead = await repository.getSchoolSession(userId);
  const secondRead = await repository.getSchoolSession(userId);
  assert.equal(firstRead.version, 1);

  assert.equal(
    await repository.replaceSchoolSessionIfVersion(userId, firstRead.version, 'writer-a', '2026-07-16T00:00:01.000Z'),
    true
  );
  assert.equal(
    await repository.replaceSchoolSessionIfVersion(userId, secondRead.version, 'writer-b', '2026-07-16T00:00:02.000Z'),
    false
  );

  const latest = await repository.getSchoolSession(userId);
  assert.equal(latest.jar_json, 'writer-a');
  assert.equal(latest.version, 2);
});
