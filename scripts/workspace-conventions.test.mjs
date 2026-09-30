import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectConventionFailures,
  createRepository,
  discoverProjects,
  expectedPackageName,
  extractProjectList,
  readFourSpaceExceptions,
} from './lib/workspace-conventions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = createRepository(root);

test('the real workspace satisfies every convention rule', () => {
  const { failures, managedProjects } = collectConventionFailures(repo);
  assert.deepEqual(failures, [], `expected no convention failures, got:\n${failures.join('\n')}`);
  assert.equal(managedProjects.length, 12, 'every npm-ci managed project should be discovered');
});

test('extractProjectList reads the registry lists and rejects a missing list', () => {
  const list = extractProjectList(repo.readText('scripts/install-workspace.mjs'), 'install-workspace.mjs');
  assert.ok(list.includes('apps/admin-console'));
  assert.ok(list.includes('apps/smart-campus-miniapp/miniprogram'));
  assert.ok(list.includes('services/notification-service'));
  assert.throws(() => extractProjectList('const other = [];', 'fake.mjs'), /Could not find/);
});

test('both registry scripts cover exactly the same managed projects', () => {
  const install = new Set(extractProjectList(repo.readText('scripts/install-workspace.mjs'), 'install'));
  const audit = new Set(extractProjectList(repo.readText('scripts/audit-workspace.mjs'), 'audit'));
  assert.deepEqual([...install].sort(), [...audit].sort());
});

test('discoverProjects finds nested miniapp projects and skips non-manifests', () => {
  const projects = discoverProjects(repo);
  assert.ok(projects.includes('apps/smart-campus-miniapp/miniprogram'));
  assert.ok(projects.includes('packages/platform-auth'));
  assert.ok(!projects.includes('apps'), 'a group directory is not a project');
  assert.ok(!projects.some((project) => project.includes('node_modules')));
});

test('expectedPackageName uses the owning project directory, not the manifest directory', () => {
  assert.equal(expectedPackageName('apps/smart-campus-miniapp/miniprogram'), '@my-platform/smart-campus-miniapp');
  assert.equal(expectedPackageName('services/core-api'), '@my-platform/core-api');
  assert.equal(expectedPackageName('packages/platform-auth'), '@my-platform/platform-auth');
});

test('readFourSpaceExceptions reads declared .editorconfig exceptions only', () => {
  const exceptions = readFourSpaceExceptions(repo.readText('.editorconfig'));
  assert.ok(exceptions.includes('services/core-api/**.js'));
  assert.ok(exceptions.includes('services/exam-api/**.js'));
  assert.ok(!exceptions.some((entry) => entry.startsWith('apps/')), 'no admin app is declared 4-space');
});

test('a manifest with an unresolvable main entry is reported', () => {
  const stub = {
    ...repo,
    readJson: (relativePath) => {
      const manifest = repo.readJson(relativePath);
      return relativePath === 'services/core-api/package.json' ? { ...manifest, main: './does-not-exist.js' } : manifest;
    },
  };
  const { failures } = collectConventionFailures(stub);
  assert.ok(
    failures.some((failure) => failure.includes('services/core-api/package.json') && failure.includes('does not exist')),
    `expected an entry-point failure, got:\n${failures.join('\n')}`,
  );
});

test('a package name that breaks the convention is reported', () => {
  const stub = {
    ...repo,
    readJson: (relativePath) => {
      const manifest = repo.readJson(relativePath);
      return relativePath === 'services/iot-service/package.json' ? { ...manifest, name: 'iot-service' } : manifest;
    },
  };
  const { failures } = collectConventionFailures(stub);
  assert.ok(failures.some((failure) => failure.includes('services/iot-service/package.json') && failure.includes('@my-platform/iot-service')));
});

test('an empty description is reported', () => {
  const stub = {
    ...repo,
    readJson: (relativePath) => {
      const manifest = repo.readJson(relativePath);
      return relativePath === 'apps/core-admin/package.json' ? { ...manifest, description: '   ' } : manifest;
    },
  };
  const { failures } = collectConventionFailures(stub);
  assert.ok(failures.some((failure) => failure.includes('apps/core-admin/package.json') && failure.includes('description')));
});
