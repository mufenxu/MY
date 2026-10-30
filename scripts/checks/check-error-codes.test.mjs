import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  extractCodes,
  loadRegistry,
  scanRespondFiles,
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

test('extractCodes 只取字面量契约码', () => {
  const source = [
    "return fail(res, { status: 404, code: 'ROUTE_NOT_FOUND', message: 'x' });",
    "if (err.code === 11000) { code: 'DUPLICATE_KEY'; }",
    "const dynamic = code;",
  ].join('\n');

  assert.deepEqual(extractCodes(source), ['ROUTE_NOT_FOUND', 'DUPLICATE_KEY']);
});

test('scanRespondFiles 只检查接入统一响应助手的文件', () => {
  const registry = { KNOWN_CODE: { http: 400, zh: '已知。' } };
  const root = fileURLToPath(new URL('./__fixtures__/error-codes/', import.meta.url));

  const result = scanRespondFiles(path.resolve(root), registry);

  assert.deepEqual(result.scanned.sort(), [
    'services/demo/src/uses-respond.js',
  ]);
  assert.deepEqual(result.violations, [
    { file: 'services/demo/src/uses-respond.js', line: 3, code: 'UNKNOWN_CODE' },
  ]);
});
