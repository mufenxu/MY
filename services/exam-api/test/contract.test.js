/**
 * 接口契约测试（exam-api）。
 *
 * 只断言 docs/api-specification.md 里承诺的不变量，不碰真实数据库：
 * - 校验失败必须带 details[] 且字段带来源前缀
 * - 错误响应是统一信封（ok/success/code/error/message/requestId）
 * - CastError 映射 400，不是 500
 * - 429 带 Retry-After，且 code 是字符串 RATE_LIMITED
 */
const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_contract_test';
process.env.EXAM_JWT_SECRET ||= 'exam-contract-test-secret-at-least-32-characters';

const Joi = require('joi');
const validate = require('../src/middleware/validate');
const errorHandler = require('../src/middleware/errorHandler');
const { rateLimitHandler } = require('../src/middleware/rateLimiter');
const { NotFoundError } = require('../src/utils/errors');

function createResponse() {
    return {
        statusCode: 0,
        body: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

function runErrorHandler(error, req = {}) {
    const res = createResponse();
    errorHandler(error, { method: 'GET', originalUrl: '/api/x', id: 'req-contract-1', ...req }, res, () => {});
    return res;
}

test('校验失败返回 details，字段带 body./query. 前缀', () => {
    const middleware = validate({
        body: Joi.object({ name: Joi.string().required() }),
        query: Joi.object({ page: Joi.number().integer().min(1) }),
    });

    let caught = null;
    try {
        middleware({ body: {}, query: { page: 0 }, params: {} }, createResponse(), () => {});
    } catch (error) {
        caught = error;
    }

    assert.ok(caught, '校验失败必须抛出 ValidationError');
    assert.equal(caught.statusCode, 400);
    assert.ok(Array.isArray(caught.details));
    assert.deepEqual(
        caught.details.map((item) => item.field),
        ['body.name', 'query.page'],
    );
});

test('错误响应是统一信封，requestId 与请求一致', () => {
    const res = runErrorHandler(new NotFoundError('接口不存在。'));

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.success, false);
    assert.equal(typeof res.body.code, 'string');
    assert.equal(res.body.code, 'NOT_FOUND');
    assert.equal(res.body.message, res.body.error);
    assert.equal(res.body.requestId, 'req-contract-1');
    // 5xx 之外不隐藏文案，但也不能是英文技术细节
    assert.match(res.body.message, /[\u4e00-\u9fa5]/);
});

test('CastError 映射为 400，不是 500', () => {
    const error = new Error('Cast to ObjectId failed');
    error.name = 'CastError';
    error.value = 'not-an-id';

    const res = runErrorHandler(error);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_PARAMETER');
});

test('5xx 不回传原始 error.message', () => {
    const error = new Error('connect ECONNREFUSED 10.0.0.7:27017');

    const res = runErrorHandler(error);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(res.body.message, /ECONNREFUSED|10\.0\.0\.7/);
    assert.equal(res.body.details, undefined);
});

test('限流 429 带 Retry-After 与字符串 code', () => {
    const res = createResponse();
    const req = { id: 'req-rate-1' };

    rateLimitHandler('请求过于频繁，请稍后再试')(req, res, () => {}, {
        windowMs: 60_000,
        statusCode: 429,
    });

    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['retry-after'], '60');
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.equal(res.body.retryAfter, 60);
    assert.equal(res.body.requestId, 'req-rate-1');
    // 数字 code 是旧写法，必须绝迹
    assert.equal(typeof res.body.code, 'string');
});
