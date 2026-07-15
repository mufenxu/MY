const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const targets = [
  path.join(projectRoot, 'src'),
  path.join(projectRoot, 'test'),
  path.join(projectRoot, 'public')
];

function collectJavaScriptFiles(target) {
  if (!fs.existsSync(target)) {
    return [];
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return target.endsWith('.js') ? [target] : [];
  }

  return fs.readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => collectJavaScriptFiles(path.join(target, entry.name)));
}

const files = targets
  .flatMap(collectJavaScriptFiles)
  .sort((left, right) => left.localeCompare(right));

for (const file of files) {
  const relative = path.relative(projectRoot, file);
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.status !== 0) {
    process.stderr.write(`Syntax check failed: ${relative}\n`);
    process.stderr.write(result.stderr || result.stdout || '');
    process.exit(result.status || 1);
  }

  process.stdout.write(`ok ${relative}\n`);
}
