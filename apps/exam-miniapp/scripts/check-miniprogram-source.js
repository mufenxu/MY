const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');
const miniprogramRoot = path.join(root, 'miniprogram');
const frontendRequire = createRequire(path.resolve(root, '..', 'exam-admin', 'package.json'));
let parser;
try {
    parser = frontendRequire('@babel/parser');
} catch (error) {
    console.error('Missing @babel/parser. Run npm install in apps/exam-admin before checking mini program source.');
    process.exit(1);
}
const sourceExtensions = new Set(['.ts', '.js', '.json', '.wxml', '.scss', '.wxss']);
const syntaxExtensions = new Set(['.ts', '.js']);
const errors = [];

const mojibakePatterns = [
    /\uFFFD/,
    /銆\?/,
    /銆俙/,
    /鐧诲綍/,
    /纭/,
    /璇峰/,
    /鎴戠殑/,
    /棰樺簱/,
    /閿欒/,
    /澶辫/,
    /娴滃/,
    /閸|閺|鐠/,
    /锛\?/,
];

function walk(dir, callback) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(filePath, callback);
        } else {
            callback(filePath);
        }
    }
}

function relative(filePath) {
    return path.relative(root, filePath);
}

function parseScript(filePath, text) {
    try {
        parser.parse(text, {
            sourceFilename: filePath,
            sourceType: 'module',
            plugins: ['typescript'],
        });
    } catch (error) {
        const location = error.loc ? `${error.loc.line}:${error.loc.column + 1}` : 'unknown';
        errors.push(`Syntax error: ${relative(filePath)} (${location}) ${error.message}`);
    }
}

function checkEncoding(filePath, text) {
    const matched = mojibakePatterns.find((pattern) => pattern.test(text));
    if (!matched) return;

    errors.push(`Possible mojibake text: ${relative(filePath)} (${matched})`);
}

walk(miniprogramRoot, (filePath) => {
    const ext = path.extname(filePath);
    if (!sourceExtensions.has(ext)) return;

    const text = fs.readFileSync(filePath, 'utf8');
    checkEncoding(filePath, text);
    if (syntaxExtensions.has(ext)) {
        parseScript(filePath, text);
    }
});

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}

console.log('Miniprogram source ok');
