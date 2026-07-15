const mongoose = require('mongoose');

const tuyaDeviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    online: { type: Boolean, default: false },
    status: [{
        code: String,
        value: mongoose.Schema.Types.Mixed,
        updatedAt: { type: Date, default: Date.now }
    }],
    lastMessageAt: { type: Date, default: Date.now },
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now },

    // --- 自动化配置 ---
    automation: {
        smartSchedule: {
            enabled: { type: Boolean, default: false },
            valleyTemp: { type: Number, default: 50 }, // 谷电储能温度
            peakTemp: { type: Number, default: 45 }    // 峰电保温温度
        },
        heatSchedule: {
            enabled: { type: Boolean, default: false },
            periods: [{
                id: String,
                startTime: String,  // "HH:MM"
                endTime: String,    // "HH:MM"
                targetTemp: Number
            }]
        },
        location: {
            latitude: Number,
            longitude: Number,
            name: String
        }
    }
}, { versionKey: false });

// 辅助方法：快速获取特定 DP 的值
tuyaDeviceSchema.methods.getDpValue = function (code) {
    const item = this.status.find(s => s.code === code);
    return item ? item.value : undefined;
};

module.exports = mongoose.model('TuyaDevice', tuyaDeviceSchema);
