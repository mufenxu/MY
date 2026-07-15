import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnv, parseBooleanEnv } from "../src/lib/env.js";

test("boolean environment values use explicit truthy forms", () => {
  for (const value of ["1", "true", "TRUE", "yes", "on"]) {
    assert.equal(parseBooleanEnv(value), true);
  }
  for (const value of ["0", "false", "no", "off", "unexpected"]) {
    assert.equal(parseBooleanEnv(value), false);
  }
  assert.equal(parseBooleanEnv(undefined, true), true);
});

test("dotenv loading preserves existing environment values", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hgu-env-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, ".env");
  await writeFile(filePath, [
    "# comment",
    "EXISTING=replaced",
    "PLAIN=value",
    "QUOTED=\"value with spaces\"",
    "INVALID KEY=ignored"
  ].join("\n"));

  const environment = { EXISTING: "preserved" };
  loadDotEnv(filePath, environment);

  assert.deepEqual(environment, {
    EXISTING: "preserved",
    PLAIN: "value",
    QUOTED: "value with spaces"
  });
});
