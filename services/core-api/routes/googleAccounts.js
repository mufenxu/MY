const express = require('express');
const auth = require('../middleware/auth');
const { getGoogleAccounts, replaceGoogleAccounts } = require('../controllers/googleAccountController');

const router = express.Router();

router.use(auth);
router.get('/', getGoogleAccounts);
router.put('/', replaceGoogleAccounts);

module.exports = router;
