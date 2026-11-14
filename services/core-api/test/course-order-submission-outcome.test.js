// 锁定「确定没提交」与「结果未知」的边界，以及管理员重新提交的约束。
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'course-order-outcome-secret';

const axios = require('axios');
const AuditLog = require('../models/AuditLog');
const CourseCategory = require('../models/CourseCategory');
const CourseOrder = require('../models/CourseOrder');
const PlatformConfig = require('../models/PlatformConfig');
const adminCourseOrderController = require('../controllers/adminCourseOrderController');
const worker = require('../services/courseOrderSubmissionWorker');
const mxPlatform = require('../utils/mxPlatform');
const { encrypt } = require('../utils/crypto');

function responseRecorder() {
    return {
        statusCode: 200,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return body; }
    };
}

async function runWorkerWith(submitOrder, order = {}) {
    const originalCategoryFind = CourseCategory.findById;
    const originalSubmit = mxPlatform.submitOrder;
    const originalOrderUpdate = CourseOrder.findOneAndUpdate;
    const updates = [];

    CourseCategory.findById = async () => ({ noun: 'platform-1', docking: 'mx' });
    mxPlatform.submitOrder = submitOrder;
    CourseOrder.findOneAndUpdate = async (_filter, update) => {
        updates.push(update.$set);
        return {};
    };

    try {
        await worker.processClaimedOrder({
            _id: 'order-1',
            tradeNo: 'WK1',
            categoryId: 'category-1',
            school: 'School',
            account: 'account',
            password: encrypt('password'),
            courseId: 'course-1',
            courseName: 'Course',
            duration: 30,
            ...order
        });
        return updates.at(-1);
    } finally {
        CourseCategory.findById = originalCategoryFind;
        mxPlatform.submitOrder = originalSubmit;
        CourseOrder.findOneAndUpdate = originalOrderUpdate;
    }
}

async function withUpstream({ config, post }, run) {
    const originalFindOne = PlatformConfig.findOne;
    const originalUpdateOne = PlatformConfig.updateOne;
    const originalPost = axios.post;
    PlatformConfig.findOne = async () => config;
    PlatformConfig.updateOne = async () => ({});
    axios.post = post;
    try {
        return await run();
    } finally {
        PlatformConfig.findOne = originalFindOne;
        PlatformConfig.updateOne = originalUpdateOne;
        axios.post = originalPost;
    }
}

const submitOptions = {
    category: { noun: '10', docking: 'mx' },
    school: 'School',
    user: 'account',
    pass: 'password',
    courseId: 'course-1',
    courseName: 'Course',
    duration: 30,
    clientTradeNo: 'WK1'
};

test('a request that never reached the upstream is reported as not accepted, not as unknown', async () => {
    const last = await runWorkerWith(async () => {
        const error = new Error('连接远程服务器失败: getaddrinfo ENOTFOUND upstream.internal');
        error.code = 'ENOTFOUND';
        error.outcomeUnknown = false;
        error.requestSent = false;
        error.publicMessage = '上游域名解析失败';
        throw error;
    });

    assert.equal(last.status, 'Failed');
    assert.equal(last.statusText, '未受理');
    assert.equal(last.remarks, '未提交到上游：上游域名解析失败');
    // 备注会展示给用户并出现在公开查询里，不能带上游域名。
    assert.doesNotMatch(last.remarks, /upstream\.internal/);
});

test('an undecryptable credential fails the order before any upstream call', async () => {
    let submissions = 0;
    const last = await runWorkerWith(async () => { submissions += 1; }, {
        password: 'enc:gcm:not-a-valid-payload'
    });

    assert.equal(submissions, 0);
    assert.equal(last.status, 'Failed');
    assert.match(last.remarks, /未提交到上游/);
});

test('code 0 without an order id keeps the upstream message for reconciliation', async () => {
    const last = await runWorkerWith(async () => ({ code: 0, msg: '所有项目不能为空' }));

    assert.equal(last.status, 'ReconcilePending');
    assert.match(last.remarks, /上游提示：所有项目不能为空/);
});

test('an upstream timeout stays unknown and names the reason', async () => {
    const last = await runWorkerWith(async () => {
        const error = new Error('连接远程服务器失败: timeout of 20000ms exceeded');
        error.code = 'ECONNABORTED';
        error.outcomeUnknown = true;
        throw error;
    });

    assert.equal(last.status, 'ReconcilePending');
    assert.match(last.remarks, /上游响应超时/);
    assert.match(last.remarks, /不会自动重投/);
});

test('connection-phase failures are classified as not sent; timeouts stay unknown', async () => {
    const config = { url: 'https://upstream.example', uid: '1', secretKey: 'k' };
    const failWith = (code) => async () => {
        const error = new Error(`${code} upstream.example`);
        error.code = code;
        throw error;
    };

    for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED']) {
        await withUpstream({ config, post: failWith(code) }, async () => {
            await assert.rejects(mxPlatform.submitOrder(submitOptions), (error) => {
                assert.equal(error.outcomeUnknown, false, code);
                assert.equal(error.requestSent, false, code);
                assert.ok(error.publicMessage, code);
                assert.doesNotMatch(error.publicMessage, /upstream\.example/);
                return true;
            });
        });
    }

    for (const code of ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET']) {
        await withUpstream({ config, post: failWith(code) }, async () => {
            await assert.rejects(mxPlatform.submitOrder(submitOptions), (error) => {
                assert.equal(error.outcomeUnknown, true, code);
                return true;
            });
        });
    }
});

