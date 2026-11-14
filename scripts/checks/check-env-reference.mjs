import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogRelativePath = 'apps/android-app/app/src/main/java/cn/pxyb/mycontrol/ui/feature/envreference/EnvReferenceCatalog.kt';

// 既收录生效的 `KEY=value`，也收录模板里注释掉的 `# KEY=value`（可选变量）。
export function parseEnvExampleKeys(source) {
  return [...String(source || '').matchAll(/^#? ?([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
}

// 对照表条目统一由 required( / keep( / optional( 构造，第一个字符串字面量即变量名。
export function parseCatalogKeys(source) {
  return [...String(source || '').matchAll(/\b(?:required|keep|optional)\(\s*"([A-Z][A-Z0-9_]*)"/g)]
    .map((match) => match[1]);
}

export function inspectEnvReference({ envExample, catalog }) {
  const templateKeys = new Set(parseEnvExampleKeys(envExample));
  const catalogKeys = parseCatalogKeys(catalog);
  const catalogSet = new Set(catalogKeys);
  const duplicates = [...new Set(catalogKeys.filter((key, index) => catalogKeys.indexOf(key) !== index))];

  return [
    ...[...templateKeys].filter((key) => !catalogSet.has(key)).sort()
      .map((key) => `Android 环境变量对照表缺少 .env.example 中的 ${key}`),
    ...[...catalogSet].filter((key) => !templateKeys.has(key)).sort()
      .map((key) => `Android 环境变量对照表多出 .env.example 中不存在的 ${key}`),
    ...duplicates.sort().map((key) => `Android 环境变量对照表重复登记了 ${key}`),
  ];
}

export function loadEnvReferenceInputs(workspaceRoot = root) {
  return {
    envExample: fs.readFileSync(path.join(workspaceRoot, '.env.example'), 'utf8'),
    catalog: fs.readFileSync(path.join(workspaceRoot, catalogRelativePath), 'utf8'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = loadEnvReferenceInputs();
  const errors = inspectEnvReference(inputs);
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    console.error(`请同步修改 ${catalogRelativePath}`);
    process.exit(1);
  }
  console.log(`Android 环境变量对照表与 .env.example 一致（${parseCatalogKeys(inputs.catalog).length} 个变量）`);
}
