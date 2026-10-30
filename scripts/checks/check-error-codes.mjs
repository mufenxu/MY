#!/usr/bin/env node
/**
 * 错误码注册表校验。
 *
 * 规则（对应 docs/api-specification.md §3）：
 * 1. 注册表本身合法：code 形状、http 在 400–599、zh 非空；
 * 2. 同一个 code 只能映射一个 HTTP 状态；
 * 3. **services/ 下所有 `code: 'X'` 字面量要么已登记、要么在基线里**——
 *    这是一条棘轮，但基线是**按文件**记的：老代码放行，新文件用老码照样会被拦。
 * 4. 基线里的 code 一旦登记，就必须从基线删除（否则基线会一直烂下去）。
 *
 * 为什么不再按"文件是否 import respond"过滤：那样只有接入新助手的文件被检查，
 * 仓里 45 个服务端未登记码（AUTH_TOKEN_INVALID、MQTT_NOT_CONNECTED 等）
 * 永远不会被发现，注册表看着在生效，实际只覆盖了一部分。
 *
 * 范围：`services/`。`apps/admin-console` 是门户不是服务单元，另有 112 个码
 * 待单独收口（见 api-specification.md §18）。
 *
 * 只读脚本，不修改任何文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY_PATH = path.join(ROOT, 'packages', 'api-contract', 'error-codes.json');
const BASELINE_PATH = path.join(ROOT, 'packages', 'api-contract', 'error-code-baseline.json');
const CODE_SHAPE = /^[A-Z][A-Z0-9_]{2,63}$/;
const CODE_LITERAL = /\bcode:\s*'([A-Z][A-Z0-9_]{2,63})'/g;
const SKIP_DIRS = new Set([
  'node_modules', 'test', 'tests', 'dist', 'frontend', 'logs', 'uploads', 'public', '.git',
]);

export function loadRegistry(filePath = REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadBaseline(filePath = BASELINE_PATH) {
  if (!fs.existsSync(filePath)) return { codes: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const codes = parsed && typeof parsed.codes === 'object' && parsed.codes ? parsed.codes : {};
  return { codes };
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

export function validateBaseline(baseline) {
  const problems = [];
  const codes = baseline && baseline.codes ? baseline.codes : {};
  for (const [code, files] of Object.entries(codes)) {
    if (!CODE_SHAPE.test(code)) {
      problems.push(`基线里的 ${code} 不是合法的 code 形状。`);
    }
    if (!Array.isArray(files) || files.length === 0) {
      problems.push(`基线里的 ${code} 必须给出至少一个文件路径。`);
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

function relativePath(rootDir, file) {
  return path.relative(rootDir, file).split(path.sep).join('/');
}

/**
 * 扫描 services/ 下所有 code 字面量。
 * @returns {{violations: Array, scanned: string[], baselined: string[], stale: string[]}}
 */
export function scanServiceCodes(rootDir, registry, baseline = { codes: {} }) {
  const violations = [];
  const baselined = [];
  const seen = new Set();
  const scanned = [];

  for (const file of walk(path.join(rootDir, 'services'))) {
    const rel = relativePath(rootDir, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let used = false;
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CODE_LITERAL)) {
        used = true;
        const code = match[1];
        if (registry[code]) return;
        const allowedFiles = baseline.codes?.[code] || [];
        if (allowedFiles.includes(rel) || allowedFiles.includes('*')) {
          baselined.push(`${rel}:${index + 1} ${code}`);
          return;
        }
        violations.push({ file: rel, line: index + 1, code });
      }
    });
    if (used) scanned.push(rel);
  }

  // 基线里登记过、但现在文件里已经找不到的条目，提示清理（不判失败）。
  const stale = [];
  for (const [code, files] of Object.entries(baseline.codes || {})) {
    for (const file of files) {
      if (file === '*') continue;
      const source = (() => {
        try { return fs.readFileSync(path.join(rootDir, file), 'utf8'); } catch { return ''; }
      })();
      if (!extractCodes(source).includes(code)) {
        stale.push(`${file} ${code}`);
      }
    }
  }

  return { violations, scanned, baselined, stale };
}

/**
 * 基线里的 code 一旦登记，就必须从基线删除。
 */
export function baselineDrift(registry, baseline = { codes: {} }) {
  return Object.keys(baseline.codes || {}).filter((code) => Boolean(registry[code]));
}

function main() {
  const registry = loadRegistry();
  const problems = validateRegistry(registry);
  if (problems.length > 0) {
    console.error('错误码注册表不合法：');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const baseline = loadBaseline();
  const baselineProblems = validateBaseline(baseline);
  if (baselineProblems.length > 0) {
    console.error('错误码基线文件不合法：');
    for (const problem of baselineProblems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const { violations, scanned, baselined, stale } = scanServiceCodes(ROOT, registry, baseline);
  const registeredCount = Object.keys(registry).filter((code) => !code.startsWith('_')).length;
  const drift = baselineDrift(registry, baseline);

  if (drift.length > 0) {
    console.error('以下 code 已登记，请从 packages/api-contract/error-code-baseline.json 删除：');
    for (const code of drift) console.error(`  - ${code}`);
    process.exit(1);
  }

  if (violations.length > 0) {
    console.error('以下 code 未登记，也不在基线里：');
    for (const violation of violations) {
      console.error(`  - ${violation.file}:${violation.line}  ${violation.code}`);
    }
    console.error('');
    console.error('处理方式二选一：');
    console.error('  1) 登记到 packages/api-contract/error-codes.json（推荐，新代码必须走这条）；');
    console.error('  2) 确实是存量且暂不改造，把「文件路径」加进 error-code-baseline.json 对应 code 下。');
    process.exit(1);
  }

  const baselinedCodes = Object.keys(baseline.codes || {}).length;
  console.log(
    `错误码注册表校验通过：${registeredCount} 个已登记，${scanned.length} 个服务端文件含 code 字面量，`
    + `基线放行 ${baselinedCodes} 个存量码。`,
  );
  if (stale.length > 0) {
    console.log(`提示：基线里有 ${stale.length} 条已经用不到了，可以顺手删掉（不阻塞）。`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
