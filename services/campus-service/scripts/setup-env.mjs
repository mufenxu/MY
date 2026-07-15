import { chmod, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const envPath = resolve(process.argv[2] || ".env");
let source = "";
try {
  source = await readFile(envPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const existing = new Map();
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) existing.set(match[1], match[2]);
}

const generated = {
  HGU_ADMIN_USERNAME: "admin",
  HGU_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  HGU_APP_SESSION_SECRET: randomBytes(32).toString("base64url"),
  HGU_DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64url")
};
const added = [];
for (const [key, value] of Object.entries(generated)) {
  if (existing.get(key)?.trim()) continue;
  source += `${source && !source.endsWith("\n") ? "\n" : ""}${key}=${value}\n`;
  added.push(key);
}

if (added.length) await writeFile(envPath, source, { encoding: "utf8", mode: 0o600 });
await chmod(envPath, 0o600).catch(() => {});
console.log(added.length ? `Configured: ${added.join(", ")}` : "Environment secrets are already configured.");
