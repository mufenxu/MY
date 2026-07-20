const mongoose = require('mongoose');

const courseOrderSchema = new mongoose.Schema({
    userId: { type: String, ref: 'User', required: true, index: true }, // 用户ID
    tradeNo: { type: String, required: true, unique: true }, // 本地内部订单号
    batchId: { type: String, default: '', index: true },
    submissionKey: { type: String, default: undefined },
    categoryId: { type: String, default: '' },
    platformCode: { type: String, required: true }, // 使用的通道，例如 'mx'
    platformId: { type: String, default: '' }, // 上游对应的平台分类ID（例如 1代表U校园）
    platformName: { type: String, default: '' }, // 用户下单时看到的平台名称（例如 自营学习通除考试）
    school: { type: String, default: '' }, // 学校
    account: { type: String, required: true }, // 账号/学号
    password: { type: String, required: true }, // 密码
    courseId: { type: String, default: '' }, // 课程ID
    courseName: { type: String, default: '' }, // 课程名称
    duration: { type: Number, default: 0 }, // 购买的时长（如有要求，例如30h就是30）
    remoteOrderId: { type: String, default: '' }, // 上游返回的订单ID（提交时返回的id，即平台oid）
    remoteOid: { type: String, default: '' }, // MX平台内部订单号oid（手动录入时填写，chadan2使用此字段）
    status: { 
        type: String, 
        enum: ['Pending', 'Submitting', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Refushing', 'ReconcilePending', 'Unknown'],
        default: 'Pending' 
    }, // 英文状态：待处理，进行中，已完成，异常等
    statusText: { type: String, default: '待处理' }, // 中文状态，直接同步上游
    progress: { type: String, default: '0%' }, // 当前进度，如 85%
    remarks: { type: String, default: '' }, // 附加节点/备注信息，如"正在完成视频"
    price: { type: Number, default: 0 }, // 订单价格/扣费
    isMiaoshua: { type: Boolean, default: false }, // 是否为秒刷
    isManual: { type: Boolean, default: false }, // 是否为管理员手动录入
    isHidden: { type: Boolean, default: false }, // 是否在小程序端隐藏
    submitAttempts: { type: Number, default: 0 },
    lastSubmitAttemptAt: { type: Number, default: 0 },
    createTime: { type: Number, default: Date.now },
    updateTime: { type: Number, default: Date.now }
}, { versionKey: false });

// 每次更新时自动修改 updateTime
courseOrderSchema.pre('save', function() {
    this.updateTime = Date.now();
});

// 建立索引优化查询速度。tradeNo 的 unique 属性已创建其唯一索引。
courseOrderSchema.index(
    { submissionKey: 1 },
    {
        unique: true,
        name: 'course_submission_key_unique',
        partialFilterExpression: { submissionKey: { $type: 'string' } }
    }
);
courseOrderSchema.index({ remoteOrderId: 1 });
courseOrderSchema.index({ userId: 1, createTime: -1 });
courseOrderSchema.index({ status: 1, createTime: -1 });
courseOrderSchema.index({ status: 1, lastSubmitAttemptAt: 1 });
courseOrderSchema.index({ account: 1, createTime: -1 });
courseOrderSchema.index({ school: 1, createTime: -1 });
courseOrderSchema.index({ isHidden: 1, createTime: -1 });

module.exports = mongoose.model('CourseOrder', courseOrderSchema);
