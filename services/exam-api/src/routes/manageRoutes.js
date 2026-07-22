/**
 * Admin management routes
 * All routes require authenticated admin access.
 */
const express = require('express');
const router = express.Router();
const manageController = require('../controllers/manageController');
const questionInsightsController = require('../controllers/questionInsightsController');
const { auditMutations } = require('../middleware/auditLog');
const authenticateAdmin = require('../middleware/auth');
const requireCsrfToken = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { apiLimiter, aiLimiter } = require('../middleware/rateLimiter');
const mv = require('../validators/manageValidator');

router.use(authenticateAdmin);
router.use(requireCsrfToken);
router.use(apiLimiter);
router.use(auditMutations({ actorType: 'admin' }));

router.get('/questions', validate(mv.paginationQuery), manageController.getAllQuestions);
router.get('/question-quality', validate(mv.questionQuality), questionInsightsController.getManagedQuality);
router.get(
    '/questions/:id/versions',
    validate(mv.questionVersionList),
    questionInsightsController.listManagedVersions,
);
router.get(
    '/questions/:id/versions/:revision',
    validate(mv.questionVersionParam),
    questionInsightsController.getManagedVersion,
);
router.post(
    '/questions/:id/versions/:revision/restore',
    validate(mv.questionVersionParam),
    questionInsightsController.restoreManagedVersion,
);
router.get('/questions/:id/ai-analysis', validate(mv.idParam), manageController.getQuestionAiAnalysis);
router.patch(
    '/questions/:id/ai-analysis/adopt',
    validate(mv.idParam),
    manageController.adoptQuestionAiAnalysis,
);
router.delete(
    '/questions/:id/ai-analysis',
    validate(mv.idParam),
    manageController.deleteQuestionAiAnalysis,
);
router.post('/questions', validate(mv.createQuestion), manageController.createQuestion);
router.put('/questions/:id', validate(mv.updateQuestion), manageController.updateQuestion);
router.delete('/questions/:id', validate(mv.idParam), manageController.deleteQuestion);
router.put('/categories/:id/questions', validate(mv.batchUpdateQuestions), manageController.batchUpdateQuestions);

router.get('/exam-results', validate(mv.paginationQuery), manageController.getExamResults);
router.delete('/exam-results', validate(mv.deleteExamResults), manageController.deleteExamResults);

router.get('/users', validate(mv.paginationQuery), manageController.getUsers);
router.get('/users/:openid', validate(mv.openidParam), manageController.getUserDetails);
router.get('/users/:openid/assignments', validate(mv.openidParam), manageController.getUserAssignments);
router.put('/users/:openid/assignments', validate(mv.updateUserAssignments), manageController.updateUserAssignments);
router.delete('/users', validate(mv.deleteUsers), manageController.deleteUsers);
router.delete('/users/:openid/records', validate(mv.openidParam), manageController.clearUserRecords);

router.get('/personal-categories', validate(mv.personalCategoryQuery), manageController.getPersonalCategories);
router.get(
    '/personal-categories/:id/questions',
    validate(mv.personalCategoryQuestionsQuery),
    manageController.getPersonalCategoryQuestions,
);
router.get('/personal-categories/:id', validate(mv.idParam), manageController.getPersonalCategoryById);

router.get('/feedbacks/summary', manageController.getFeedbackSummary);
router.get('/feedbacks', validate(mv.feedbackQuery), manageController.getFeedbacks);
router.post('/feedbacks/:id/reply', validate(mv.replyFeedback), manageController.replyFeedback);
router.patch('/feedbacks/:id/status', validate(mv.updateFeedbackStatus), manageController.updateFeedbackStatus);

router.get('/categories', manageController.getCategories);
router.get('/categories/:id/analysis', validate(mv.idParam), manageController.getCategoryAnalysis);
router.post(
    '/categories/:id/ai-analyses/generate',
    aiLimiter,
    validate(mv.generateAiAnalyses),
    manageController.generateCategoryAiAnalyses,
);
router.get('/categories/:id', validate(mv.idParam), manageController.getCategoryById);
router.post('/categories', validate(mv.createCategory), manageController.createCategory);
router.put('/categories/:id', validate(mv.updateCategory), manageController.updateCategory);
router.delete('/categories/:id', validate(mv.idParam), manageController.deleteCategory);
router.get('/categories/:id/shares', validate(mv.idParam), manageController.getPaperShares);
router.post('/categories/:id/shares', validate(mv.createPaperShare), manageController.createPaperShare);
router.patch('/paper-shares/:id/revoke', validate(mv.idParam), manageController.revokePaperShare);

router.get('/major-categories', manageController.getMajorCategories);
router.post('/major-categories', validate(mv.createMajorCategory), manageController.createMajorCategory);
router.put('/major-categories/:id', validate(mv.updateMajorCategory), manageController.updateMajorCategory);
router.delete('/major-categories/:id', validate(mv.idParam), manageController.deleteMajorCategory);

module.exports = router;
