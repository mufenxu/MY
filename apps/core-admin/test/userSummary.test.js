import assert from 'node:assert/strict';
import test from 'node:test';

import { storeUserSummary, toUserSummary } from '../src/utils/userSummary.js';

function createStorage() {
  const data = new Map();
  return {
    data,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test('only display fields of the user document are kept', () => {
  const summary = toUserSummary({
    _id: 'u1',
    userId: 'admin',
    nickName: '管理员',
    avatarUrl: '/a.png',
    role: 'super_admin',
    openid: 'wx-openid',
    permissions: ['all'],
    tokenVersion: 7,
    password: 'hash',
  });

  assert.deepEqual(summary, { _id: 'u1', userId: 'admin', nickName: '管理员', avatarUrl: '/a.png', role: 'super_admin' });
});

test('storing a summary writes the trimmed document and clears on empty input', () => {
  const storage = createStorage();

  storeUserSummary({ userId: 'admin', role: 'admin', openid: 'wx-openid' }, storage);
  assert.equal(storage.data.get('user'), JSON.stringify({ userId: 'admin', role: 'admin' }));

  storeUserSummary(null, storage);
  assert.equal(storage.data.has('user'), false);
});
