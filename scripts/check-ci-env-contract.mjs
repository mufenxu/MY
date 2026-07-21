import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function inspectCiEnvContract({ compose, generator }) {
  const requiredVariables = new Set(
    [...String(compose || '').matchAll(/\$\{([A-Z][A-Z0-9_]*):\?[^}]*\}/g)]
      .map((match) => match[1]),
  );
  const generatedVariables = new Set(
    [...String(generator || '').matchAll(/^\s{2}([A-Z][A-Z0-9_]*):\s/gm)]
      .map((match) => match[1]),
  );

  return [...requiredVariables]
    .filter((key) => !generatedVariables.has(key))
    .sort()
    .map((key) => `CI environment generator is missing required Compose variable ${key}`);
}

export function loadCiEnvContractInputs(workspaceRoot = root) {
  return {
    compose: fs.readFileSync(path.join(workspaceRoot, 'infra', 'docker', 'compose.yml'), 'utf8'),
    generator: fs.readFileSync(path.join(workspaceRoot, 'scripts', 'create-ci-env.mjs'), 'utf8'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = inspectCiEnvContract(loadCiEnvContractInputs());
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('CI environment generator covers every required Compose variable.');
}
