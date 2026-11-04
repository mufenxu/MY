#!/usr/bin/env node
/**
 * 清理本地开发产生的临时文件与可再生的构建产物。
 *
 * 只处理被 .gitignore 覆盖的目录，不触碰任何 git 跟踪的源码，也不动 .env、
 * .workbuddy/memory、.workbuddy/artifacts 与 node_modules。
 *
 * 用法：
 *   npm run clean                 清临时文件（浏览器配置、截图草稿、调试产物、运行日志）
 *   npm run clean:all             再清构建产物（Android build 与 .gradle、前端 dist）
 *   npm run clean -- --dry-run    只打印会删什么，不落盘
 *   npm run clean -- --all --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 临时文件：删掉不影响任何流程，下次运行会重新生成。 */
const TEMPORARY_DIRECTORIES = [
  '.tmp-chrome',
  '.tmp-shot',
  '.workbuddy/tmp',
  'services/core-api/logs',
];

/** 构建产物：删掉后下次构建重新编译。CI 自行构建，不受影响。 */
const BUILD_DIRECTORIES = [
  'apps/android-app/.gradle',
  'apps/android-app/.kotlin',
  'apps/android-app/app/build',
  'apps/android-app/build',
  'apps/android-app/core/network/build',
  'apps/android-app/core/security/build',
  'apps/android-app/baselineprofile/build',
];

/** 任何情况下都不允许删除的路径片段。命中即拒绝，作为误配的兜底。 */
const PROTECTED_SEGMENTS = [
  'node_modules',
  '.git',
  '.workbuddy/memory',
  '.workbuddy/artifacts',
];

function parseArguments(argv) {
  const options = { all: false, dryRun: false, help: false };
  for (const argument of argv) {
    if (argument === '--all') options.all = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`未知参数 "${argument}"，可用参数：--all、--dry-run、--help`);
  }
  return options;
}

/** 根目录下所有 `.tmp-*` 目录，覆盖临时排查时随手创建的新目录。 */
function discoverRootTemporaryDirectories(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('.tmp-'))
    .map(entry => entry.name);
}

/** 各应用与服务下的一层 `dist`，避免把构建目录写死在清单里。 */
function discoverDistDirectories(root) {
  const found = [];
  for (const group of ['apps', 'services']) {
    const groupPath = path.join(root, group);
    if (!fs.existsSync(groupPath)) continue;
    for (const entry of fs.readdirSync(groupPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(group, entry.name, 'dist');
      if (fs.existsSync(candidate)) found.push(path.join(group, entry.name, 'dist'));
    }
  }
  return found;
}

function directorySize(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) total += directorySize(child);
    else if (entry.isFile()) total += fs.lstatSync(child).size;
  }
  return total;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function assertSafeTarget(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`拒绝删除工作区之外的路径：${target}`);
  }
  const normalized = relative.split(path.sep).join('/');
  for (const segment of PROTECTED_SEGMENTS) {
    if (normalized === segment || normalized.startsWith(`${segment}/`) || normalized.includes(`/${segment}/`)) {
      throw new Error(`拒绝删除受保护路径：${normalized}（命中 "${segment}"）`);
    }
  }
  if (normalized === '.env' || path.basename(normalized).startsWith('.env')) {
    throw new Error(`拒绝删除环境变量文件：${normalized}`);
  }
}

function removeTarget(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
  } catch (error) {
    const reason = error.code === 'EBUSY' || error.code === 'EPERM' ? '目录被占用，请先退出相关进程' : error.message;
    throw new Error(`删除 ${target} 失败：${reason}`);
  }
}

export function cleanWorkspace({ root = workspaceRoot, all = false, dryRun = false, log = console.log } = {}) {
  const temporary = [
    ...new Set([...TEMPORARY_DIRECTORIES, ...discoverRootTemporaryDirectories(root)]),
  ].map(name => path.join(root, name));
  const build = [...new Set([...BUILD_DIRECTORIES.map(name => path.join(root, name)), ...discoverDistDirectories(root)])];

  const requested = all ? [...temporary, ...build] : temporary;
  const targets = requested
    .filter(target => {
      assertSafeTarget(root, target);
      return fs.existsSync(target);
    })
    .map(target => {
      let size = 0;
      try {
        size = directorySize(target);
      } catch {
        size = 0;
      }
      return { target, size };
    });

  if (targets.length === 0) {
    log(all ? '没有需要清理的临时文件或构建产物。' : '没有需要清理的临时文件（构建产物仍在，需要时用 npm run clean:all）。');
    return { removed: 0, freedBytes: 0 };
  }

  log(dryRun ? '将清理以下目录（--dry-run，未落盘）：' : '正在清理：');
  let freedBytes = 0;
  for (const { target, size } of targets) {
    const relative = path.relative(root, target).split(path.sep).join('/');
    if (!dryRun) removeTarget(target);
    freedBytes += size;
    log(`  ${relative}  ${formatSize(size)}`);
  }

  const summary = `${dryRun ? '可释放' : '已释放'} ${formatSize(freedBytes)}，共 ${targets.length} 个目录`;
  log(dryRun ? summary : `${summary}。`);
  if (!all) {
    log('构建产物未清理；需要时运行 npm run clean:all（Android 会重新编译，前端会重新打包）。');
  }
  return { removed: targets.length, freedBytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  if (options) {
    if (options.help) {
      console.log(
        [
          '清理本地开发产生的临时文件与构建产物。',
          '',
          '  npm run clean                清临时文件（浏览器配置、截图草稿、调试产物、运行日志）',
          '  npm run clean:all            再清构建产物（Android build 与 .gradle、前端 dist）',
          '  npm run clean -- --dry-run   只打印会删什么，不落盘',
          '',
          '不删除：node_modules、.env、.workbuddy/memory、.workbuddy/artifacts、git 跟踪的源码。',
        ].join('\n'),
      );
    } else {
      try {
        cleanWorkspace(options);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
      }
    }
  }
}
