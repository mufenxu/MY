const mongoose = require('mongoose');

const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = mongoose.model('RevokedAuthToken', schema);
