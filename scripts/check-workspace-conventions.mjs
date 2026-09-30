/**
 * Read-only workspace convention gate.
 *
 * The rules live in scripts/lib/workspace-conventions.mjs and are documented in
 * docs/engineering-standards.md. This entry point only reports.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectConventionFailures, createRepository } from './lib/workspace-conventions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = createRepository(root);
const { failures, allProjects, managedProjects, registryIds } = collectConventionFailures(repo);

if (failures.length > 0) {
  console.error('Workspace convention checks failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} problem(s). See docs/engineering-standards.md for the rules.`);
  process.exitCode = 1;
} else {
  console.log(
    `Workspace conventions ok (${allProjects.length} projects, ${managedProjects.length} npm-ci managed, ` +
      `${registryIds.length} topology registry ids).`,
  );
}
