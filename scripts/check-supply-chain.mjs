import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const allowedRegistryHosts = new Set(['registry.npmjs.org']);
const errors = [];
const reportedRegistries = new Set();

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, callback);
    else callback(target);
  }
}

function inspectResolvedValues(value, filePath) {
  if (Array.isArray(value)) {
    value.forEach((item) => inspectResolvedValues(item, filePath));
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
      inspectResolvedValues(item, filePath);
    }
  }
}

walk(root, (filePath) => {
  if (path.basename(filePath) !== 'package-lock.json') return;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  inspectResolvedValues(parsed, filePath);
});

const workflowPath = path.join(root, '.github', 'workflows', 'ci.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
  const reference = match[1];
  if (reference.startsWith('./')) continue;
  const separator = reference.lastIndexOf('@');
  const revision = separator === -1 ? '' : reference.slice(separator + 1);
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    errors.push(`ci.yml action is not pinned to a commit SHA: ${reference}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Supply-chain references are pinned to approved immutable sources.');
