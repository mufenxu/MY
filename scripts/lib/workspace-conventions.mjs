/**
 * Pure, read-only convention rules for the workspace.
 *
 * Every rule here is a fact that can be verified from the repository, not a style
 * preference. The registry of rules lives in docs/engineering-standards.md; when a
 * rule changes there, change it here in the same commit.
 *
 * Nothing in this module writes to the repository.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Projects that must be registered everywhere a project list exists. */
export const REGISTRATION_SOURCES = ['scripts/install-workspace.mjs', 'scripts/audit-workspace.mjs'];

/** Package names that intentionally do not follow the @my-platform/* convention. */
export const PACKAGE_NAME_EXEMPTIONS = new Set(['examples/external-sso-express']);

/**
 * Projects allowed to skip a `check` script, with the reason. A library or a
 * workflow-only automation folder can legitimately be validated directly from the
 * root check chain instead of owning a script; an installable app or service cannot.
 */
export const CHECK_SCRIPT_EXEMPTIONS = new Map([
  ['packages/platform-auth', 'validated directly by the root check:packages step'],
  ['packages/platform-browser-runtime', 'validated directly by the root check:packages step'],
  ['automation/ct8-automation', 'GitHub-Actions-only automation; no installable runtime artifact'],
]);

export function createRepository(root) {
  const toAbsolute = (relativePath) => path.join(root, relativePath);
  return {
    root,
    exists: (relativePath) => fs.existsSync(toAbsolute(relativePath)),
    readText: (relativePath) => fs.readFileSync(toAbsolute(relativePath), 'utf8'),
    readJson: (relativePath) => JSON.parse(fs.readFileSync(toAbsolute(relativePath), 'utf8')),
  };
}

