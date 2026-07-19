/**
 * Client routes (mini program)
 */
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const validate = require('../middleware/validate');
const { clientLimiter, aiLimiter } = require('../middleware/rateLimiter');
const authenticateUser = require('../middleware/clientAuth');
const optionalClientAuth = require('../middleware/optionalClientAuth');
const cv = require('../validators/clientValidator');
const scanLoginController = require('../controllers/scanLoginController');

router.use(clientLimiter);

// Public APIs
router.post('/api/user/login', validate(cv.userLogin), clientController.userLogin);
router.get('/categories', validate(cv.getCategories), clientController.getCategories);
router.get('/questions', optionalClientAuth, validate(cv.getQuestions), clientController.getQuestions);
router.get('/question-search', validate(cv.questionSearch), clientController.searchQuestions);
router.get('/major-categories', clientController.getMajorCategories);
router.post('/demo/exam/preview-submit', optionalClientAuth, validate(cv.submitExam), clientController.previewDemoExam);

// Authenticated APIs
router.post('/api/user/scan-login/scan', authenticateUser, validate(cv.scanLoginQrCode), scanLoginController.scanQrCode);
router.post('/api/user/scan-login/confirm', authenticateUser, validate(cv.scanLoginQrCode), scanLoginController.confirmQrCode);
router.get('/my/major-categories', authenticateUser, clientController.getMyMajorCategories);
router.get('/my/categories', authenticateUser, validate(cv.getCategories), clientController.getMyCategories);
router.get('/my/questions', authenticateUser, validate(cv.getQuestions), clientController.getMyQuestions);
router.get('/my/question-search', authenticateUser, validate(cv.questionSearch), clientController.searchMyQuestions);
router.get('/api/user/paper-shares/preview', authenticateUser, validate(cv.previewPaperShare), clientController.previewPaperShare);
router.post('/api/user/paper-shares/accept', authenticateUser, validate(cv.acceptPaperShare), clientController.acceptPaperShare);
router.get('/api/user/console-profile', authenticateUser, clientController.getConsoleProfile);
router.get('/api/user/ai/status', authenticateUser, clientController.getAiAnalysisStatus);
router.post(
    '/api/user/ai/question-analysis',
    authenticateUser,
    aiLimiter,
    validate(cv.aiQuestionAnalysis),
    clientController.analyzeQuestion,
);
router.post('/exam/submit', authenticateUser, validate(cv.submitExam), clientController.submitExam);
router.post('/exam/attempt', authenticateUser, validate(cv.startExamAttempt), clientController.startExamAttempt);
router.get('/exam/latest', authenticateUser, validate(cv.getLatestResult), clientController.getLatestResult);
router.post('/exam/progress', authenticateUser, validate(cv.saveProgress), clientController.saveProgress);
router.get('/exam/progress', authenticateUser, validate(cv.getProgress), clientController.getProgress);
router.delete('/exam/progress', authenticateUser, validate(cv.clearProgress), clientController.clearProgress);
router.get('/wrong-questions', authenticateUser, validate(cv.getWrongQuestions), clientController.getWrongQuestions);
router.get('/wrong-questions/:categoryId', authenticateUser, validate(cv.wrongQuestionsByCategory), clientController.getWrongQuestionsByCategory);
router.post('/wrong-questions/:questionId/state', authenticateUser, validate(cv.wrongQuestionState), clientController.updateWrongQuestionState);
router.post('/api/user/profile', authenticateUser, validate(cv.updateProfile), clientController.updateProfile);
router.get('/api/user/summary', authenticateUser, validate(cv.getUserSummary), clientController.getUserSummary);
router.get('/api/user/study-report', authenticateUser, validate(cv.getStudyReport), clientController.getStudyReport);
router.get('/api/user/exam-history', authenticateUser, validate(cv.getExamHistory), clientController.getExamHistory);
router.delete('/api/user/account', authenticateUser, clientController.deleteAccount);

module.exports = router;
