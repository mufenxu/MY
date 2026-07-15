import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  hashPassword,
  isValidUsername,
  normalizeUsername,
  verifyPassword
} from "../src/lib/password.js";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
process.umask(0o077);
const dataDir = resolve(process.env.HGU_DATA_DIR || join(rootDir, "data"));
const databasePath = join(dataDir, "app.db");
const minPasswordLength = Number(process.env.HGU_APP_PASSWORD_MIN_LENGTH || 12);
const maxPasswordLength = Number(process.env.HGU_APP_PASSWORD_MAX_LENGTH || 256);
let database = null;
process.on("exit", () => {
  if (database?.open) database.close();
});

function usage() {
  console.log("Usage:");
  console.log("  npm run user:list");
  console.log("  npm run user:add -- <username> <password> [admin|user]");
  console.log("  npm run user:password -- <username> <new-password>");
}

function openDb() {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      session_version INTEGER NOT NULL DEFAULT 1
    );
  `);
  const columns = db.prepare("PRAGMA table_info(users)").all();
  if (!columns.some((column) => column.name === "session_version")) {
    db.exec("ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1");
  }
  return db;
}

function assertPassword(password) {
  if (!password || String(password).length < minPasswordLength) {
    throw new Error(`Password must be at least ${minPasswordLength} characters.`);
  }
  if (String(password).length > maxPasswordLength) {
    throw new Error(`Password must not exceed ${maxPasswordLength} characters.`);
  }
}

function assertUsername(username) {
  if (!isValidUsername(username)) {
    throw new Error("Username must be 3-64 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
}

const [command, usernameArg, passwordArg, roleArg] = process.argv.slice(2);

try {
  if (!command || command === "help") {
    usage();
    process.exit(command ? 0 : 1);
  }

  const db = openDb();
  database = db;
  const now = new Date().toISOString();

  if (command === "list") {
    const users = db.prepare(`
      SELECT username, role, disabled, created_at, last_login_at
      FROM users
      ORDER BY created_at ASC
    `).all();
    if (!users.length) {
      console.log(existsSync(databasePath) ? "No users found." : "Database does not exist yet.");
    } else {
      console.table(users.map((user) => ({
        username: user.username,
        role: user.role,
        disabled: Boolean(user.disabled),
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at || ""
      })));
    }
    process.exit(0);
  }

  if (command === "add") {
    const username = normalizeUsername(usernameArg);
    assertUsername(username);
    assertPassword(passwordArg);
    const role = roleArg === "admin" ? "admin" : "user";
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(randomUUID(), username, await hashPassword(passwordArg), role, now, now);
    console.log(`Created ${role} user: ${username}`);
    process.exit(0);
  }

  if (command === "password") {
    const username = normalizeUsername(usernameArg);
    assertUsername(username);
    assertPassword(passwordArg);
    const user = db.prepare("SELECT password_hash FROM users WHERE username = ?").get(username);
    if (!user) throw new Error(`User not found: ${username}`);
    if (await verifyPassword(passwordArg, user.password_hash, { maxLength: maxPasswordLength })) {
      throw new Error("New password must be different from the current password.");
    }
    db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE username = ?")
      .run(await hashPassword(passwordArg), now, username);
    console.log(`Updated password for: ${username}`);
    process.exit(0);
  }

  usage();
  process.exit(1);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
