const mongoose = require('mongoose');
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const logAudit = require('../utils/auditLogger');
const logger = require('../utils/logger');

/**
 * 备份数据 (导出为 json.gz)
 * @route   POST /api/settings/backup
 * @access  Private (super_admin)
 */
exports.exportBackup = asyncHandler(async (req, res) => {
    const backupData = {};
    const modelNames = mongoose.modelNames();

    // 排除的集合（日志类、会话Token类、临时密钥类不需要备份）
    const excludeModels = ['AuditLog', 'TuyaDeviceLog', 'RefreshToken', 'SecretCache', 'AuthScanLog'];

    for (const name of modelNames) {
        if (excludeModels.includes(name)) {
            continue;
        }

        const model = mongoose.model(name);
        let docs;

        if (name === 'User') {
            // 对 User 模型，必须主动加上 select('+password ...') 获取哈希密码，否则恢复后会导致所有管理员无法登录！
            docs = await model.find({}).select('+password +failedLoginAttempts +lockUntil').lean();
        } else {
            docs = await model.find({}).lean();
        }

        backupData[name] = docs;
    }

    const jsonStr = JSON.stringify(backupData);
    
    zlib.gzip(jsonStr, async (err, buffer) => {
        if (err) {
            logger.error('Gzip compression failed during backup:', err);
            return res.status(500).json({ success: false, error: '压缩备份数据失败' });
        }

        // 审计日志记录备份操作
        await logAudit(req, {
            action: 'BACKUP_EXPORT',
            result: 'success',
            payload: { collections: Object.keys(backupData) }
        });

        // 以二进制流形式让前端下载
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename=backup_${Date.now()}.json.gz`);
        res.send(buffer);
    });
});

/**
 * 恢复数据 (上传 json.gz 文件并还原)
 * @route   POST /api/settings/restore
 * @access  Private (super_admin)
 */
exports.importRestore = asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ success: false, error: '请输入管理员密码以校验身份' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, error: '请选择并上传备份文件' });
    }

    // 1. 验证管理员密码（防止通过被盗身份Token进行高危操作）
    const adminUser = await User.findById(req.user._id || req.user.id).select('+password');
    if (!adminUser) {
        return res.status(404).json({ success: false, error: '管理员用户不存在' });
    }

    // 防护：如果该管理员用户根本没有设置网页端登录密码（如仅使用微信登录而未初始化密码）
    if (!adminUser.password) {
        await logAudit(req, {
            action: 'BACKUP_RESTORE_FAILURE',
            result: 'failure',
            payload: { reason: 'Admin password not set in database' }
        });
        return res.status(400).json({ 
            success: false, 
            error: '您的超级管理员账号尚未设置网页登录密码，请先前往“安全设置”页设置密码后再执行数据恢复。' 
        });
    }

    const isMatch = await bcrypt.compare(password, adminUser.password);
    if (!isMatch) {
        await logAudit(req, {
            action: 'BACKUP_RESTORE_FAILURE',
            result: 'failure',
            payload: { reason: 'Password verification failed' }
        });
        return res.status(403).json({ success: false, error: '管理员密码错误，操作被拒绝' });
    }

    // 2. 解压并导入数据
    const gzipBuffer = req.file.buffer;
    zlib.gunzip(gzipBuffer, async (err, decompressed) => {
        if (err) {
            logger.error('Gzip decompression failed during restore:', err);
            return res.status(400).json({ success: false, error: '备份压缩包无效或已损坏' });
        }

        let backupData;
        try {
            backupData = JSON.parse(decompressed.toString());
        } catch (parseErr) {
            logger.error('JSON parse failed during restore:', parseErr);
            return res.status(400).json({ success: false, error: '备份文件数据格式不正确' });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const restoredCollections = [];

            // 循环遍历备份数据并写回数据库
            for (const [modelName, docs] of Object.entries(backupData)) {
                if (!mongoose.modelNames().includes(modelName)) {
                    continue;
                }

                const model = mongoose.model(modelName);
                
                // 清空当前集合中的旧数据
                await model.deleteMany({}, { session });

                // 批量插入备份的数据
                if (docs && docs.length > 0) {
                    await model.insertMany(docs, { session });
                }
                
                restoredCollections.push(modelName);
            }

            // 提交事务
            await session.commitTransaction();
            session.endSession();

            // 记录恢复成功审计日志
            await logAudit(req, {
                action: 'BACKUP_RESTORE_SUCCESS',
                result: 'success',
                payload: { collections: restoredCollections }
            });

            res.json({ success: true, message: '数据已成功恢复！' });
        } catch (dbErr) {
            // 回滚事务
            await session.abortTransaction();
            session.endSession();

            logger.error('Database restore operation failed:', dbErr);
            await logAudit(req, {
                action: 'BACKUP_RESTORE_FAILURE',
                result: 'failure',
                payload: { reason: dbErr.message }
            });
            res.status(500).json({ success: false, error: `数据库恢复失败: ${dbErr.message}` });
        }
    });
});
