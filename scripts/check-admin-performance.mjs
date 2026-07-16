import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreDist = path.join(workspaceRoot, 'apps', 'core-admin', 'dist');
const examDist = path.join(workspaceRoot, 'apps', 'exam-admin', 'dist');
const bannedOrigins = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'api.dicebear.com',
];

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
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

for (const filePath of scannableFiles) {
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

console.log(`Admin performance checks passed (${scannableFiles.length} core build files, ${examScannableFiles.length} exam build files scanned).`);
