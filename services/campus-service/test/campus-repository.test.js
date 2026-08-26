import test from 'node:test';
import assert from 'node:assert/strict';
import { CampusRepository, MemoryCampusRepository } from '../src/storage/campus-repository.js';

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

test('App-only reminder preferences persist their verified platform recipient', async () => {
  const repository = new MemoryCampusRepository();
  const timestamp = '2026-08-18T00:00:00.000Z';
  await repository.upsertReminderPreference('user-1', {
    enabled: true,
    recipientId: '',
    appRecipientId: 'platform-user',
    leadMinutes: 15
  }, timestamp);

  const saved = await repository.getReminderPreference('user-1');
  assert.equal(saved.app_recipient_id, 'platform-user');
  assert.equal(saved.recipient_id, '');
  assert.deepEqual(
    (await repository.listEnabledReminderPreferences()).map((row) => row.user_id),
    ['user-1']
  );
});

test('repository list methods honor bounded windows', async () => {
  const repository = new MemoryCampusRepository();
  for (let index = 1; index <= 5; index += 1) {
    const id = `user-${index}`;
    await repository.insertUser({
      id,
      username: id,
      disabled: 0,
      created_at: `2026-07-21T00:00:0${index}.000Z`
    });
    await repository.upsertReminderPreference(id, {
      enabled: true,
      recipientId: `recipient-${index}`,
      leadMinutes: 15
    }, `2026-07-21T00:00:0${index}.000Z`);
  }

  assert.deepEqual((await repository.listActiveUsers({ offset: 1, limit: 2 })).map((row) => row.id), ['user-2', 'user-3']);
  assert.deepEqual((await repository.listUsersWithSessions({ offset: 3, limit: 2 })).map((row) => row.id), ['user-4', 'user-5']);
  assert.deepEqual(
    (await repository.listEnabledReminderPreferences({ offset: 2, limit: 2 })).map((row) => row.user_id),
    ['user-3', 'user-4']
  );
  assert.equal((await repository.listActiveUsers({ offset: Infinity, limit: Infinity })).length, 5);
});

test('auto reservation tasks stay scoped and can be claimed once per occurrence', async () => {
  const repository = new MemoryCampusRepository();
  const task = {
    id: 'task-1',
    user_id: 'user-1',
    name: '研讨',
    enabled: true,
    recurrenceMode: 'weekly',
    weekdays: [1, 3, 5],
    startDate: '2026-08-25',
    endDate: '2026-09-30',
    created_at: '2026-08-25T00:00:00.000Z',
    updated_at: '2026-08-25T00:00:00.000Z'
  };
  await repository.insertAutoReservationTask(task);
  assert.equal((await repository.listAutoReservationTasks('user-2')).length, 0);
  const updated = await repository.updateAutoReservationTask(
    'user-1',
    'task-1',
    { reservationDate: '2026-08-25' },
    '2026-08-25T00:30:00.000Z'
  );
  assert.equal(updated.reservationDate, '2026-08-25');
  assert.equal('recurrenceMode' in updated, false);
  assert.equal('weekdays' in updated, false);
  assert.equal('startDate' in updated, false);
  assert.equal('endDate' in updated, false);
  assert.equal((await repository.claimAutoReservationTask('user-1', 'task-1', '2026-08-25', '2026-08-25T01:00:00.000Z', '2026-08-25T01:05:00.000Z'))?.id, 'task-1');
  assert.equal(await repository.claimAutoReservationTask('user-1', 'task-1', '2026-08-25', '2026-08-25T01:00:01.000Z', '2026-08-25T01:05:01.000Z'), null);
  await repository.finishAutoReservationTask('user-1', 'task-1', { status: 'succeeded', candidateIndex: 0, attempts: [] }, '2026-08-25T01:01:00.000Z');
  const saved = (await repository.listAutoReservationTasks('user-1'))[0];
  assert.equal(saved.last_status, 'succeeded');
  assert.equal(saved.enabled, false);
  await repository.deleteAutoReservationTask('user-1', 'task-1');
  assert.equal((await repository.listAutoReservationTasks('user-1')).length, 0);
});

test('Mongo auto reservation claims tasks with a null lock timestamp', async () => {
  const repository = new CampusRepository();
  const row = {
    id: 'task-1',
    user_id: 'user-1',
    enabled: true,
    last_run_key: null,
    run_lock_until: null
  };
  repository.db = {
    collection(name) {
      assert.equal(name, 'auto_reservation_tasks');
      return {
        async findOneAndUpdate(query, update) {
          const matchesLock = query.$or.some((condition) => {
            if (Object.hasOwn(condition, 'run_lock_until')) {
              const value = condition.run_lock_until;
              if (value === null) return row.run_lock_until === null;
              if (value?.$exists === false) return !Object.hasOwn(row, 'run_lock_until');
              if (value?.$lte) return typeof row.run_lock_until === typeof value.$lte && row.run_lock_until <= value.$lte;
            }
            return false;
          });
          if (
            query.id === row.id &&
            query.user_id === row.user_id &&
            query.enabled === row.enabled &&
            row.last_run_key !== query.last_run_key.$ne &&
            matchesLock
          ) {
            Object.assign(row, update.$set);
            return { value: { ...row } };
          }
          return { value: null };
        }
      };
    }
  };

  const claimed = await repository.claimAutoReservationTask(
    'user-1',
    'task-1',
    '2026-08-28:2026-08-26T07:43',
    '2026-08-25T23:43:00.000Z',
    '2026-08-25T23:45:00.000Z'
  );

  assert.equal(claimed?.id, 'task-1');
  assert.equal(claimed.run_lock_until, '2026-08-25T23:45:00.000Z');
});
