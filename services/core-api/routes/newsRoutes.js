const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

router.get('/daily', newsController.getDailyNews);

module.exports = router;
