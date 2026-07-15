/**
 * 敏感数据加解密工具
 * 使用 AES-256-GCM 对称加密保护数据库中的敏感字段（如第三方平台密码）
 * 对旧数据提供 CryptoJS AES 的向下兼容解密支持
 */
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

// 加密密钥：优先使用独立的 ENCRYPTION_KEY，降级到 JWT_SECRET 以实现向后兼容
const RAW_KEY = process.env.ENCRYPTION_KEY || process.env.CORE_JWT_SECRET || process.env.JWT_SECRET;

if (!RAW_KEY) {
    throw new Error('FATAL ERROR: ENCRYPTION_KEY or JWT_SECRET must be defined for data encryption.');
}

// 派生出 32 字节的 AES-256 密钥（通过 sha256 确保长度和格式安全）
const AES_KEY = crypto.createHash('sha256').update(RAW_KEY).digest();

const OLD_PREFIX = 'enc:';
const NEW_PREFIX = 'enc:gcm:';
const ALGORITHM = 'aes-256-gcm';

/**
 * 加密字符串
 * @param {string} plainText - 明文
 * @returns {string} 加密后的字符串（带新前缀标识）
 */
function encrypt(plainText) {
    if (!plainText) return plainText;
    // 如果已经用新算法或旧算法加密过，直接返回
    if (plainText.startsWith(NEW_PREFIX) || plainText.startsWith(OLD_PREFIX)) return plainText;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, AES_KEY, iv);
    
    let encrypted = cipher.update(plainText, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    // 格式：enc:gcm:IV(12字节hex):TAG(16字节hex):密文(base64)
    return `${NEW_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`;
}

/**
 * 解密字符串
 * @param {string} cipherText - 密文
 * @returns {string} 解密后的明文
 */
function decrypt(cipherText) {
    if (!cipherText) return cipherText;

    // 1. 新版 AES-256-GCM 格式解密
    if (cipherText.startsWith(NEW_PREFIX)) {
        try {
            const parts = cipherText.slice(NEW_PREFIX.length).split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encryption format parts');
            }
            const iv = Buffer.from(parts[0], 'hex');
            const tag = Buffer.from(parts[1], 'hex');
            const encryptedText = Buffer.from(parts[2], 'base64');

            const decipher = crypto.createDecipheriv(ALGORITHM, AES_KEY, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        } catch (err) {
            throw new Error(`Failed to decrypt using AES-256-GCM: ${err.message}`);
        }
    }

    // 2. 旧版 CryptoJS 格式解密
    if (cipherText.startsWith(OLD_PREFIX)) {
        try {
            const encrypted = cipherText.slice(OLD_PREFIX.length);
            const bytes = CryptoJS.AES.decrypt(encrypted, RAW_KEY);
            return bytes.toString(CryptoJS.enc.Utf8);
        } catch (err) {
            throw new Error(`Failed to decrypt using old CryptoJS: ${err.message}`);
        }
    }

    // 没有加密前缀，说明是明文数据，直接返回
    return cipherText;
}

/**
 * 判断是否已加密
 * @param {string} text
 * @returns {boolean}
 */
function isEncrypted(text) {
    return text && (text.startsWith(NEW_PREFIX) || text.startsWith(OLD_PREFIX));
}

module.exports = { encrypt, decrypt, isEncrypted };
