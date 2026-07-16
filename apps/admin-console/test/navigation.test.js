import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlainInternalNavigation } from '../src/client/navigation.js';

const plainClick = {
  button: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

test('plain same-origin navigation uses the transition screen', () => {
  assert.equal(isPlainInternalNavigation(plainClick, '/apps/core/'), true);
});

test('external, modified, and non-primary navigation keep browser defaults', () => {
  assert.equal(isPlainInternalNavigation(plainClick, 'https://example.com/admin'), false);
  assert.equal(isPlainInternalNavigation(plainClick, '//example.com/admin'), false);
  assert.equal(isPlainInternalNavigation({ ...plainClick, ctrlKey: true }, '/apps/core/'), false);
  assert.equal(isPlainInternalNavigation({ ...plainClick, button: 1 }, '/apps/core/'), false);
});
