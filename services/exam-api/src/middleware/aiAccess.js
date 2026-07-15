const { ForbiddenError } = require('../utils/errors');
const {
    CONSOLE_ADMIN_ROLES,
    hasAdminCatalogAccess,
} = require('../utils/adminAccess');

const AI_CONSOLE_ADMIN_ROLES = CONSOLE_ADMIN_ROLES;

async function canUseQuestionAiAnalysis(openid) {
    return hasAdminCatalogAccess(openid);
}

async function requireQuestionAiAnalysisAdmin(req, res, next) {
    const allowed = await canUseQuestionAiAnalysis(req.user?.openid);
    if (!allowed) {
        throw new ForbiddenError('仅管理员可使用 AI 解析');
    }

    next();
}

module.exports = {
    AI_CONSOLE_ADMIN_ROLES,
    canUseQuestionAiAnalysis,
    requireQuestionAiAnalysisAdmin,
};
