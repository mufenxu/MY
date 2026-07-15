const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { runNow } = require('../services/cronScheduler');

router.post('/run-now', auth.verifyToken, async (req, res, next) => {
    try {
        const result = await runNow();
        res.json({ success: true, result });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
