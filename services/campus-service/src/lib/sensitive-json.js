import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

export function deriveDataEncryptionKey(sessionSecret) {
  const secret = String(sessionSecret || "");
  if (!secret) return "";
  const key = hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.from("hgu-campus-hub", "utf8"),
    Buffer.from("sensitive-json/aes-256-gcm/v1", "utf8"),
    32
  );
  return Buffer.from(key).toString("base64url");
}

function parseEncryptionKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const candidates = [];
  if (/^[a-f0-9]{64}$/i.test(raw)) candidates.push(Buffer.from(raw, "hex"));
  try {
    candidates.push(Buffer.from(raw, "base64url"));
  } catch {
    // Try regular base64 below.
  }
  try {
    candidates.push(Buffer.from(raw, "base64"));
  } catch {
    // Validation below returns the useful configuration error.
  }

  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new Error("HGU_DATA_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64url, base64, or 64 hex characters.");
  }
  return key;
}

export function createSensitiveJsonCodec({ key: keyText, fallbackKeys = [], required = false } = {}) {
  const key = parseEncryptionKey(keyText);
  const decryptionKeys = [key, ...fallbackKeys.map(parseEncryptionKey)].filter(Boolean);
  if (required && !key) {
    throw new Error("Production mode requires HGU_DATA_ENCRYPTION_KEY to encrypt school cookies and tokens at rest.");
  }

  return {
    encrypted: Boolean(key),

    encode(value) {
      const plaintext = JSON.stringify(value);
      if (!key) return plaintext;
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
    },

    decodeWithMetadata(serialized) {
      const source = String(serialized || "");
      if (!source.startsWith(PREFIX)) return { value: JSON.parse(source), keyIndex: -1 };
      if (!key) throw new Error("Encrypted application data cannot be read without HGU_DATA_ENCRYPTION_KEY.");
      const payload = Buffer.from(source.slice(PREFIX.length), "base64url");
      if (payload.length < 29) throw new Error("Encrypted application data is malformed.");
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const ciphertext = payload.subarray(28);
      for (let keyIndex = 0; keyIndex < decryptionKeys.length; keyIndex += 1) {
        try {
          const decipher = createDecipheriv("aes-256-gcm", decryptionKeys[keyIndex], iv);
          decipher.setAuthTag(tag);
          const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
          return { value: JSON.parse(plaintext), keyIndex };
        } catch {
          // Try the next configured rotation/fallback key.
        }
      }
      throw new Error("Encrypted application data could not be decrypted. Restore the HGU_DATA_ENCRYPTION_KEY or HGU_APP_SESSION_SECRET that was used when the data was written.");
    },

    decode(serialized) {
      return this.decodeWithMetadata(serialized).value;
    }
  };
}
