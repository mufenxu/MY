import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNavigationGroup,
  isPlainInternalNavigation,
  NAV_GROUPS,
  resolveConsoleView,
} from '../src/client/navigation.js';

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

test('console navigation exposes six complete groups with stable legacy view ids', () => {
  assert.deepEqual(NAV_GROUPS.map((group) => group.id), [
    'overview',
    'services',
    'observability',
    'execution',
    'capabilities',
    'security',
  ]);
  assert.equal(new Set(NAV_GROUPS.flatMap((group) => group.views.map((view) => view.id))).size, 13);
  assert.equal(getNavigationGroup('service').id, 'services');
  assert.equal(getNavigationGroup('diagnostics').id, 'observability');
  assert.equal(getNavigationGroup('configuration').id, 'execution');
  assert.equal(getNavigationGroup('automation').id, 'capabilities');
});

test('console view resolution preserves valid deep links and rejects unknown views', () => {
  assert.equal(resolveConsoleView('releases'), 'releases');
  assert.equal(resolveConsoleView('security'), 'security');
  assert.equal(resolveConsoleView('unknown'), 'all');
  assert.equal(resolveConsoleView(null), 'all');
});
