import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { CampusRepository } from "../src/storage/campus-repository.js";

const sqlitePath = resolve(process.argv[2] || "data/app.db");
if (!existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);

const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const repository = new CampusRepository();

function tableExists(name) {
  return Boolean(source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function rows(name) {
  return tableExists(name) ? source.prepare(`SELECT * FROM ${name}`).all() : [];
}

try {
  await repository.initialize();
  const collections = {
    users: rows("users").map((row) => ({ ...row, session_version: row.session_version || 1 })),
    school_sessions: rows("school_sessions").map((row) => ({ ...row, version: 0 })),
    academic_caches: rows("academic_caches"),
    invites: rows("invites")
  };

  for (const [name, documents] of Object.entries(collections)) {
    if (documents.length === 0) continue;
    const keyFields = {
      users: ["id"],
      school_sessions: ["user_id"],
      academic_caches: ["user_id", "source_key"],
      invites: ["id"]
    }[name];
    await repository.db.collection(name).bulkWrite(documents.map((document) => ({
      updateOne: {
        filter: Object.fromEntries(keyFields.map((key) => [key, document[key]])),
        update: { $setOnInsert: document },
        upsert: true
      }
    })));
    console.log(`${name}: considered ${documents.length} legacy rows (existing MongoDB rows preserved)`);
  }
} finally {
  source.close();
  await repository.close();
}
