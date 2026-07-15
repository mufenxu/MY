const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // entity name (e.g., 'userId')
    seq: { type: Number, default: 10000 }  // start from 10000
});

module.exports = mongoose.model('Counter', counterSchema);
