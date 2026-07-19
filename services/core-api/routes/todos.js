const express = require('express');
const router = express.Router();
const { getTodos, mutateTodos, syncTodos } = require('../controllers/todoController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', getTodos);
router.post('/', syncTodos);
router.post('/mutations', mutateTodos);

module.exports = router;