test('a missing or unsupported submit channel is a definite non-submission', async () => {
    let posts = 0;
    const post = async () => { posts += 1; return { data: {} }; };

    await withUpstream({ config: null, post }, async () => {
        await assert.rejects(mxPlatform.submitOrder(submitOptions), (error) => {
            assert.equal(error.outcomeUnknown, false);
            assert.equal(error.code, 'PLATFORM_CHANNEL_UNAVAILABLE');
            return true;
        });
    });
    await withUpstream({ config: { url: 'https://upstream.example' }, post }, async () => {
        await assert.rejects(
            mxPlatform.submitOrder({ ...submitOptions, category: { noun: '10', docking: 'other' } }),
            (error) => {
                assert.equal(error.outcomeUnknown, false);
                assert.equal(error.code, 'PLATFORM_CHANNEL_UNSUPPORTED');
                return true;
            }
        );
    });
    assert.equal(posts, 0);
});

test('submit normalizes the provider url and uses the dedicated submit timeout', async () => {
    const seen = [];
    const post = async (url, _body, options) => {
        seen.push({ url, timeout: options.timeout });
        return { data: { code: 0, id: '9001' } };
    };

    for (const url of [
        'https://upstream.example',
        'https://upstream.example/',
        'https://upstream.example/api.php',
        'https://upstream.example/apisub.php'
    ]) {
        await withUpstream({ config: { url, uid: '1', secretKey: 'k' }, post }, () =>
            mxPlatform.submitOrder(submitOptions));
    }

    assert.deepEqual(
        [...new Set(seen.map((entry) => entry.url))],
        ['https://upstream.example/api.php?act=add']
    );
    assert.ok(seen.every((entry) => entry.timeout === mxPlatform.getSubmitTimeoutMs()));
});

test('submit timeout defaults to 20s and is clamped independently of the query budget', () => {
    const previous = process.env.MX_SUBMIT_TIMEOUT_MS;
    try {
        delete process.env.MX_SUBMIT_TIMEOUT_MS;
        assert.equal(mxPlatform.getSubmitTimeoutMs(), 20000);
        process.env.MX_SUBMIT_TIMEOUT_MS = '999999';
        assert.equal(mxPlatform.getSubmitTimeoutMs(), 60000);
        process.env.MX_SUBMIT_TIMEOUT_MS = '1';
        assert.equal(mxPlatform.getSubmitTimeoutMs(), 5000);
    } finally {
        if (previous === undefined) delete process.env.MX_SUBMIT_TIMEOUT_MS;
        else process.env.MX_SUBMIT_TIMEOUT_MS = previous;
    }
});

test('admin resubmit only requeues orders that never received an upstream order id', async () => {
    const originalUpdate = CourseOrder.findOneAndUpdate;
    const originalFindOne = CourseOrder.findOne;
    const originalKick = worker.kick;
    const originalAuditCreate = AuditLog.create;
    let filter;
    let update;
    let kicks = 0;
    const audits = [];

    worker.kick = () => { kicks += 1; return Promise.resolve(); };
    AuditLog.create = async (entry) => { audits.push(entry); };

    try {
        CourseOrder.findOneAndUpdate = async (receivedFilter, receivedUpdate) => {
            filter = receivedFilter;
            update = receivedUpdate;
            return { tradeNo: 'WK1', account: 'account', courseName: 'Course' };
        };
        const ok = responseRecorder();
        await adminCourseOrderController.adminResubmitOrder({
            user: { _id: 'admin-1' }, body: { tradeNo: 'WK1' }, headers: {}
        }, ok);

        assert.equal(ok.statusCode, 200);
        assert.deepEqual(filter.status, { $in: ['ReconcilePending', 'Failed'] });
        assert.deepEqual(filter.remoteOrderId, { $in: ['', null] });
        assert.deepEqual(filter.remoteOid, { $in: ['', null] });
        assert.deepEqual(filter.isManual, { $ne: true });
        assert.deepEqual(filter.submissionKey, { $type: 'string' });
        assert.equal(update.$set.status, 'Pending');
        assert.equal(kicks, 1);
        assert.equal(audits.length, 1);
        assert.equal(audits[0].action, 'COURSE_ORDER_RESUBMIT');
        assert.equal(audits[0].targetId, 'WK1');

        // 已有上游订单号：拒绝，且不触发提交任务。
        CourseOrder.findOneAndUpdate = async () => null;
        CourseOrder.findOne = () => ({
            select() { return this; },
            lean: async () => ({ status: 'ReconcilePending', remoteOrderId: '9001' })
        });
        const conflict = responseRecorder();
        await adminCourseOrderController.adminResubmitOrder({
            user: { _id: 'admin-1' }, body: { tradeNo: 'WK1' }, headers: {}
        }, conflict);
        assert.equal(conflict.statusCode, 409);
        assert.match(conflict.body.message, /已有上游订单号/);

        // 只接受字符串订单号，拒绝 {"$gt":""} 这类查询操作符对象。
        const invalid = responseRecorder();
        await adminCourseOrderController.adminResubmitOrder({
            user: { _id: 'admin-1' }, body: { tradeNo: { $gt: '' } }, headers: {}
        }, invalid);
        assert.equal(invalid.statusCode, 400);
        assert.equal(kicks, 1);
    } finally {
        CourseOrder.findOneAndUpdate = originalUpdate;
        CourseOrder.findOne = originalFindOne;
        worker.kick = originalKick;
        AuditLog.create = originalAuditCreate;
    }
});
