import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvatarColor, getAvatarInitials } from '../src/utils/avatarPresentation.js';

test('avatar initials support empty, Latin and Chinese labels', () => {
  assert.equal(getAvatarInitials(''), 'U');
  assert.equal(getAvatarInitials('Ada Lovelace'), 'AL');
  assert.equal(getAvatarInitials('张三'), '张三');
});

test('avatar colors are deterministic for the same identity', () => {
  assert.equal(getAvatarColor('admin'), getAvatarColor('admin'));
  assert.match(getAvatarColor('admin'), /^#[0-9A-F]{6}$/);
});
