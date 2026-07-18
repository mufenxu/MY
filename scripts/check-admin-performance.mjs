import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreDist = path.join(workspaceRoot, 'apps', 'core-admin', 'dist');
const examDist = path.join(workspaceRoot, 'apps', 'exam-admin', 'dist');
const bannedOrigins = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'api.dicebear.com',
];
const budgets = {
  coreEntry: 240 * 1024,
  coreDefaultRoute: 365 * 1024,
  coreSettledDefaultRoute: 470 * 1024,
  examEntry: 90 * 1024,
  examDefaultRoute: 305 * 1024,
  examSettledDefaultRoute: 315 * 1024,
};

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}

function collectManifestAssets(distDirectory, routeEntries) {
  const manifestPath = path.join(distDirectory, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${path.relative(workspaceRoot, manifestPath)} is missing. Enable Vite build.manifest.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const visitedEntries = new Set();
  const assets = new Set(['index.html']);

  const visit = (entryKey) => {
    if (visitedEntries.has(entryKey)) return;
    const entry = manifest[entryKey];
    if (!entry) throw new Error(`Build manifest entry is missing: ${entryKey}`);
    visitedEntries.add(entryKey);
    if (entry.file) assets.add(entry.file);
    for (const cssFile of entry.css || []) assets.add(cssFile);
    for (const importedEntry of entry.imports || []) visit(importedEntry);
  };

  for (const entryKey of routeEntries) visit(entryKey);
  return assets;
}

function getGzipBytes(distDirectory, assets) {
  return Array.from(assets).reduce((total, asset) => {
    const filePath = path.join(distDirectory, asset);
    if (!fs.existsSync(filePath)) throw new Error(`Manifest asset is missing: ${asset}`);
    return total + gzipSync(fs.readFileSync(filePath)).byteLength;
  }, 0);
}

function assertBudget(label, bytes, budget) {
  if (bytes > budget) {
    throw new Error(`${label} is ${(bytes / 1024).toFixed(1)} KiB gzip (budget ${(budget / 1024).toFixed(1)} KiB).`);
  }
}

if (!fs.existsSync(coreDist)) {
  throw new Error('Core admin build output is missing. Run the admin builds first.');
}

if (!fs.existsSync(examDist)) {
  throw new Error('Exam admin build output is missing. Run the admin builds first.');
}

const scannableFiles = collectFiles(coreDist)
  .filter((filePath) => /\.(?:css|html|js)$/.test(filePath));
const examScannableFiles = collectFiles(examDist)
  .filter((filePath) => /\.(?:css|html|js)$/.test(filePath));

for (const filePath of [...scannableFiles, ...examScannableFiles]) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const origin of bannedOrigins) {
      if (source.includes(origin)) {
        throw new Error(`${path.relative(workspaceRoot, filePath)} contains banned external origin ${origin}.`);
      }
    }
}

const indexHtml = fs.readFileSync(path.join(coreDist, 'index.html'), 'utf8');
const modulePreloads = Array.from(indexHtml.matchAll(/<link\s+[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi))
  .map((match) => match[1]);
const eagerChart = modulePreloads.find((href) => /chart|recharts/i.test(href));

if (eagerChart) {
  throw new Error(`Core admin entry eagerly preloads chart code: ${eagerChart}`);
}

const examIndexHtml = fs.readFileSync(path.join(examDist, 'index.html'), 'utf8');
const examModulePreloads = Array.from(examIndexHtml.matchAll(/<link\s+[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi))
  .map((match) => match[1]);
const eagerImportTool = examModulePreloads.find((href) => /exceljs|papaparse|qrcode/i.test(href));

if (eagerImportTool) {
  throw new Error(`Exam admin entry eagerly preloads import/QR tool code: ${eagerImportTool}`);
}

const coreEntryAssets = collectManifestAssets(coreDist, ['index.html']);
const coreDefaultAssets = collectManifestAssets(coreDist, [
  'index.html',
  'src/components/MainLayout.jsx',
  'src/pages/Dashboard.jsx',
]);
const coreSettledDefaultAssets = collectManifestAssets(coreDist, [
  'index.html',
  'src/components/MainLayout.jsx',
  'src/pages/Dashboard.jsx',
  'src/components/DashboardTrendChart.jsx',
]);
const examEntryAssets = collectManifestAssets(examDist, ['index.html']);
const examDefaultAssets = collectManifestAssets(examDist, ['index.html', 'src/views/DashboardView.vue']);
const examSettledDefaultAssets = collectManifestAssets(examDist, [
  'index.html',
  'src/views/DashboardView.vue',
  'src/components/MiniLineChart.vue',
]);

const coreEntryBytes = getGzipBytes(coreDist, coreEntryAssets);
const coreDefaultBytes = getGzipBytes(coreDist, coreDefaultAssets);
const coreSettledDefaultBytes = getGzipBytes(coreDist, coreSettledDefaultAssets);
const examEntryBytes = getGzipBytes(examDist, examEntryAssets);
const examDefaultBytes = getGzipBytes(examDist, examDefaultAssets);
const examSettledDefaultBytes = getGzipBytes(examDist, examSettledDefaultAssets);

assertBudget('Core admin entry', coreEntryBytes, budgets.coreEntry);
assertBudget('Core admin default route', coreDefaultBytes, budgets.coreDefaultRoute);
assertBudget('Core admin settled default route', coreSettledDefaultBytes, budgets.coreSettledDefaultRoute);
assertBudget('Exam admin entry', examEntryBytes, budgets.examEntry);
assertBudget('Exam admin default route', examDefaultBytes, budgets.examDefaultRoute);
assertBudget('Exam admin settled default route', examSettledDefaultBytes, budgets.examSettledDefaultRoute);

const eagerDefaultChart = Array.from(coreDefaultAssets).find((asset) => /DashboardTrendChart|CartesianChart|recharts/i.test(asset));
if (eagerDefaultChart) {
  throw new Error(`Core admin default route eagerly loads delayed chart code: ${eagerDefaultChart}`);
}

console.log([
  `Admin performance checks passed (${scannableFiles.length} core build files, ${examScannableFiles.length} exam build files scanned).`,
  `Core entry/default/settled: ${(coreEntryBytes / 1024).toFixed(1)} / ${(coreDefaultBytes / 1024).toFixed(1)} / ${(coreSettledDefaultBytes / 1024).toFixed(1)} KiB gzip.`,
  `Exam entry/default/settled: ${(examEntryBytes / 1024).toFixed(1)} / ${(examDefaultBytes / 1024).toFixed(1)} / ${(examSettledDefaultBytes / 1024).toFixed(1)} KiB gzip.`,
].join(' '));
