import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  isValidUsername,
  normalizeUsername,
  verifyPassword
} from "../src/lib/password.js";

test("password hashes remain compatible with the stored scrypt format", async () => {
  const password = "correct horse battery staple";
  const encoded = await hashPassword(password);

  assert.match(encoded, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
});

test("malformed and oversized password inputs fail closed", async () => {
  assert.equal(await verifyPassword("password", "not-a-supported-hash"), false);
  assert.equal(await verifyPassword("password", "scrypt$bad$bad$extra"), false);
  assert.equal(await verifyPassword("too long", "scrypt$salt$hash", { maxLength: 3 }), false);
});

test("usernames share one normalization and validation policy", () => {
  assert.equal(normalizeUsername("  Student.Name  "), "student.name");
  assert.equal(isValidUsername("student.name"), true);
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("invalid name"), false);
});
