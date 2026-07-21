import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvatarColor,
  getAvatarInitials,
  getCartoonAvatarDataUri,
} from '../src/utils/avatarPresentation.js';

test('avatar initials support empty, Latin and Chinese labels', () => {
  assert.equal(getAvatarInitials(''), 'U');
  assert.equal(getAvatarInitials('Ada Lovelace'), 'AL');
  assert.equal(getAvatarInitials('张三'), '张三');
});

test('avatar colors are deterministic for the same identity', () => {
  assert.equal(getAvatarColor('admin'), getAvatarColor('admin'));
  assert.match(getAvatarColor('admin'), /^#[0-9A-F]{6}$/);
});

test('cartoon avatars are deterministic, varied, and embedded locally', () => {
  const firstAvatar = getCartoonAvatarDataUri('user-10001');

  assert.equal(firstAvatar, getCartoonAvatarDataUri('user-10001'));
  assert.notEqual(firstAvatar, getCartoonAvatarDataUri('user-10002'));
  assert.match(firstAvatar, /^data:image\/svg\+xml;charset=UTF-8,/);
  assert.match(decodeURIComponent(firstAvatar), /<svg[^>]+viewBox="0 0 96 96"/);
});
