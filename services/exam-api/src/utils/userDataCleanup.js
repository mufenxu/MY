const AiQuestionAnalysis = require('../models/AiQuestionAnalysis');
const Question = require('../models/Question');
const { PERSONAL_SCOPE } = require('./libraryScope');

function normalizeOpenids(openids = []) {
    return [...new Set(
        (Array.isArray(openids) ? openids : [openids])
            .map((openid) => String(openid || '').trim())
            .filter(Boolean),
    )];
}

async function cleanupAiAnalysesForDeletedUsers(openids = []) {
    const normalizedOpenids = normalizeOpenids(openids);
    if (normalizedOpenids.length === 0) {
        return;
    }

    const ownedQuestions = await Question.find({
        scopeType: PERSONAL_SCOPE,
        ownerOpenid: { $in: normalizedOpenids },
    })
        .select('_id')
        .lean();
    const ownedQuestionIds = ownedQuestions.map((question) => String(question._id));
    const deleteConditions = [
        { ownerOpenid: { $in: normalizedOpenids } },
    ];

    if (ownedQuestionIds.length > 0) {
        deleteConditions.push({ questionId: { $in: ownedQuestionIds } });
    }

    await Promise.all([
        AiQuestionAnalysis.deleteMany({ $or: deleteConditions }),
        AiQuestionAnalysis.updateMany(
            { generatedByOpenid: { $in: normalizedOpenids } },
            { $set: { generatedByOpenid: '' } },
        ),
    ]);
}

module.exports = {
    cleanupAiAnalysesForDeletedUsers,
};
