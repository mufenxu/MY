const mongoose = require('mongoose');
const Question = require('../models/Question');
const QuestionVersion = require('../models/QuestionVersion');
const { AppError } = require('../utils/errors');
const { ADMIN_SCOPE, PERSONAL_SCOPE } = require('../utils/libraryScope');

const SNAPSHOT_FIELDS = [
    'type',
    'content',
    'options',
    'answer',
    'analysis',
    'analysisSource',
    'categoryId',
    'sortOrder',
];

function toPlainObject(value) {
    if (value && typeof value.toObject === 'function') {
        return value.toObject();
    }
    return value || {};
}

function normalizeRevision(value) {
    const revision = Number(value);
    return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

function normalizeScopeType(value) {
    return value || ADMIN_SCOPE;
}

function normalizeOptions(options = []) {
    return options.map((option) => ({
        label: String(option?.label || ''),
        value: String(option?.value || ''),
    }));
}

function buildQuestionSnapshot(question) {
    const value = toPlainObject(question);
    return {
        type: value.type,
        content: String(value.content || ''),
        options: normalizeOptions(value.options),
        answer: Array.isArray(value.answer) ? value.answer.map(String) : [],
        analysis: String(value.analysis || ''),
        analysisSource: value.analysisSource === 'ai' ? 'ai' : 'manual',
        categoryId: value.categoryId?._id || value.categoryId,
        sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : 0,
    };
}

function comparableValue(field, value) {
    if (field === 'categoryId') return String(value || '');
    return JSON.stringify(value ?? null);
}

function getChangedFields(previousQuestion, nextQuestion) {
    if (!previousQuestion) return [...SNAPSHOT_FIELDS];
    const previous = buildQuestionSnapshot(previousQuestion);
    const next = buildQuestionSnapshot(nextQuestion);
    return SNAPSHOT_FIELDS.filter((field) => (
        comparableValue(field, previous[field]) !== comparableValue(field, next[field])
    ));
}

function buildVersionScope(question) {
    const value = toPlainObject(question);
    const scopeType = normalizeScopeType(value.scopeType);
    return {
        scopeType,
        ownerOpenid: scopeType === PERSONAL_SCOPE ? String(value.ownerOpenid || '') : null,
    };
}

function buildQuestionVersionRecord({
    question,
    previousQuestion = null,
    action,
    actor = {},
    sourceRevision = null,
}) {
    const value = toPlainObject(question);
    const revision = normalizeRevision(value.revision);
    const scope = buildVersionScope(value);
    return {
        questionId: value._id,
        revision,
        ...scope,
        snapshot: buildQuestionSnapshot(value),
        action,
        sourceRevision,
        changedFields: action === 'baseline' ? [] : getChangedFields(previousQuestion, value),
        actorType: actor.actorType || 'system',
        actorId: String(actor.actorId || ''),
        actorName: String(actor.actorName || ''),
        requestId: String(actor.requestId || '').slice(0, 128),
    };
}

function buildVersionUpsertOperations(entries) {
    return entries.map((entry) => {
        const record = buildQuestionVersionRecord(entry);
        return {
            updateOne: {
                filter: { questionId: record.questionId, revision: record.revision },
                update: { $setOnInsert: record },
                upsert: true,
            },
        };
    });
}

function isDuplicateOnlyBulkError(error) {
    if (error?.code === 11000) return true;
    return Array.isArray(error?.writeErrors)
        && error.writeErrors.length > 0
        && error.writeErrors.every((item) => item?.code === 11000);
}

async function recordQuestionVersions({
    entries,
    session = null,
    QuestionVersionModel = QuestionVersion,
}) {
    const operations = buildVersionUpsertOperations(entries);
    const chunkSize = 500;

    for (let offset = 0; offset < operations.length; offset += chunkSize) {
        const chunk = operations.slice(offset, offset + chunkSize);
        try {
            await QuestionVersionModel.bulkWrite(chunk, {
                ordered: false,
                ...(session ? { session } : {}),
            });
        } catch (error) {
            if (session) throw error;
            if (!isDuplicateOnlyBulkError(error)) throw error;
        }
    }
}

async function recordQuestionVersion({
    question,
    previousQuestion = null,
    action,
    actor = {},
    sourceRevision = null,
    session = null,
    QuestionVersionModel = QuestionVersion,
}) {
    const record = buildQuestionVersionRecord({
        question,
        previousQuestion,
        action,
        actor,
        sourceRevision,
    });

    try {
        await QuestionVersionModel.updateOne(
            { questionId: record.questionId, revision: record.revision },
            { $setOnInsert: record },
            { upsert: true, runValidators: true, ...(session ? { session } : {}) },
        );
    } catch (error) {
        // Concurrent first edits can race while inserting the same baseline.
        if (session || error?.code !== 11000) throw error;
    }
    return record;
}

function supportsTransactions(connection = mongoose.connection) {
    const topologyType = connection?.client?.topology?.description?.type;
    return topologyType && topologyType !== 'Single' && topologyType !== 'Unknown';
}

function isTransactionUnsupportedError(error) {
    const message = String(error?.message || '');
    return error?.code === 20
        || error?.codeName === 'IllegalOperation'
        || /Transaction numbers are only allowed|does not support transactions/i.test(message);
}

function transactionRequiredError() {
    const error = new AppError('Question version updates require an available MongoDB transaction.', 503);
    error.code = 'TRANSACTION_REQUIRED';
    return error;
}

async function performVersionedUpdate({
    query,
    update,
    actor,
    action,
    sourceRevision,
    current,
    session,
    afterUpdate,
    QuestionModel,
    QuestionVersionModel,
}) {
    const currentRevision = normalizeRevision(current.revision);
    const updated = await QuestionModel.findOneAndUpdate(
        buildRevisionGuard(query, currentRevision),
        {
            $set: update,
            $inc: { revision: 1 },
        },
        { new: true, runValidators: true, ...(session ? { session } : {}) },
    );

    if (!updated) {
        throw new AppError('题目已被其他操作更新，请刷新后重试', 409);
    }

    await recordQuestionVersion({
        question: current,
        action: 'baseline',
        actor,
        session,
        QuestionVersionModel,
    });
    await recordQuestionVersion({
        question: updated,
        previousQuestion: current,
        action,
        actor,
        sourceRevision,
        session,
        QuestionVersionModel,
    });
    if (afterUpdate) {
        await afterUpdate({ current, updated, session });
    }
    return updated;
}

function buildRevisionGuard(query, currentRevision) {
    const revisionConditions = [{ revision: currentRevision }];
    if (currentRevision === 1) {
        revisionConditions.push({ revision: { $exists: false } });
    }

    return {
        $and: [
            query,
            { $or: revisionConditions },
        ],
    };
}

async function updateQuestionWithVersion({
    query,
    update,
    actor,
    action = 'update',
    sourceRevision = null,
    afterUpdate = null,
    QuestionModel = Question,
    QuestionVersionModel = QuestionVersion,
    mongooseInstance = mongoose,
}) {
    const current = await QuestionModel.findOne(query);
    if (!current) return null;
    const input = {
        query,
        update,
        actor,
        action,
        sourceRevision,
        afterUpdate,
        current,
        QuestionModel,
        QuestionVersionModel,
    };
    if (!supportsTransactions(mongooseInstance.connection)) {
        if (process.env.NODE_ENV === 'production') throw transactionRequiredError();
        return performVersionedUpdate({ ...input, session: null });
    }

    const session = await mongooseInstance.startSession();
    try {
        let result = null;
        await session.withTransaction(async () => {
            result = await performVersionedUpdate({ ...input, session });
        });
        return result;
    } catch (error) {
        if (!isTransactionUnsupportedError(error)) throw error;
        if (process.env.NODE_ENV === 'production') throw transactionRequiredError();
        return performVersionedUpdate({ ...input, session: null });
    } finally {
        await session.endSession();
    }
}

module.exports = {
    SNAPSHOT_FIELDS,
    buildQuestionSnapshot,
    getChangedFields,
    buildQuestionVersionRecord,
    buildVersionUpsertOperations,
    recordQuestionVersion,
    recordQuestionVersions,
    updateQuestionWithVersion,
    __testing: {
        buildRevisionGuard,
        normalizeRevision,
        supportsTransactions,
    },
};
