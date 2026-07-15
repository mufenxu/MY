import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const HASH_BYTES = 64;
const MAX_ENCODED_PART_LENGTH = 128;

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export function isValidUsername(username) {
  return USERNAME_PATTERN.test(String(username || ""));
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = Buffer.from(await scryptAsync(String(password), salt, HASH_BYTES));
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password, passwordHash, { maxLength = Infinity } = {}) {
  const candidate = String(password || "");
  if (candidate.length > maxLength) return false;

  const [scheme, salt, encodedExpected, ...extra] = String(passwordHash || "").split("$");
  if (scheme !== "scrypt" || !salt || !encodedExpected || extra.length) return false;
  if (salt.length > MAX_ENCODED_PART_LENGTH || encodedExpected.length > MAX_ENCODED_PART_LENGTH) return false;

  const expected = Buffer.from(encodedExpected, "base64url");
  if (expected.length !== HASH_BYTES) return false;
  const actual = Buffer.from(await scryptAsync(candidate, salt, HASH_BYTES));
  return timingSafeEqual(actual, expected);
}
