const { fail } = require('./respond');

const bad = { code: 'UNKNOWN_CODE' };

module.exports = (req, res) => fail(res, bad);
