import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractImageDigest } from './buildx-metadata.mjs';

const digest = `sha256:${'a'.repeat(64)}`;

test('Buildx metadata returns the pushed image manifest digest', () => {
  assert.equal(extractImageDigest(JSON.stringify({
    'containerimage.config.digest': `sha256:${'b'.repeat(64)}`,
    'containerimage.digest': digest,
  })), digest);
});

test('Buildx metadata rejects malformed, missing and non-manifest digests', () => {
  assert.throws(() => extractImageDigest('{'), /not valid JSON/);
  assert.throws(() => extractImageDigest({}), /containerimage\.digest/);
  assert.throws(() => extractImageDigest({
    'containerimage.config.digest': digest,
  }), /containerimage\.digest/);
  assert.throws(() => extractImageDigest({
    'containerimage.digest': 'sha256:not-a-digest',
  }), /containerimage\.digest/);
});

test('Buildx metadata CLI prints only the validated image digest', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'my-buildx-metadata-'));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  const filename = path.join(directory, 'metadata.json');
  try {
    await writeFile(filename, JSON.stringify({ 'containerimage.digest': digest }));
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./buildx-metadata.mjs', import.meta.url)),
      filename,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${digest}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ACR workflow consumes Buildx metadata without an immediate registry lookup', async () => {
  const workflow = await readFile(new URL('../.github/workflows/aliyun-acr.yml', import.meta.url), 'utf8');
  assert.match(workflow, /--metadata-file "\$\{metadata_file\}"/);
  assert.match(workflow, /node scripts\/buildx-metadata\.mjs "\$\{metadata_file\}"/);
  assert.doesNotMatch(workflow, /imagetools inspect "\$\{candidate\}"/);
  assert.match(workflow, /\[runner\]="deployment-runner\.Dockerfile"/);
  assert.match(workflow, /if \[ "\$\{target\}" != "runner" \]; then/);
  assert.match(workflow, /RELEASE_TARGETS: \$\{\{ steps\.resolve\.outputs\.release_targets \}\}/);
});
