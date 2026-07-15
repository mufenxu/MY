const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    remark: { type: String, default: '' },
    updateTime: { type: Number, default: Date.now }
}, { versionKey: false });

appConfigSchema.pre('save', function() {
    this.updateTime = Date.now();
});

module.exports = mongoose.model('AppConfig', appConfigSchema);
