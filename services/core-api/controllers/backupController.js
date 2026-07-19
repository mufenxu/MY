const mongoose = require('mongoose');
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const asyncHandler = require('../middleware/asyncHandler');
const logAudit = require('../utils/auditLogger');
const logger = require('../utils/logger');
const { clearAll: clearAllAccessCache } = require('../middleware/authorizeAccess');
const { acquirePrivilegedMutationLock } = require('../utils/privilegedMutationLock');
const { prepareRestoredUsers } = require('../utils/backupSecurity');

const MAX_RESTORE_OUTPUT_BYTES = 100 * 1024 * 1024;
const EXCLUDED_BACKUP_MODELS = new Set([
    'AuditLog',
    'TuyaDeviceLog',
    'RefreshToken',
    'SecretCache',
    'AuthScanLog',
    'PrivilegedMutationLock'
]);
const { encrypt } = require('../utils/crypto');

const BACKUP_SECRET_FIELDS = {
    NotifyConfig: ['smtpPass', 'qywxApiKey'],
    AppClient: ['secret'],
    PlatformConfig: ['secretKey']
};

function protectBackupDocuments(modelName, docs) {
    const fields = BACKUP_SECRET_FIELDS[modelName];
    if (!fields || !Array.isArray(docs)) return docs;

    return docs.map((doc) => {
        const protectedDoc = { ...doc };
        for (const field of fields) {
            if (protectedDoc[field]) protectedDoc[field] = encrypt(String(protectedDoc[field]));
        }
        return protectedDoc;
    });
}

/**
 * 备份数据 (导出为 json.gz)
 * @route   POST /api/settings/backup
 * @access  Private (super_admin)
 */
exports.exportBackup = asyncHandler(async (req, res) => {
    const backupData = {};
    const modelNames = mongoose.modelNames();

    // 排除的集合（日志类、会话Token类、临时密钥类不需要备份）
    for (const name of modelNames) {
        if (EXCLUDED_BACKUP_MODELS.has(name)) {
            continue;
        }

        const model = mongoose.model(name);
        let docs;

        if (name === 'User') {
            // 对 User 模型，必须主动加上 select('+password ...') 获取哈希密码，否则恢复后会导致所有管理员无法登录！
            docs = await model.find({}).select('+password +failedLoginAttempts +lockUntil').lean();
        } else if (name === 'AppClient') {
            docs = await model.find({}).select('+secret').lean();
        } else {
            docs = await model.find({}).lean();
        }

        backupData[name] = protectBackupDocuments(name, docs);
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
        res.setHeader('Cache-Control', 'no-store');
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
    zlib.gunzip(gzipBuffer, { maxOutputLength: MAX_RESTORE_OUTPUT_BYTES }, async (err, decompressed) => {
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
        if (!backupData || typeof backupData !== 'object' || Array.isArray(backupData)) {
            return res.status(400).json({ success: false, error: '备份文件顶层数据格式不正确' });
        }

        let releaseMutationLock;
        try {
            releaseMutationLock = await acquirePrivilegedMutationLock();
        } catch (lockError) {
            const statusCode = lockError.statusCode === 503 ? 503 : 500;
            return res.status(statusCode).json({ success: false, error: lockError.message });
        }
        let session;
        try {
            session = await mongoose.startSession();
            session.startTransaction();
            const restoredCollections = [];
            const currentUsers = await User.find({})
                .select('_id tokenVersion')
                .session(session)
                .lean();
            const currentUserVersions = new Map(currentUsers.map((user) => [
                String(user._id),
                user.tokenVersion
            ]));

            // 循环遍历备份数据并写回数据库
            for (const [modelName, docs] of Object.entries(backupData)) {
                if (!mongoose.modelNames().includes(modelName) || EXCLUDED_BACKUP_MODELS.has(modelName)) {
                    continue;
                }
                if (!Array.isArray(docs)) {
                    const error = new Error(`备份集合 ${modelName} 的数据格式无效`);
                    error.statusCode = 400;
                    throw error;
                }

                const model = mongoose.model(modelName);
                const documentsToInsert = modelName === 'User'
                    ? prepareRestoredUsers(docs, currentUserVersions)
                    : docs;
                
                // 清空当前集合中的旧数据
                await model.deleteMany({}, { session });

                // 批量插入备份的数据
                if (documentsToInsert.length > 0) {
                    await model.insertMany(documentsToInsert, { session });
                }
                
                restoredCollections.push(modelName);
            }

            // Refresh tokens are intentionally never restored. Any access token
            // issued before the restore is invalidated by a tokenVersion bump.
            await RefreshToken.deleteMany({}, { session });
            if (!restoredCollections.includes('User')) {
                await User.updateMany({}, { $inc: { tokenVersion: 1 } }, { session });
            }

            // 提交事务
            await session.commitTransaction();
            clearAllAccessCache();

            // 记录恢复成功审计日志
            try {
                await logAudit(req, {
                    action: 'BACKUP_RESTORE_SUCCESS',
                    result: 'success',
                    payload: { collections: restoredCollections }
                });
            } catch (auditError) {
                logger.error('Restore succeeded but audit logging failed:', auditError);
            }

            res.json({ success: true, message: '数据已成功恢复！' });
        } catch (dbErr) {
            // 回滚事务
            if (session?.inTransaction()) await session.abortTransaction();

            logger.error('Database restore operation failed:', dbErr);
            try {
                await logAudit(req, {
                    action: 'BACKUP_RESTORE_FAILURE',
                    result: 'failure',
                    payload: { reason: dbErr.message }
                });
            } catch (auditError) {
                logger.error('Restore failure audit logging failed:', auditError);
            }
            const statusCode = dbErr.statusCode === 400 ? 400 : 500;
            res.status(statusCode).json({ success: false, error: `数据库恢复失败: ${dbErr.message}` });
        } finally {
            await session?.endSession();
            await releaseMutationLock();
        }
    });
});

exports.protectBackupDocuments = protectBackupDocuments;
