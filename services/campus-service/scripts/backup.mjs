import { chmod, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";

const dataDir = resolve(process.env.HGU_DATA_DIR || "data");
const source = join(dataDir, "app.db");
const backupDir = resolve(process.argv[2] || join(dataDir, "backups"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join(backupDir, `app-${stamp}.db`);

await mkdir(backupDir, { recursive: true, mode: 0o700 });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
  await chmod(destination, 0o600).catch(() => {});
  console.log(destination);
} finally {
  db.close();
}
