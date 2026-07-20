import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const allowedRegistryHosts = new Set(['registry.npmjs.org']);

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, callback);
    else callback(target);
  }
}

function inspectResolvedValues(value, filePath, errors, reportedRegistries) {
  if (Array.isArray(value)) {
    value.forEach((item) => inspectResolvedValues(item, filePath, errors, reportedRegistries));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'resolved' && typeof item === 'string' && /^https?:\/\//.test(item)) {
      const host = new URL(item).hostname.toLowerCase();
      if (!allowedRegistryHosts.has(host)) {
        const message = `${path.relative(root, filePath)} uses unapproved package registry ${host}`;
        if (!reportedRegistries.has(message)) {
          reportedRegistries.add(message);
          errors.push(message);
        }
      }
    } else {
      inspectResolvedValues(item, filePath, errors, reportedRegistries);
    }
  }
}

export function inspectWorkflow(source, label = 'workflow.yml') {
  const errors = [];
  for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    if (reference.startsWith('docker://')) {
      if (!/@sha256:[a-f0-9]{64}$/.test(reference)) {
        errors.push(`${label} container action is not pinned to a sha256 digest: ${reference}`);
      }
      continue;
    }
    const separator = reference.lastIndexOf('@');
    const revision = separator === -1 ? '' : reference.slice(separator + 1);
    if (!/^[a-f0-9]{40}$/.test(revision)) {
      errors.push(`${label} action is not pinned to a commit SHA: ${reference}`);
    }
  }
  return errors;
}

export function inspectDockerfile(source, label = 'Dockerfile') {
  const errors = [];
  const args = new Map();
  const stages = new Set();
  const digestPattern = /@sha256:[a-f0-9]{64}$/;
  let currentWorkdir = '/';
  const syntaxLine = source.match(/^\s*#\s*syntax=([^\s]+)\s*$/m);
  if (syntaxLine && !digestPattern.test(syntaxLine[1])) {
    errors.push(`${label} Dockerfile syntax frontend is not pinned to a sha256 digest: ${syntaxLine[1]}`);
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const argMatch = line.match(/^ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=(\S+))?$/i);
    if (argMatch) {
      args.set(argMatch[1], argMatch[2] || '');
      continue;
    }

    const fromMatch = line.match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?$/i);
    if (fromMatch) {
      const declaredReference = fromMatch[1];
      const variableMatch = declaredReference.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/);
      const reference = variableMatch ? args.get(variableMatch[1]) : declaredReference;
      if (!reference) {
        errors.push(`${label} FROM ${declaredReference} has no immutable default image reference`);
      } else if (reference !== 'scratch' && !stages.has(reference) && !digestPattern.test(reference)) {
        errors.push(`${label} base image is not pinned to a sha256 digest: ${reference}`);
      }
      if (fromMatch[2]) stages.add(fromMatch[2]);
      currentWorkdir = '/';
      continue;
    }

    const workdirMatch = line.match(/^WORKDIR\s+(\S+)$/i);
    if (workdirMatch) {
      currentWorkdir = path.posix.resolve(currentWorkdir, workdirMatch[1]);
      continue;
    }

    const copyMatch = line.match(/^COPY\s+(?:--\S+\s+)*(\S+)\s+(\S+)$/i);
    const buildModules = copyMatch?.[1].match(/^\/build\/(.+)\/node_modules$/);
    if (!buildModules) continue;
    const destination = path.posix.resolve(currentWorkdir, copyMatch[2]);
    const expected = `/app/${buildModules[1]}/node_modules`;
    if (destination !== expected) {
      errors.push(`${label} changes the monorepo node_modules path: expected ${expected}, found ${destination}`);
    }
  }
  return errors;
}

export function inspectCompose(source, label = 'compose.yml') {
  const errors = [];
  const digestPattern = /@sha256:[a-f0-9]{64}$/;
  const localBuildPattern = /^my-platform\/[a-z0-9._/-]+:local$/;

  for (const match of source.matchAll(/^\s*image:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/gm)) {
    const declaredReference = match[1];
    const variableDefault = declaredReference.match(/^\$\{[A-Za-z_][A-Za-z0-9_]*:-([^}]+)\}$/);
    const reference = variableDefault ? variableDefault[1] : declaredReference;
    if (digestPattern.test(reference) || localBuildPattern.test(reference)) continue;
    errors.push(`${label} service image is not pinned to a sha256 digest: ${declaredReference}`);
  }
  return errors;
}

export function checkRepository() {
  const errors = [];
  const reportedRegistries = new Set();

  walk(root, (filePath) => {
    if (path.basename(filePath) === 'package-lock.json') {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      inspectResolvedValues(parsed, filePath, errors, reportedRegistries);
    }
    if (path.basename(filePath) === 'Dockerfile' || filePath.endsWith('.Dockerfile')) {
      errors.push(...inspectDockerfile(fs.readFileSync(filePath, 'utf8'), path.relative(root, filePath)));
    }
    if (/^compose(?:\.[^.]+)*\.ya?ml$/i.test(path.basename(filePath))) {
      errors.push(...inspectCompose(fs.readFileSync(filePath, 'utf8'), path.relative(root, filePath)));
    }
  });

  const workflowsDirectory = path.join(root, '.github', 'workflows');
  for (const entry of fs.readdirSync(workflowsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const filePath = path.join(workflowsDirectory, entry.name);
    errors.push(...inspectWorkflow(fs.readFileSync(filePath, 'utf8'), path.relative(root, filePath)));
  }
  return errors;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const errors = checkRepository();
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Supply-chain references are pinned to approved immutable sources.');
}
