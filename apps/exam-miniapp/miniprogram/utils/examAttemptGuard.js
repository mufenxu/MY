function requiresServerExamAttempt(mode, sourceType) {
    return mode === 'exam' && sourceType === 'personal';
}

function canUseExamSession(mode, sourceType, attemptInitialized) {
    return !requiresServerExamAttempt(mode, sourceType) || Boolean(attemptInitialized);
}

module.exports = { canUseExamSession, requiresServerExamAttempt };
