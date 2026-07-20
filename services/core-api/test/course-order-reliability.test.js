const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CORE_JWT_SECRET = process.env.CORE_JWT_SECRET || 'course-order-reliability-secret';

const CourseCategory = require('../models/CourseCategory');
const CourseOrder = require('../models/CourseOrder');
const CourseOrderBatch = require('../models/CourseOrderBatch');
const courseOrderController = require('../controllers/courseOrderController');
const adminCourseOrderController = require('../controllers/adminCourseOrderController');
const worker = require('../services/courseOrderSubmissionWorker');
const mxPlatform = require('../utils/mxPlatform');
const { encrypt } = require('../utils/crypto');
const { submitOrderSchema } = require('../schemas/courseOrderSchemas');

function responseRecorder() {
    return {
        statusCode: 200,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = String(value); },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return body; }
    };
}

function requestFor(body) {
    return {
        user: { _id: 'user-1' },
        body,
        get() { return undefined; }
    };
}

test('course order schema enforces the batch ceiling', () => {
    const payload = {
        user: 'account',
        pass: 'password',
        categoryId: 'category-1',
        courseList: Array.from({ length: 21 }, (_, index) => ({ id: String(index), name: `Course ${index}` }))
    };
    const result = submitOrderSchema.validate(payload);
    assert.match(result.error.message, /最多提交20门课程/);
});

test('trade numbers use one unique index definition', () => {
    const indexes = CourseOrder.schema.indexes().filter(([fields]) => fields.tradeNo === 1);

    assert.equal(indexes.length, 1);
    assert.equal(indexes[0][1].unique, true);
});

test('same order idempotency key returns the original queued order', async () => {
    const originalCategoryFind = CourseCategory.findById;
    const originalBatchUpdate = CourseOrderBatch.findOneAndUpdate;
    const originalBatchFind = CourseOrderBatch.findOne;
    const originalOrderUpdate = CourseOrder.findOneAndUpdate;
    const originalOrderFind = CourseOrder.findOne;
    const originalKick = worker.kick;
    let batch = null;
    const orders = new Map();

    CourseCategory.findById = async () => ({
        _id: 'category-1', noun: 'platform-1', docking: 'mx', name: 'Platform'
    });
    CourseOrderBatch.findOneAndUpdate = async (_filter, update) => {
        batch ||= { ...update.$setOnInsert };
        return batch;
    };
    CourseOrderBatch.findOne = async () => batch;
    CourseOrder.findOneAndUpdate = async (filter, update) => {
        if (!orders.has(filter.submissionKey)) {
            orders.set(filter.submissionKey, { _id: `order-${orders.size + 1}`, ...update.$setOnInsert });
        }
        return orders.get(filter.submissionKey);
    };
    CourseOrder.findOne = async (filter) => orders.get(filter.submissionKey);
    worker.kick = () => Promise.resolve();

    const body = {
        school: 'School',
        user: 'account',
        pass: 'password',
        categoryId: 'category-1',
        courseList: [{ id: 'course-1', name: 'Course 1' }],
        duration: 30,
        idempotencyKey: 'client-key-1234567890'
    };
    const first = responseRecorder();
    const second = responseRecorder();

    try {
        await courseOrderController.submitOrder(requestFor(body), first);
        await courseOrderController.submitOrder(requestFor(body), second);
        assert.equal(first.statusCode, 202);
        assert.equal(second.statusCode, 202);
        assert.equal(first.body.data.orders[0].tradeNo, second.body.data.orders[0].tradeNo);
        assert.equal(first.body.data.duplicate, false);
        assert.equal(second.body.data.duplicate, true);
        assert.match(first.headers.location, /^\/api\/course-order\/batch\/[0-9a-f-]{36}$/);
        assert.equal(orders.size, 1);

        const conflict = responseRecorder();
        await courseOrderController.submitOrder(requestFor({
            ...body,
            courseList: [{ id: 'course-2', name: 'Different course' }]
        }), conflict);
        assert.equal(conflict.statusCode, 409);
        assert.equal(conflict.body.code, 'ORDER_IDEMPOTENCY_CONFLICT');
    } finally {
        CourseCategory.findById = originalCategoryFind;
        CourseOrderBatch.findOneAndUpdate = originalBatchUpdate;
        CourseOrderBatch.findOne = originalBatchFind;
        CourseOrder.findOneAndUpdate = originalOrderUpdate;
        CourseOrder.findOne = originalOrderFind;
        worker.kick = originalKick;
    }
});

