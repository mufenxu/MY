const express = require('express');
const router = express.Router();
const consoleController = require('../controllers/consoleController');
const questionInsightsController = require('../controllers/questionInsightsController');
const { auditMutations } = require('../middleware/auditLog');
const authenticateConsole = require('../middleware/consoleAuth');
const requireCsrfToken = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { authLimiter, apiLimiter, aiLimiter } = require('../middleware/rateLimiter');
const cv = require('../validators/consoleValidator');

router.post('/auth/wechat/login', authLimiter, validate(cv.wechatAuth), consoleController.wechatLogin);

router.use(authenticateConsole);
router.use(requireCsrfToken);
router.use(apiLimiter);
router.use(auditMutations({ actorType: 'console' }));

router.get('/me', consoleController.getMe);
router.get('/overview', consoleController.getOverview);
router.get('/feedbacks/summary', consoleController.getFeedbackSummary);
router.get('/feedbacks', validate(cv.feedbackQuery), consoleController.getFeedbacks);
router.post('/feedbacks', validate(cv.createFeedback), consoleController.createFeedback);
router.patch('/feedbacks/:id/read', validate(cv.idParam), consoleController.markFeedbackReplyRead);

router.get('/major-categories', consoleController.getMajorCategories);
router.post('/major-categories', validate(cv.createMajorCategory), consoleController.createMajorCategory);
router.put('/major-categories/:id', validate(cv.updateMajorCategory), consoleController.updateMajorCategory);
router.delete('/major-categories/:id', validate(cv.idParam), consoleController.deleteMajorCategory);

router.get('/categories', consoleController.getCategories);
router.get('/categories/:id/analysis', validate(cv.idParam), consoleController.getCategoryAnalysis);
router.post(
    '/categories/:id/ai-analyses/generate',
    aiLimiter,
    validate(cv.generateAiAnalyses),
    consoleController.generateCategoryAiAnalyses,
);
router.get('/categories/:id', validate(cv.idParam), consoleController.getCategoryById);
router.post('/categories', validate(cv.createCategory), consoleController.createCategory);
router.put('/categories/:id', validate(cv.updateCategory), consoleController.updateCategory);
router.delete('/categories/:id', validate(cv.idParam), consoleController.deleteCategory);
router.get('/categories/:id/shares', validate(cv.idParam), consoleController.getPaperShares);
router.post('/categories/:id/shares', validate(cv.createPaperShare), consoleController.createPaperShare);
router.get('/paper-shares/preview', validate(cv.previewPaperShare), consoleController.previewPaperShare);
router.post('/paper-shares/accept', validate(cv.acceptPaperShare), consoleController.acceptPaperShare);
router.patch('/paper-shares/:id/revoke', validate(cv.idParam), consoleController.revokePaperShare);

router.get('/questions', validate(cv.paginationQuery), consoleController.getAllQuestions);
router.get('/question-quality', validate(cv.questionQuality), questionInsightsController.getConsoleQuality);
router.get(
    '/questions/:id/versions',
    validate(cv.questionVersionList),
    questionInsightsController.listConsoleVersions,
);
router.get(
    '/questions/:id/versions/:revision',
    validate(cv.questionVersionParam),
    questionInsightsController.getConsoleVersion,
);
router.post(
    '/questions/:id/versions/:revision/restore',
    validate(cv.questionVersionParam),
    questionInsightsController.restoreConsoleVersion,
);
router.get('/questions/:id/ai-analysis', validate(cv.idParam), consoleController.getQuestionAiAnalysis);
router.patch(
    '/questions/:id/ai-analysis/adopt',
    validate(cv.idParam),
    consoleController.adoptQuestionAiAnalysis,
);
router.delete(
    '/questions/:id/ai-analysis',
    validate(cv.idParam),
    consoleController.deleteQuestionAiAnalysis,
);
router.post('/questions', validate(cv.createQuestion), consoleController.createQuestion);
router.put('/questions/:id', validate(cv.updateQuestion), consoleController.updateQuestion);
router.delete('/questions/:id', validate(cv.idParam), consoleController.deleteQuestion);
router.put('/categories/:id/questions', validate(cv.batchUpdateQuestions), consoleController.batchUpdateQuestions);

module.exports = router;
