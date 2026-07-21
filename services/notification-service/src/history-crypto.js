const crypto = require('crypto');

function decodeEncryptionKey(value) {
  const source = String(value || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(source)) key = Buffer.from(source, 'hex');
  else {
    try {
      key = Buffer.from(source, 'base64url');
    } catch {
      key = Buffer.alloc(0);
    }
  }
  if (key.length !== 32) {
    throw new Error('NOTIFY_HISTORY_ENCRYPTION_KEY must encode exactly 32 random bytes.');
  }
  return key;
}

function createPayloadProtector(secret) {
  const key = decodeEncryptionKey(secret);
  return {
    encrypt(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
    },
    decrypt(value) {
      const [version, ivValue, tagValue, ciphertextValue, extra] = String(value || '').split('.');
      if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || extra) {
        throw new Error('Stored notification payload is invalid.');
      }
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString('utf8'));
    },
  };
}

module.exports = { createPayloadProtector, decodeEncryptionKey };
