import { randomUUID } from "node:crypto";
import { createCampusRepository } from "../src/storage/campus-repository.js";
import {
  hashPassword,
  isValidUsername,
  normalizeUsername,
  verifyPassword
} from "../src/lib/password.js";

const [command, usernameArg, passwordArg, roleArg] = process.argv.slice(2);
const repository = createCampusRepository();
const passwordMinLength = Number(process.env.HGU_APP_PASSWORD_MIN_LENGTH || 12);
const passwordMaxLength = Number(process.env.HGU_APP_PASSWORD_MAX_LENGTH || 256);

function usage() {
  console.log("Usage:");
  console.log("  npm run user:list");
  console.log("  npm run user:add -- <username> <password> [admin|user]");
  console.log("  npm run user:password -- <username> <new-password>");
}

function validateCredentials(username, password) {
  if (!isValidUsername(username)) {
    throw new Error("username must be 3-64 lowercase letters, digits, dots, underscores or hyphens");
  }
  const value = String(password || "");
  if (value.length < passwordMinLength || value.length > passwordMaxLength) {
    throw new Error(`password must be ${passwordMinLength}-${passwordMaxLength} characters`);
  }
}

try {
  await repository.initialize();
  if (command === "list") {
    const users = [];
    const pageSize = 1_000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await repository.listUsersWithSessions({ offset, limit: pageSize });
      users.push(...page);
      if (page.length < pageSize) break;
    }
    if (users.length === 0) console.log("No users found.");
    else console.table(users.map((user) => ({
      username: user.username,
      role: user.role,
      disabled: Boolean(user.disabled),
      createdAt: user.created_at
    })));
  } else if (command === "add") {
    const username = normalizeUsername(usernameArg);
    validateCredentials(username, passwordArg);
    const timestamp = new Date().toISOString();
    await repository.insertUser({
      id: randomUUID(),
      username,
      password_hash: await hashPassword(passwordArg),
      role: roleArg === "admin" ? "admin" : "user",
      disabled: 0,
      session_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
      last_login_at: null
    });
    console.log(`Created ${roleArg === "admin" ? "admin" : "user"} user: ${username}`);
  } else if (command === "password") {
    const username = normalizeUsername(usernameArg);
    validateCredentials(username, passwordArg);
    const user = await repository.findUserByUsername(username);
    if (!user) throw new Error("valid username and new password are required");
    if (await verifyPassword(passwordArg, user.password_hash, { maxLength: passwordMaxLength })) {
      throw new Error("new password must be different from the current password");
    }
    await repository.setUserPassword(user.id, await hashPassword(passwordArg), new Date().toISOString());
    console.log(`Updated password for: ${username}`);
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await repository.close();
}
