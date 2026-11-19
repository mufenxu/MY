// 对服务内全部 JS 源文件做语法检查。按目录自动收集，新增文件无需再登记到 package.json。
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["server.js", "src", "scripts", "public"];
const extensions = new Set([".js", ".mjs"]);

function collect(target) {
  if (!existsSync(target)) {
    return [];
  }
  if (statSync(target).isFile()) {
    return extensions.has(path.extname(target)) ? [target] : [];
  }
  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.name !== "node_modules")
    .flatMap((entry) => collect(path.join(target, entry.name)));
}

const files = targets
  .flatMap((target) => collect(path.join(projectRoot, target)))
  .sort((left, right) => left.localeCompare(right));

for (const file of files) {
  const relative = path.relative(projectRoot, file);
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    process.stderr.write(`Syntax check failed: ${relative}\n`);
    process.stderr.write(result.stderr || result.stdout || "");
    process.exit(result.status || 1);
  }
}

process.stdout.write(`Syntax ok: ${files.length} files\n`);
