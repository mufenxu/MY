const express = require('express');
const router = express.Router();
const {
    getUsers,
    getMe,
    updateMe,
    updateUser,
    deleteUser
} = require('../controllers/userController');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { updateMeSchema, updateUserSchema } = require('../schemas/userSchemas');

router.use(auth.verifyToken);

// 个人信息接口 - 所有已认证用户可访问
router.get('/me', getMe);
router.put('/me', validate(updateMeSchema), updateMe);

// 用户管理接口 - 仅限管理员
router.get('/', authorize('admin', 'super_admin'), getUsers);
router.put('/:id', authorize('admin', 'super_admin'), validate(updateUserSchema), updateUser);
router.delete('/:id', authorize('super_admin'), deleteUser);

module.exports = router;

