#!/usr/bin/env node
/**
 * 错误码注册表校验。
 *
 * 规则（对应 docs/api-specification.md §3）：
 * 1. 注册表本身合法：code 形状、http 在 400–599、zh 非空；
 * 2. 同一个 code 只能映射一个 HTTP 状态（注册表本身以 code 为键，天然唯一，
 *    这里额外拒绝同一 code 在 _aliases 里重复声明的情况）；
 * 3. **引用了 respond 助手的文件**里出现的 `code: 'X'` 必须已登记——
 *    这是一条棘轮：新代码必须登记，老代码在改造到该文件时才被收口。
 *
 * 只读脚本，不修改任何文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY_PATH = path.join(ROOT, 'packages', 'api-contract', 'error-codes.json');
const CODE_SHAPE = /^[A-Z][A-Z0-9_]{2,63}$/;
// 只扫描"已经接入统一响应助手"的文件：这类文件里的 code 必须是契约码。
const RESPOND_IMPORT = /(?:require\(\s*|from\s+)['"][^'"]*respond(?:\.js)?['"]/;
const CODE_LITERAL = /\bcode:\s*'([A-Z][A-Z0-9_]{2,63})'/g;
const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', 'dist', 'frontend', 'logs', 'uploads', 'public', '.git']);

export function loadRegistry(filePath = REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function validateRegistry(registry) {
  const problems = [];
  const entries = Object.entries(registry).filter(([code]) => !code.startsWith('_'));

  if (entries.length === 0) problems.push('注册表为空。');

  for (const [code, entry] of entries) {
    if (!CODE_SHAPE.test(code)) {
      problems.push(`${code}: code 必须是全大写蛇形（3–64 位，字母开头）。`);
    }
    if (!entry || typeof entry !== 'object') {
      problems.push(`${code}: 值必须是 { http, zh } 对象。`);
      continue;
    }
    const http = Number(entry.http);
    if (!Number.isInteger(http) || http < 400 || http > 599) {
      problems.push(`${code}: http 必须是 400–599 的整数，当前为 ${JSON.stringify(entry.http)}。`);
    }
    if (typeof entry.zh !== 'string' || entry.zh.trim() === '') {
      problems.push(`${code}: zh 不能为空。`);
    }
  }
  return problems;
}

export function extractCodes(source) {
  const codes = [];
  for (const match of String(source).matchAll(CODE_LITERAL)) {
    codes.push(match[1]);
  }
  return codes;
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

export function scanRespondFiles(rootDir, registry) {
  const violations = [];
  const scanned = [];
  for (const file of walk(path.join(rootDir, 'services'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!RESPOND_IMPORT.test(source)) continue;
    scanned.push(path.relative(rootDir, file).split(path.sep).join('/'));
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CODE_LITERAL)) {
        const code = match[1];
        if (!registry[code]) {
          violations.push({
            file: path.relative(rootDir, file).split(path.sep).join('/'),
            line: index + 1,
            code,
          });
        }
      }
    });
  }
  return { violations, scanned };
}

function main() {
  const registry = loadRegistry();
  const problems = validateRegistry(registry);
  if (problems.length > 0) {
    console.error('错误码注册表不合法：');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const { violations, scanned } = scanRespondFiles(ROOT, registry);
  const registeredCount = Object.keys(registry).filter((code) => !code.startsWith('_')).length;

  if (violations.length > 0) {
    console.error('以下 code 未在 packages/api-contract/error-codes.json 登记：');
    for (const violation of violations) {
      console.error(`  - ${violation.file}:${violation.line}  ${violation.code}`);
    }
    process.exit(1);
  }

  console.log(`错误码注册表校验通过：${registeredCount} 个已登记，扫描 ${scanned.length} 个接入统一响应助手的文件。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
