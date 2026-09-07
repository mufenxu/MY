import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ASSET_PATTERN = /^android\/my-control-(\d+)\.(\d+)\.(\d+)\.apk(?:\.sha256)?$/;

export function buildQiniuAndroidRetentionPlan(listing, keepCount = 20) {
  if (!Number.isSafeInteger(keepCount) || keepCount < 1) throw new Error('Keep count must be a positive integer');

  const filesByVersion = new Map();
  for (const line of listing.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const key = line.split('\t')[0];
    const match = ASSET_PATTERN.exec(key ?? '');
    if (!match) continue;

    const version = match.slice(1).join('.');
    const files = filesByVersion.get(version) ?? [];
    files.push(key);
    filesByVersion.set(version, files);
  }

  const versions = [...filesByVersion.keys()].sort(compareVersionsDescending);
  return versions
    .slice(keepCount)
    .flatMap(version => filesByVersion.get(version))
    .sort();
}

function compareVersionsDescending(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index];
  }
  return 0;
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const deleteKeys = buildQiniuAndroidRetentionPlan(
      readFileSync(option('--input'), 'utf8'),
      Number(option('--keep')),
    );
    writeFileSync(option('--output'), deleteKeys.length ? `${deleteKeys.join('\n')}\n` : '', 'utf8');
    process.stdout.write(`Qiniu Android retention: ${deleteKeys.length} file(s) scheduled for deletion\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