test('unknown upstream outcome is held for reconciliation and never reported failed-retryable', async () => {
    const originalCategoryFind = CourseCategory.findById;
    const originalSubmit = mxPlatform.submitOrder;
    const originalOrderUpdate = CourseOrder.findOneAndUpdate;
    const updates = [];
    let submissions = 0;

    CourseCategory.findById = async () => ({ noun: 'platform-1', docking: 'mx' });
    mxPlatform.submitOrder = async () => {
        submissions += 1;
        const error = new Error('timeout');
        error.outcomeUnknown = true;
        error.code = 'ETIMEDOUT';
        throw error;
    };
    CourseOrder.findOneAndUpdate = async (filter, update) => {
        assert.equal(filter.status, 'Submitting');
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
            duration: 30
        });
        assert.equal(submissions, 1);
        assert.equal(updates.at(-1).status, 'ReconcilePending');
        assert.match(updates.at(-1).remarks, /不会自动重投/);
    } finally {
        CourseCategory.findById = originalCategoryFind;
        mxPlatform.submitOrder = originalSubmit;
        CourseOrder.findOneAndUpdate = originalOrderUpdate;
    }
});

test('legacy pending orders are quarantined instead of entering the new submission worker', async () => {
    const originalUpdateMany = CourseOrder.updateMany;
    let captured;
    CourseOrder.updateMany = async (filter, update) => {
        captured = { filter, update };
        return { modifiedCount: 1 };
    };

    try {
        await worker.recoverLegacyPendingOrders();
        assert.equal(captured.filter.status, 'Pending');
        assert.deepEqual(captured.filter.$or, [
            { submissionKey: { $exists: false } },
            { submissionKey: { $not: { $type: 'string' } } },
            { batchId: { $exists: false } },
            { batchId: '' }
        ]);
        assert.equal(captured.update.$set.status, 'ReconcilePending');
        assert.match(captured.update.$set.remarks, /不会自动重投/);
    } finally {
        CourseOrder.updateMany = originalUpdateMany;
    }
});

test('manual order APIs cannot create or restore automatic submission states', async () => {
    const originalCategoryFind = CourseCategory.findById;
    const originalOrderFind = CourseOrder.findOne;
    CourseCategory.findById = async () => ({ _id: 'category-1', noun: 'platform-1', docking: 'mx', name: 'Platform' });
    CourseOrder.findOne = async () => ({ tradeNo: 'WK1', status: 'Processing' });

    try {
        const createResponse = responseRecorder();
        await adminCourseOrderController.adminCreateOrder({
            user: { _id: 'admin-1' },
            body: { account: 'account', password: 'password', categoryId: 'category-1', status: 'Pending' }
        }, createResponse);
        assert.equal(createResponse.statusCode, 400);

        const updateResponse = responseRecorder();
        await adminCourseOrderController.adminUpdateOrder({
            params: { tradeNo: 'WK1' },
            body: { status: 'Pending' }
        }, updateResponse);
        assert.equal(updateResponse.statusCode, 400);
    } finally {
        CourseCategory.findById = originalCategoryFind;
        CourseOrder.findOne = originalOrderFind;
    }
});

test('batch status lookup is scoped to the authenticated owner', async () => {
    const originalBatchFind = CourseOrderBatch.findOne;
    const originalOrderFind = CourseOrder.find;
    let batchFilter;
    CourseOrderBatch.findOne = (filter) => {
        batchFilter = filter;
        return { lean: async () => ({ batchId: filter.batchId, orderCount: 1 }) };
    };
    CourseOrder.find = () => ({
        select() { return this; },
        sort() { return this; },
        lean: async () => [{ tradeNo: 'WK1', status: 'ReconcilePending' }]
    });
    const response = responseRecorder();

    try {
        await courseOrderController.getOrderBatchStatus({
            user: { _id: 'owner-1' },
            params: { batchId: '123e4567-e89b-42d3-a456-426614174000' }
        }, response);
        assert.deepEqual(batchFilter, {
            batchId: '123e4567-e89b-42d3-a456-426614174000',
            userId: 'owner-1'
        });
        assert.equal(response.body.data.state, 'attention_required');
    } finally {
        CourseOrderBatch.findOne = originalBatchFind;
        CourseOrder.find = originalOrderFind;
    }
});

test('upstream timeout remains below the synchronous gateway budget by default', () => {
    const previous = process.env.MX_REQUEST_TIMEOUT_MS;
    try {
        delete process.env.MX_REQUEST_TIMEOUT_MS;
        assert.equal(mxPlatform.getRequestTimeoutMs(), 10000);
        process.env.MX_REQUEST_TIMEOUT_MS = '99999';
        assert.equal(mxPlatform.getRequestTimeoutMs(), 14000);
    } finally {
        if (previous === undefined) delete process.env.MX_REQUEST_TIMEOUT_MS;
        else process.env.MX_REQUEST_TIMEOUT_MS = previous;
    }
});
