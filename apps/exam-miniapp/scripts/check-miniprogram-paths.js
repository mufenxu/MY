const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniprogramRoot = path.join(root, 'miniprogram');
const appJsonPath = path.join(miniprogramRoot, 'app.json');
const sourceExtensions = ['.ts', '.js', '.json', '.scss', '.wxml', '.wxss'];
const movedRootPagePattern = /\/pages\/(study-report|wrong-book|wrong-practice|question-search|scan-login|account-manage|privacy-policy|user-agreement)\//;
const errors = [];

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        errors.push(`Invalid JSON: ${path.relative(root, filePath)} (${error.message})`);
        return null;
    }
}

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

function existsImportTarget(basePath) {
    return sourceExtensions.some((ext) => fs.existsSync(`${basePath}${ext}`))
        || fs.existsSync(basePath)
        || fs.existsSync(path.join(basePath, 'index.ts'))
        || fs.existsSync(path.join(basePath, 'index.js'));
}

function checkRelativeImports(filePath) {
    if (!/\.(ts|scss)$/.test(filePath)) {
        return;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]|@import\s+['"](\.{1,2}\/[^'"]+)['"]/g;
    let match;

    while ((match = importPattern.exec(text))) {
        const importPath = match[1] || match[2];
        const resolved = path.resolve(path.dirname(filePath), importPath);
        if (!existsImportTarget(resolved)) {
            errors.push(`Broken import: ${path.relative(root, filePath)} -> ${importPath}`);
        }
    }
}

function checkUsingComponents(filePath) {
    if (!filePath.endsWith('.json')) {
        return;
    }

    const json = readJson(filePath);
    if (!json || !json.usingComponents) {
        return;
    }

    for (const [name, componentPath] of Object.entries(json.usingComponents)) {
        const normalized = String(componentPath);
        const resolved = normalized.startsWith('/')
            ? path.join(miniprogramRoot, normalized.slice(1))
            : path.resolve(path.dirname(filePath), normalized);

        if (!existsImportTarget(resolved)) {
            errors.push(`Broken component "${name}": ${path.relative(root, filePath)} -> ${normalized}`);
        }
    }
}

function checkNoMovedRootRoutes(filePath) {
    if (!/\.(ts|wxml|json)$/.test(filePath)) {
        return;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    if (movedRootPagePattern.test(text)) {
        errors.push(`Old root page route remains: ${path.relative(root, filePath)}`);
    }
}

function checkPageExists(pagePath) {
    const jsonPath = path.join(miniprogramRoot, `${pagePath}.json`);
    if (!fs.existsSync(jsonPath)) {
        errors.push(`Missing page json: ${pagePath}`);
    }
}

const appJson = readJson(appJsonPath);
if (appJson) {
    for (const page of appJson.pages || []) {
        checkPageExists(page);
    }

    for (const subpackage of appJson.subpackages || appJson.subPackages || []) {
        for (const page of subpackage.pages || []) {
            checkPageExists(path.join(subpackage.root, page).replace(/\\/g, '/'));
        }
    }
}

walk(miniprogramRoot, (filePath) => {
    checkRelativeImports(filePath);
    checkUsingComponents(filePath);
    checkNoMovedRootRoutes(filePath);
});

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}

console.log('Miniprogram paths ok');
