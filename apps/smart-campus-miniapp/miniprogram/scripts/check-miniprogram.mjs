import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const root = path.resolve(import.meta.dirname, '..');
const sourceExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.wxss']);
const targetExtensions = ['', '.ts', '.js', '.json', '.wxml', '.wxss'];
const errors = [];
const KIB = 1024;

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, callback);
    else callback(target);
  }
}

function existsTarget(base) {
  return targetExtensions.some((extension) => fs.existsSync(`${base}${extension}`))
    || fs.existsSync(path.join(base, 'index.ts'))
    || fs.existsSync(path.join(base, 'index.js'));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON: ${path.relative(root, filePath)} (${error.message})`);
    return null;
  }
}

function checkComponents(filePath, json) {
  for (const [name, component] of Object.entries(json?.usingComponents || {})) {
    if (/^plugin:/.test(component)) continue;
    const base = component.startsWith('/')
      ? path.join(root, component.slice(1))
      : path.resolve(path.dirname(filePath), component);
    if (!existsTarget(base)) errors.push(`Broken component ${name}: ${path.relative(root, filePath)} -> ${component}`);
  }
}

function checkPngAsset(relativePath, { maxBytes, maxWidth, maxHeight }) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing image asset: ${relativePath}`);
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    errors.push(`Invalid PNG asset: ${relativePath}`);
    return;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (buffer.length > maxBytes) {
    errors.push(`Oversized image asset: ${relativePath} (${buffer.length} bytes > ${maxBytes} bytes)`);
  }
  if (width > maxWidth || height > maxHeight) {
    errors.push(`Oversized image dimensions: ${relativePath} (${width}x${height} > ${maxWidth}x${maxHeight})`);
  }
}

walk(root, (filePath) => {
  const extension = path.extname(filePath);
  if (!sourceExtensions.has(extension) || filePath.includes(`${path.sep}node_modules${path.sep}`)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  if (text.includes('\uFFFD')) errors.push(`Invalid UTF-8 replacement character: ${path.relative(root, filePath)}`);
  if (extension === '.json') checkComponents(filePath, readJson(filePath));
  if (extension === '.ts' || extension === '.js') {
    try {
      parse(text, { sourceType: 'unambiguous', plugins: extension === '.ts' ? ['typescript'] : [] });
    } catch (error) {
      errors.push(`Syntax error: ${path.relative(root, filePath)} (${error.message})`);
    }
  }
});

const app = readJson(path.join(root, 'app.json'));
for (const page of app?.pages || []) {
  if (!fs.existsSync(path.join(root, `${page}.json`))) errors.push(`Missing page: ${page}`);
}
for (const subpackage of app?.subpackages || app?.subPackages || []) {
  for (const page of subpackage.pages || []) {
    const route = path.posix.join(subpackage.root, page);
    if (!fs.existsSync(path.join(root, `${route}.json`))) errors.push(`Missing page: ${route}`);
  }
}
for (const [page, rule] of Object.entries(app?.preloadRule || {})) {
  if (rule?.packages?.includes('pages/login/')) {
    errors.push(`Login package must remain lazy-loaded: preloadRule.${page}`);
  }
}

checkPngAsset('pages/login/logo.png', {
  maxBytes: 96 * KIB,
  maxWidth: 256,
  maxHeight: 256,
});

const todoSource = fs.readFileSync(path.join(root, 'pages/todo/index.js'), 'utf8');
if (/pendingOperations\.splice\(0,\s*100\)/.test(todoSource)) {
  errors.push('Todo outbox must not remove operations before server acknowledgement');
}
if (!todoSource.includes('removeAcknowledgedOperations(this._pendingOperations, batch)')) {
  errors.push('Todo outbox acknowledgement reconciliation is missing');
}
if (!todoSource.includes('prepareStorageScope()') || !todoSource.includes('`${TODO_STORAGE_PREFIX}:${scope}`')) {
  errors.push('Todo storage must be scoped to the authenticated user');
}
if (!todoSource.includes('wx.getStorageSync(context.keys.tasks)')
  || !todoSource.includes('wx.getStorageSync(context.keys.outbox)')) {
  errors.push('Todo tasks and outbox must use the active user storage namespace');
}
if (!todoSource.includes('isStorageContextCurrent(context)')
  || !todoSource.includes('this._scopeGeneration += 1')) {
  errors.push('Todo async work must be invalidated when the authenticated user changes');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Smart campus miniprogram source and routes ok');
