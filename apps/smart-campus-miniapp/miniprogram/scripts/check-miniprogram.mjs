import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const root = path.resolve(import.meta.dirname, '..');
const sourceExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.wxss']);
const targetExtensions = ['', '.ts', '.js', '.json', '.wxml', '.wxss'];
const errors = [];

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

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Smart campus miniprogram source and routes ok');
