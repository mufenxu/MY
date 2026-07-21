import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const distPath = path.join(root, 'apps', 'official-website', 'dist');
const indexPath = path.join(distPath, 'index.html');

assert.ok(fs.existsSync(indexPath), 'official website build must produce dist/index.html');

const index = fs.readFileSync(indexPath, 'utf8');
const bannedExternalOrigins = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const icpLinkPattern = /<a\b(?=[^>]*\bclass=["'][^"']*\bicp-link\b[^"']*["'])(?=[^>]*\bhref=["']https:\/\/beian\.miit\.gov\.cn\/?["'])[^>]*>\s*宁ICP备2025009338号-4\s*<\/a>/;
const scriptSources = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1])
  .filter((source) => !/^https?:\/\//i.test(source));

assert.ok(scriptSources.length > 0, 'official website build must reference a local JavaScript bundle');
assert.match(index, icpLinkPattern, 'official website footer must link the ICP record to the MIIT filing system');

for (const source of scriptSources) {
  assert.match(source, /^\/?website-assets\//, `official website script must use its isolated asset namespace: ${source}`);
  const relativePath = source.replace(/^\.\//, '').replace(/^\//, '').split(/[?#]/, 1)[0];
  assert.ok(
    fs.existsSync(path.join(distPath, relativePath)),
    `official website build references missing script: ${source}`,
  );
}

const scannableFiles = fs.readdirSync(distPath, { recursive: true })
  .map((entry) => path.join(distPath, entry))
  .filter((filePath) => fs.statSync(filePath).isFile() && /\.(?:css|html|js)$/.test(filePath));

for (const filePath of scannableFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const origin of bannedExternalOrigins) {
    assert.ok(!source.includes(origin), `${path.relative(root, filePath)} contains blocking external origin ${origin}`);
  }
}

console.log('Official website build output is complete.');
