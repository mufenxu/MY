import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  baselineDrift,
  extractCodes,
  loadBaseline,
  loadRegistry,
  scanServiceCodes,
  validateBaseline,
  validateRegistry,
} from './check-error-codes.mjs';

test('注册表本身合法且关键错误码齐全', () => {
  const registry = loadRegistry();
  assert.deepEqual(validateRegistry(registry), []);

  for (const code of ['VALIDATION_FAILED', 'ROUTE_NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR']) {
    assert.ok(registry[code], `${code} 必须登记`);
  }
  // 传输语义与业务语义必须一致：429 只能映射限流类错误
  assert.equal(registry.RATE_LIMITED.http, 429);
  assert.equal(registry.ROUTE_NOT_FOUND.http, 404);
  // 网关自己的错误码也必须在同一张表里
  assert.equal(registry.UPSTREAM_TIMEOUT.http, 504);
  assert.equal(registry.AI_RATE_LIMITED.http, 429);
});

test('validateRegistry 拒绝非法条目', () => {
  const problems = validateRegistry({
    GOOD_CODE: { http: 400, zh: '可以。' },
    bad_code: { http: 400, zh: '小写不行。' },
    WRONG_STATUS: { http: 200, zh: '不能用 2xx。' },
    EMPTY_TEXT: { http: 400, zh: '   ' },
    _comment: '说明字段会被忽略',
  });

  assert.equal(problems.length, 3);
  assert.ok(problems.some((item) => item.includes('bad_code')));
  assert.ok(problems.some((item) => item.includes('WRONG_STATUS')));
  assert.ok(problems.some((item) => item.includes('EMPTY_TEXT')));
});

test('validateBaseline 要求每个 code 至少给出一个文件', () => {
  assert.deepEqual(validateBaseline({ codes: { GOOD_CODE: ['services/a.js'] } }), []);
  const problems = validateBaseline({ codes: { GOOD_CODE: [], bad_code: ['x'] } });
  assert.equal(problems.length, 2);
});

test('extractCodes 只取字面量契约码', () => {
  const source = [
    "return fail(res, { status: 404, code: 'ROUTE_NOT_FOUND', message: 'x' });",
    "if (err.code === 11000) { code: 'DUPLICATE_KEY'; }",
    "const dynamic = code;",
  ].join('\n');

  assert.deepEqual(extractCodes(source), ['ROUTE_NOT_FOUND', 'DUPLICATE_KEY']);
});

test('scanServiceCodes 全量扫描，基线只放行登记过的文件', () => {
  const registry = { KNOWN_CODE: { http: 400, zh: '已知。' } };
  const root = fileURLToPath(new URL('./__fixtures__/error-codes/', import.meta.url));
  const baseline = { codes: { LEGACY_CODE: ['services/demo/src/no-respond.js'] } };

  const result = scanServiceCodes(path.resolve(root), registry, baseline);

  // 两个文件都进入扫描范围：不再按"是否 import respond"过滤
  assert.deepEqual(result.scanned.sort(), [
    'services/demo/src/no-respond.js',
    'services/demo/src/uses-respond.js',
  ]);
  // 基线内的存量码放行，未登记的仍然报错
  assert.deepEqual(result.violations, [
    { file: 'services/demo/src/uses-respond.js', line: 3, code: 'UNKNOWN_CODE' },
  ]);
  assert.deepEqual(result.baselined, ['services/demo/src/no-respond.js:2 LEGACY_CODE']);
});

test('基线只对登记的文件生效，换一个文件用同一个码照样报错', () => {
  const registry = { KNOWN_CODE: { http: 400, zh: '已知。' } };
  const root = fileURLToPath(new URL('./__fixtures__/error-codes/', import.meta.url));

  const result = scanServiceCodes(path.resolve(root), registry, { codes: {} });

  assert.equal(result.violations.length, 2);
  assert.deepEqual(
    result.violations.map((item) => item.code).sort(),
    ['LEGACY_CODE', 'UNKNOWN_CODE'],
  );
});

test('baselineDrift 要求已登记的码从基线里删除', () => {
  const registry = { KNOWN_CODE: { http: 400, zh: '已知。' } };
  const drift = baselineDrift(registry, {
    codes: { KNOWN_CODE: ['services/a.js'], OTHER_CODE: ['services/b.js'] },
  });

  assert.deepEqual(drift, ['KNOWN_CODE']);
});

test('仓库里的基线文件合法，且不包含已登记的码', () => {
  const registry = loadRegistry();
  const baseline = loadBaseline();

  assert.deepEqual(validateBaseline(baseline), []);
  assert.deepEqual(baselineDrift(registry, baseline), []);
});
