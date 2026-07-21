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

test('calendar subscriptions and reminder preferences stay scoped to their user', async () => {
  const repository = new MemoryCampusRepository();
  const timestamp = '2026-07-21T00:00:00.000Z';
  await repository.upsertCalendarSubscription('user-1', {
    tokenHash: 'hash-1',
    tokenJson: 'encrypted-token',
    timestamp
  });
  await repository.upsertReminderPreference('user-1', {
    enabled: true,
    recipientId: 'student-1',
    leadMinutes: 15
  }, timestamp);

  assert.equal((await repository.findCalendarSubscriptionByTokenHash('hash-1')).user_id, 'user-1');
  assert.equal((await repository.getCalendarSubscription('user-2')), null);
  assert.equal((await repository.listEnabledReminderPreferences()).length, 1);
  await repository.disableCalendarSubscription('user-1', timestamp);
  assert.equal(await repository.findCalendarSubscriptionByTokenHash('hash-1'), null);
});
