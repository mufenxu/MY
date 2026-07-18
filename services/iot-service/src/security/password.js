const crypto = require('crypto');

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function parsePasswordHash(value) {
  const [prefix, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue, ...rest] = String(value || '').split('$');
  if (
    rest.length > 0
    || prefix !== SCRYPT_PREFIX
    || Number.parseInt(costValue, 10) !== SCRYPT_COST
    || Number.parseInt(blockSizeValue, 10) !== SCRYPT_BLOCK_SIZE
    || Number.parseInt(parallelizationValue, 10) !== SCRYPT_PARALLELIZATION
    || !saltValue
    || !hashValue
  ) return null;

  const salt = Buffer.from(saltValue, 'base64url');
  const hash = Buffer.from(hashValue, 'base64url');
  if (salt.length !== 16 || hash.length !== SCRYPT_KEY_LENGTH) return null;
  return { hash, salt };
}

function isPasswordHash(value) {
  return Boolean(parsePasswordHash(value));
}

function hashPassword(password) {
  const value = String(password || '');
  if (!value || isPasswordHash(value)) return value;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(value, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  });
  return [
    SCRYPT_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    encode(salt),
    encode(derived)
  ].join('$');
}

function verifyPassword(password, encodedHash) {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  try {
    const actual = crypto.scryptSync(String(password || ''), parsed.salt, parsed.hash.length, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: 64 * 1024 * 1024
    });
    return crypto.timingSafeEqual(parsed.hash, actual);
  } catch (error) {
    return false;
  }
}

module.exports = {
  hashPassword,
  isPasswordHash,
  verifyPassword
};
