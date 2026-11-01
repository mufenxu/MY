import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rules = [
  ['button', /\b(?:Button|FilledTonalButton|OutlinedButton)\s*\(/g, '使用共享 App 按钮'],
  ['field', /\b(?:TextField|OutlinedTextField)\s*\(/g, '使用 AppTextField 或 AppSelectField'],
  ['dialog', /\bAlertDialog\s*\(/g, '使用 AppDialog 或 AppConfirmDialog'],
  ['color', /\bColor\s*\(\s*0x[\da-f]+/gi, '颜色统一来自 ui/theme/Color.kt'],
  ['typography', /\bfontSize\s*=\s*(?:if\s*\([^)]*\)\s*)?[\d.]+\.sp/g, '文字使用主题排版样式，不覆盖数值字号'],
  ['spacing', /verticalArrangement\s*=\s*Arrangement\.spacedBy\(\s*(?:10|14)\.dp\s*\)/g, '列表和区块间距使用 12.dp，紧凑内容使用 4.dp 或 8.dp'],
];

export function checkAndroidDesignSource(file, source) {
  const sharedComponent = file.replaceAll('\\', '/').includes('ui/components/');
  // 保留换行以报告原始行号，避免注释和展示给用户的代码片段触发规则。
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    value => value.replace(/[^\n]/g, ' '));
  return rules.filter(([rule]) => !sharedComponent || ['color', 'typography'].includes(rule))
    .flatMap(([rule, pattern, message]) => [...code.matchAll(pattern)].map(match => ({
    file,
    line: code.slice(0, match.index).split('\n').length,
    rule,
    message,
  })));
}

function kotlinFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? kotlinFiles(file) : entry.name.endsWith('.kt') ? [file] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const uiRoot = path.join(root, 'apps/android-app/app/src/main/java/cn/pxyb/mycontrol/ui');
  const files = ['feature', 'components'].flatMap(directory => kotlinFiles(path.join(uiRoot, directory)));
  const findings = files.flatMap(file => checkAndroidDesignSource(path.relative(root, file), readFileSync(file, 'utf8')));
  for (const finding of findings) console.error(`${finding.file}:${finding.line}: ${finding.message}`);
  if (findings.length) process.exitCode = 1;
  else console.log(`Android 设计约束通过（${files.length} 个业务及公共组件文件）`);
}
