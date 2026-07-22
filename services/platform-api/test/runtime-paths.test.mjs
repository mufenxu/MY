import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolveRuntimePaths } from '../src/runtime-paths.mjs';

test('container layout resolves sibling services from the workspace root', () => {
  const containerRoot = path.resolve(path.sep, 'app');
  const moduleUrl = pathToFileURL(path.join(
    containerRoot,
    'services/platform-api/src/runtime-paths.mjs',
  )).href;

  const runtime = resolveRuntimePaths({ env: {}, moduleUrl });

  assert.equal(runtime.workspaceRoot, containerRoot);
  assert.equal(runtime.paths.coreServer, path.join(containerRoot, 'services/core-api/server.js'));
  assert.equal(runtime.paths.examServer, path.join(containerRoot, 'services/exam-api/src/server.js'));
  assert.equal(runtime.paths.notifyApp, path.join(containerRoot, 'services/notification-service/src/app.js'));
  assert.equal(runtime.paths.portalApp, path.join(containerRoot, 'apps/admin-console/src/app.js'));
  assert.equal(runtime.paths.portalReleaseStore, path.join(containerRoot, 'apps/admin-console/src/release-store.js'));
  assert.equal(runtime.paths.portalConfigurationStore, path.join(containerRoot, 'apps/admin-console/src/configuration-store.js'));
  assert.doesNotMatch(runtime.paths.coreServer, /services[\\/]services/);
});

test('explicit runtime paths still override workspace defaults', () => {
  const override = path.resolve('custom/core-server.js');
  const runtime = resolveRuntimePaths({ env: { CORE_SERVER_PATH: override } });

  assert.equal(runtime.paths.coreServer, override);
});

test('external mode does not resolve local service runtime paths', () => {
  const { paths } = resolveRuntimePaths({ includeLocalServices: false });
  assert.equal(paths.coreServer, undefined);
  assert.equal(paths.coreStatic, undefined);
  assert.equal(paths.examServer, undefined);
  assert.equal(paths.notifyApp, undefined);
  assert.ok(paths.portalApp);
  assert.ok(paths.portalConfig);
  assert.ok(paths.portalReleaseStore);
  assert.ok(paths.portalConfigurationStore);
});
