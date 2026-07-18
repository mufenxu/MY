const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/exam_test';
process.env.EXAM_JWT_SECRET ||= 'test-jwt-secret-at-least-32-characters';

const config = require('../src/config');
const {
    generateQuestionAnalysis,
    __testing: analysisTesting,
} = require('../src/services/aiAnalysisService');
const { __testing: quotaTesting } = require('../src/services/aiGenerationGuard');

function createAtomicUsageModel() {
    let count = 0;
    return {
        get count() { return count; },
        async findOneAndUpdate(query, update) {
            const maximum = query.$or[1].generatedCount.$lte;
            const increment = update.$inc.generatedCount;
            if (count > maximum) {
                const error = new Error('duplicate quota key');
                error.code = 11000;
                throw error;
            }
            count += increment;
            return { generatedCount: count };
        },
        async updateOne(query, update) {
            if (count >= query.generatedCount.$gte) count += update.$inc.generatedCount;
        },
    };
}

test('AI quota reservation atomically rejects increments beyond the limit', async () => {
    const model = createAtomicUsageModel();
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => (
        quotaTesting.reserveUsageCounter({
            actorKey: 'user:one',
            day: '2026-07-17',
            increment: 1,
            limit: 3,
            model,
        })
    )));

    assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 3);
    assert.equal(attempts.filter((item) => item.status === 'rejected').length, 7);
    assert.equal(model.count, 3);
    assert.equal(attempts.find((item) => item.status === 'rejected').reason.statusCode, 429);

    await quotaTesting.releaseUsageCounter({
        actorKey: 'user:one',
        day: '2026-07-17',
        increment: 1,
        model,
    });
    assert.equal(model.count, 2);
});

test('AI generation single-flight shares work and releases a failed reservation once', async () => {
    const previousEnabled = config.ai.enabled;
    config.ai.enabled = false;
    analysisTesting.generationFlights.clear();
    let beforeCalls = 0;
    let afterCalls = 0;
    let released = false;
    const options = {
        question: { _id: 'question-single-flight', content: 'Question', answer: ['A'] },
        requesterOpenid: 'requester-one',
        allowUpstream: true,
        beforeUpstream: async () => {
            beforeCalls += 1;
            return { active: true };
        },
        afterUpstream: async (result, reservation) => {
            afterCalls += 1;
            released = result.generated === false && reservation.active;
        },
    };

    try {
        const results = await Promise.allSettled([
            generateQuestionAnalysis(options),
            generateQuestionAnalysis(options),
        ]);
        assert.equal(results.every((item) => item.status === 'rejected'), true);
        assert.equal(beforeCalls, 1);
        assert.equal(afterCalls, 1);
        assert.equal(released, true);
        assert.equal(analysisTesting.generationFlights.size, 0);
    } finally {
        config.ai.enabled = previousEnabled;
        analysisTesting.generationFlights.clear();
    }
});

test('AI generation single-flight performs one successful upstream request', async () => {
    const previousAi = { ...config.ai };
    const previousFetch = global.fetch;
    analysisTesting.generationFlights.clear();
    Object.assign(config.ai, {
        enabled: true,
        apiBaseUrl: 'https://ai.example.test/v1',
        apiKey: 'test-key',
        model: 'test-model',
        timeoutMs: 1000,
    });
    let fetchCalls = 0;
    let beforeCalls = 0;
    let afterCalls = 0;
    global.fetch = async () => {
        fetchCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                model: 'test-model',
                choices: [{
                    message: {
                        content: JSON.stringify({
                            answer: 'A',
                            keyPoint: '考查基础定义',
                            rationale: '题干条件与 A 的描述一致',
                            misconception: '易将相近概念混淆',
                        }),
                    },
                }],
            }),
        };
    };

    const options = {
        question: {
            _id: 'question-success-flight',
            type: 'single',
            content: '请选择正确选项',
            options: [{ label: 'A', value: '正确' }, { label: 'B', value: '错误' }],
            answer: ['A'],
        },
        requesterOpenid: 'requester-success',
        generationKey: 'user:requester-success',
        allowUpstream: true,
        beforeUpstream: async () => {
            beforeCalls += 1;
            return { active: true };
        },
        afterUpstream: async (result) => {
            afterCalls += 1;
            assert.equal(result.generated, true);
        },
    };

    try {
        const [first, second] = await Promise.all([
            generateQuestionAnalysis(options),
            generateQuestionAnalysis(options),
        ]);
        assert.deepEqual(second, first);
        assert.equal(first.generated, true);
        assert.equal(fetchCalls, 1);
        assert.equal(beforeCalls, 1);
        assert.equal(afterCalls, 1);
    } finally {
        Object.assign(config.ai, previousAi);
        global.fetch = previousFetch;
        analysisTesting.generationFlights.clear();
    }
});
