const express = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/unicomController');

const router = express.Router();
const noQuery = Joi.object({});
const idParams = Joi.object({ id: Joi.string().uuid().required() });
router.use(auth);
router.get('/session', controller.getSession);
router.get('/overview', controller.getOverview);
router.get('/details', validate({ query: noQuery, params: Joi.object({}) }), controller.getDetails);
router.get('/xinjiang/activities', validate({ query: noQuery, params: Joi.object({}) }), controller.getXinjiangActivities);
router.post('/login-sessions', validate({
    body: Joi.object({ phone: Joi.string().pattern(/^1\d{10}$/).max(11).required().messages({ 'string.pattern.base': '请输入 11 位联通手机号。' }) }),
    query: noQuery, params: Joi.object({}),
}), controller.createLogin);
router.post('/login-sessions/:id/captcha-verifications', validate({
    body: Joi.object({ ticket: Joi.string().max(4096).required(), randStr: Joi.string().max(512).required() }),
    query: noQuery, params: idParams,
}), controller.captcha);
router.post('/login-sessions/:id/verifications', validate({
    body: Joi.object({ code: Joi.string().pattern(/^\d{4,8}$/).max(8).required().messages({ 'string.pattern.base': '请输入 4 至 8 位数字短信验证码。' }) }),
    query: noQuery, params: idParams,
}), controller.verifyLogin);
router.delete('/session', validate({ body: Joi.object({}), query: noQuery, params: Joi.object({}) }), controller.disconnect);

module.exports = router;
