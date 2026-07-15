const mongoose = require('mongoose');

const courseCategorySchema = new mongoose.Schema({
    sort: { type: Number, default: 0 },
    name: { type: String, required: true }, // e.g. "超星学习通全包"
    price: { type: Number, default: 0 }, // 定价
    getnoun: { type: String, required: true }, // 查询参数, e.g. "3"
    noun: { type: String, required: true },    // 对接参数, e.g. "3"
    content: { type: String, default: '' },    // 说明
    queryplat: { type: String, default: 'mx' }, // 查询平台 (对应 PlatformConfig 的 platformCode)
    docking: { type: String, default: 'mx' },   // 交单平台 (对应 PlatformConfig 的 platformCode)
    yunsuan: { type: String, enum: ['+', '*'], default: '*' }, // 下单计算
    status: { type: Number, enum: [0, 1], default: 1 }, // 1 上架, 0 下架
    nock: { type: Number, enum: [0, 1], default: 0 },   // 1 是无需查课, 0 否
    suo: { type: String, default: '0' },        // 绝对价格
}, { timestamps: true });

module.exports = mongoose.model('CourseCategory', courseCategorySchema);