/** Extract a project list from a registry script by reading its string literals. */
export function extractProjectList(text, sourceName) {
  const match = text.match(/const projects = \[([\s\S]*?)\];/);
  if (!match) throw new Error(`Could not find a "const projects = [...]" list in ${sourceName}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

/**
 * Every directory that owns a package.json, excluding dependencies.
 * "Managed" means the project owns a package-lock.json, which is exactly the set
 * `npm ci` installs and therefore the set that must be registered everywhere.
 */
export function discoverProjects(repo) {
  const projects = [];
  for (const group of ['apps', 'services', 'packages', 'automation']) {
    if (!repo.exists(group)) continue;
    for (const entry of fs.readdirSync(path.join(repo.root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const direct = `${group}/${entry.name}`;
      if (repo.exists(`${direct}/package.json`)) {
        projects.push(direct);
        continue;
      }
      // One nested level, e.g. apps/smart-campus-miniapp/miniprogram
      for (const nested of fs.readdirSync(path.join(repo.root, direct), { withFileTypes: true })) {
        if (!nested.isDirectory() || nested.name === 'node_modules') continue;
        const candidate = `${direct}/${nested.name}`;
        if (repo.exists(`${candidate}/package.json`)) projects.push(candidate);
      }
    }
  }
  return projects.sort();
}

/**
 * The expected package name is derived from the owning project directory, not from
 * the directory that happens to hold the manifest. For `apps/smart-campus-miniapp`
 * the manifest lives one level deeper, yet the name is `@my-platform/smart-campus-miniapp`.
 */
export function expectedPackageName(project) {
  const segments = project.split('/');
  const owner = segments[0] === 'apps' && segments.length > 2 ? segments[1] : segments.at(-1);
  return `@my-platform/${owner}`;
}

/** Declared 4-space exceptions from .editorconfig, as path prefixes. */
export function readFourSpaceExceptions(editorConfigText) {
  return [...editorConfigText.matchAll(/^\[([^\]]+)\]\s*\nindent_size = 4$/gm)].map((match) => match[1]);
}

/**
 * Run every rule and return the findings. Pure with respect to the repository:
 * it only reads. `failures` is empty when the workspace is compliant.
 */
export function collectConventionFailures(repo) {
  const failures = [];
  const fail = (relativePath, message) => failures.push(`${relativePath}: ${message}`);

  const allProjects = discoverProjects(repo);
  const managedProjects = allProjects.filter((project) => repo.exists(`${project}/package-lock.json`));

  // Rule 1: every npm-ci managed project is registered in both registry scripts.
  const registryLists = new Map(
    REGISTRATION_SOURCES.map((file) => [file, extractProjectList(repo.readText(file), file)]),
  );

  for (const [file, list] of registryLists) {
    const listed = new Set(list);
    for (const project of managedProjects) {
      if (!listed.has(project)) {
        fail(file, `project "${project}" owns a package-lock.json but is not registered`);
      }
    }
    for (const project of list) {
      if (!repo.exists(`${project}/package.json`)) {
        fail(file, `registered project "${project}" has no package.json`);
      }
    }
  }

  const [primaryList] = registryLists.values();
  for (const [file, list] of registryLists) {
    const primary = new Set(primaryList);
    for (const project of list) {
      if (!primary.has(project)) {
        fail(file, `"${project}" is registered here but missing from ${REGISTRATION_SOURCES[0]}`);
      }
    }
  }

  // Rule 2: the root check chain reaches every managed project.
  // Rule 3: package naming, metadata and entry-point integrity.
  const rootScripts = repo.readJson('package.json').scripts || {};
  const checkChainText = Object.entries(rootScripts)
    .filter(([name]) => name === 'check' || name.startsWith('check:'))
    .map(([, body]) => body)
    .join(' && ');

  for (const project of allProjects) {
    const manifestPath = `${project}/package.json`;
    const manifest = repo.readJson(manifestPath);

    if (!PACKAGE_NAME_EXEMPTIONS.has(project)) {
      const expected = expectedPackageName(project);
      if (manifest.name !== expected) {
        fail(manifestPath, `name is "${manifest.name}" but the convention is "${expected}"`);
      }
    }

    if (manifest.private !== true && !PACKAGE_NAME_EXEMPTIONS.has(project)) {
      fail(manifestPath, 'is missing "private": true');
    }
    if (!manifest.description || !String(manifest.description).trim()) {
      fail(manifestPath, 'has an empty or missing "description"');
    }

    for (const field of ['main', 'module', 'types']) {
      const value = manifest[field];
      if (typeof value === 'string' && value.startsWith('.') && !repo.exists(path.posix.join(project, value))) {
        fail(manifestPath, `"${field}" points at "${value}", which does not exist`);
      }
    }

    const hasCheck = typeof manifest.scripts?.check === 'string';
    if (!hasCheck && !CHECK_SCRIPT_EXEMPTIONS.has(project)) {
      fail(manifestPath, 'has no "check" script, so its gate cannot be invoked');
    }
    if (hasCheck && !checkChainText.includes(project)) {
      fail('package.json', `no root check:* script references "${project}", so its gate never runs`);
    }
  }

  // Rule 4: package.json indentation follows .editorconfig (2 spaces) unless the
  // path is a declared 4-space exception.
  const fourSpaceExceptions = readFourSpaceExceptions(repo.readText('.editorconfig'));
  for (const project of allProjects) {
    if (fourSpaceExceptions.some((pattern) => pattern.startsWith(`${project}/`))) continue;
    const lines = repo.readText(`${project}/package.json`).split('\n');
    const second = lines[1] ?? '';
    const indent = second.length - second.trimStart().length;
    if (indent !== 2) {
      fail(`${project}/package.json`, `is indented with ${indent} spaces; .editorconfig requires 2 for JSON`);
    }
  }

  // Rule 5: the service topology registry IDs resolve in the console catalogues.
  const topology = repo.readJson('config/service-topology.json');
  const registryIds = (topology.services || []).map((service) => service.registryId).filter(Boolean);
  for (const catalogue of ['config/platform.services.docker.json', 'config/platform.services.local.json']) {
    const ids = new Set((repo.readJson(catalogue).services || []).map((service) => service.id));
    for (const registryId of registryIds) {
      if (!ids.has(registryId)) {
        fail(catalogue, `is missing service id "${registryId}" declared by config/service-topology.json`);
      }
    }
  }

  return { failures, allProjects, managedProjects, registryIds };
}
