const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const rateLimit = require('express-rate-limit');
const requestId = require('../middleware/requestId');
const errorHandler = require('../middleware/errorHandler');
const { fail } = require('../utils/respond');

// 用真实中间件起一个最小应用：断言的是"契约"，不是某个控制器的实现细节。
function createContractApp() {
    const app = express();
    app.use(requestId);

    app.get('/api/boom', () => {
        throw new Error('mongoose: connect ECONNREFUSED 10.0.0.7:27017');
    });

    app.get('/api/cast', (req, res, next) => {
        const error = new Error('Cast to ObjectId failed');
        error.name = 'CastError';
        error.value = 'not-an-objectid';
        next(error);
    });

    app.get('/api/invalid', (req, res, next) => {
        const error = new Error('提交的内容不合法');
        error.name = 'ValidationError';
        error.errors = { role: { message: '无效的角色类型' } };
        next(error);
    });

    app.get('/api/legacy', (req, res) => {
        // 存量成功体保持不变
        res.json({ success: true, items: [], total: 0 });
    });

    // 未知 /api 路径必须回 JSON
    app.use('/api', (req, res) => fail(res, {
        status: 404,
        code: 'ROUTE_NOT_FOUND',
        message: '接口不存在。',
        requestId: req.id,
    }));

    app.use(errorHandler);
    return app;
}

async function withServer(app, callback) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        await callback(server.address().port);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('未知 /api 路径返回 JSON 404 而不是 Express 的 HTML 页', async () => {
    await withServer(createContractApp(), async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/api/core/typo`);
        assert.equal(response.status, 404);
        assert.match(response.headers.get('content-type') || '', /application\/json/);

        const body = await response.json();
        assert.equal(body.ok, false);
        assert.equal(body.success, false);
        assert.equal(body.code, 'ROUTE_NOT_FOUND');
        assert.equal(typeof body.error, 'string');
        assert.equal(typeof body.message, 'string');
        assert.equal(typeof body.requestId, 'string');
        assert.equal(response.headers.get('x-request-id'), body.requestId);
    });
});

test('限流超限返回 JSON 429 且带 Retry-After', async () => {
    const app = express();
    app.use(requestId);
    app.use(rateLimit({
        windowMs: 60_000,
        max: 1,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, _next, options) => {
            const retryAfter = Math.ceil(options.windowMs / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            return fail(res, {
                status: options.statusCode || 429,
                code: 'RATE_LIMITED',
                message: '请求过于频繁，请稍后再试。',
                retryAfter,
                requestId: req.id,
            });
        },
    }));
    app.get('/api/ping', (req, res) => res.json({ ok: true }));

    await withServer(app, async (port) => {
        const first = await fetch(`http://127.0.0.1:${port}/api/ping`);
        assert.equal(first.status, 200);

        const second = await fetch(`http://127.0.0.1:${port}/api/ping`);
        assert.equal(second.status, 429);
        // 这一条是本次修复的核心：之前是 text/html，前端 response.json() 直接抛异常
        assert.match(second.headers.get('content-type') || '', /application\/json/);
        assert.equal(second.headers.get('retry-after'), '60');

        const body = await second.json();
        assert.equal(body.code, 'RATE_LIMITED');
        assert.equal(body.retryAfter, 60);
        assert.equal(typeof body.requestId, 'string');
    });
});

test('Mongoose CastError 与 ValidationError 映射为 400，而不是 500', async () => {
    await withServer(createContractApp(), async (port) => {
        const cast = await fetch(`http://127.0.0.1:${port}/api/cast`);
        assert.equal(cast.status, 400);
        const castBody = await cast.json();
        assert.equal(castBody.code, 'INVALID_PARAMETER');
        assert.match(castBody.message, /not-an-objectid/);

        const invalid = await fetch(`http://127.0.0.1:${port}/api/invalid`);
        assert.equal(invalid.status, 400);
        const invalidBody = await invalid.json();
        assert.equal(invalidBody.code, 'VALIDATION_FAILED');
        assert.deepEqual(invalidBody.details, [{ field: 'role', message: '无效的角色类型' }]);
    });
});

test('5xx 不回传原始错误信息', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        await withServer(createContractApp(), async (port) => {
            const response = await fetch(`http://127.0.0.1:${port}/api/boom`);
            assert.equal(response.status, 500);
            const body = await response.json();
            assert.equal(body.code, 'INTERNAL_ERROR');
            assert.equal(body.message, '服务器内部错误，请稍后重试。');
            // 不能泄露连接串、内网地址、堆栈
            assert.equal(JSON.stringify(body).includes('ECONNREFUSED'), false);
            assert.equal(JSON.stringify(body).includes('27017'), false);
            assert.equal('stack' in body, false);
        });
    } finally {
        process.env.NODE_ENV = previous;
    }
});

test('存量成功体保持原样，不被统一错误契约波及', async () => {
    await withServer(createContractApp(), async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/api/legacy`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true, items: [], total: 0 });
    });
});
