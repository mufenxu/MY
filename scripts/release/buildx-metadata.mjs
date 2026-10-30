import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function extractImageDigest(source) {
  let metadata;
  try {
    metadata = typeof source === 'string' ? JSON.parse(source) : source;
  } catch {
    throw new Error('Buildx metadata is not valid JSON.');
  }

  const digest = metadata && !Array.isArray(metadata)
    ? metadata['containerimage.digest']
    : '';
  if (typeof digest !== 'string' || !digestPattern.test(digest)) {
    throw new Error('Buildx metadata does not contain a valid containerimage.digest.');
  }
  return digest;
}

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error('A Buildx metadata filename is required.');
  const source = await readFile(filename, 'utf8');
  process.stdout.write(`${extractImageDigest(source)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
