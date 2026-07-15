const mongoose = require('mongoose');

const platformConfigSchema = new mongoose.Schema({
    platformCode: { type: String, required: true, unique: true }, // 例如: 'mx', 'joker'
    name: { type: String, required: true }, // 例如: '蜜雪平台'
    url: { type: String, required: true }, // 接口地址
    uid: { type: String, default: '' }, // 商户UID
    secretKey: { type: String, default: '' }, // 通信Key
    status: { type: Boolean, default: true }, // 是否启用
    remark: { type: String, default: '' }, // 内部备注
    queryCount: { type: Number, default: 0 }, // API查课次数统计
    orderCount: { type: Number, default: 0 }, // API下单数统计
    createTime: { type: Number, default: Date.now },
    updateTime: { type: Number, default: Date.now }
}, { versionKey: false });

// 每次更新时自动修改 updateTime
platformConfigSchema.pre('save', function(next) {
    this.updateTime = Date.now();
    next();
});

module.exports = mongoose.model('PlatformConfig', platformConfigSchema);
