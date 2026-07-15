import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createSensitiveJsonCodec, deriveDataEncryptionKey } from "../src/lib/sensitive-json.js";

test("sensitive JSON codec encrypts and authenticates stored values", () => {
  const key = randomBytes(32).toString("base64url");
  const codec = createSensitiveJsonCodec({ key, required: true });
  const value = { cookies: { example: { SESSION: "secret-value" } }, meta: { account: "123" } };
  const encoded = codec.encode(value);
  assert.match(encoded, /^enc:v1:/);
  assert.equal(encoded.includes("secret-value"), false);
  assert.deepEqual(codec.decode(encoded), value);
});

test("sensitive JSON codec remains compatible with legacy plaintext JSON in development", () => {
  const codec = createSensitiveJsonCodec();
  const encoded = codec.encode({ ok: true });
  assert.deepEqual(codec.decode(encoded), { ok: true });
});

test("sensitive JSON codec rejects invalid production keys", () => {
  assert.throws(() => createSensitiveJsonCodec({ key: "too-short", required: true }), /32 random bytes/);
});

test("data encryption fallback is deterministic and domain-separated", () => {
  const first = deriveDataEncryptionKey("a-long-stable-session-secret");
  const second = deriveDataEncryptionKey("a-long-stable-session-secret");
  assert.equal(first, second);
  assert.equal(Buffer.from(first, "base64url").length, 32);
  assert.notEqual(first, Buffer.from("a-long-stable-session-secret").toString("base64url"));
});

test("sensitive JSON codec can rotate from a derived fallback to an independent key", () => {
  const derivedKey = deriveDataEncryptionKey("stable-session-secret");
  const previous = createSensitiveJsonCodec({ key: derivedKey, required: true });
  const encoded = previous.encode({ session: "preserved" });
  const current = createSensitiveJsonCodec({
    key: randomBytes(32).toString("base64url"),
    fallbackKeys: [derivedKey],
    required: true
  });
  const decoded = current.decodeWithMetadata(encoded);
  assert.deepEqual(decoded.value, { session: "preserved" });
  assert.equal(decoded.keyIndex, 1);
});
