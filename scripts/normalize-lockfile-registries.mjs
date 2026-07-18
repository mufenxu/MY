import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const replacement = 'https://registry.npmjs.org/';
const changed = [];

async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (entry.name === 'package-lock.json') {
      const source = await fs.readFile(target, 'utf8');
      JSON.parse(source);
      if (!source.includes('registry.npmmirror.com')) continue;
      const normalized = source.replaceAll('https://registry.npmmirror.com/', replacement);
      JSON.parse(normalized);
      await fs.writeFile(target, normalized, 'utf8');
      changed.push(path.relative(root, target));
    }
  }
}

await walk(root);
console.log(changed.length ? `Normalized ${changed.join(', ')}.` : 'Lockfile registries already normalized.');
