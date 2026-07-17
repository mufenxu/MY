import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageFiles = [
  'package.json',
  'index.cjs',
  path.join('esm', 'index.mjs'),
];
const vendorDirs = [
  path.join('services', 'campus-service', 'vendor', 'platform-auth'),
  path.join('services', 'iot-service', 'vendor', 'platform-auth'),
];

let hasMismatch = false;

for (const vendorDir of vendorDirs) {
  for (const packageFile of packageFiles) {
    const sourcePath = path.join(rootDir, 'packages', 'platform-auth', packageFile);
    const vendorPath = path.join(rootDir, vendorDir, packageFile);
    const [source, vendor] = await Promise.all([
      readFile(sourcePath, 'utf8'),
      readFile(vendorPath, 'utf8'),
    ]);

    if (source !== vendor) {
      hasMismatch = true;
      console.error(`${vendorPath} is out of sync with ${sourcePath}`);
    }
  }
}

if (hasMismatch) {
  process.exit(1);
}

console.log('platform-auth vendor copies are in sync');
