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

const questionUtility = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'question.ts'), 'utf8');
if (/items:\s*\{\s*question:\s*QuestionItem/.test(questionUtility)
    || /push\(\{\s*question,\s*originalIndex/.test(questionUtility)) {
    errors.push('Grouped questions must contain only questionId and originalIndex.');
}

const examTemplate = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'exam', 'exam.wxml'), 'utf8');
if (/swiper-item[^>]*wx:for="\{\{questions\}\}"/.test(examTemplate)) {
    errors.push('Exam swiper must render the three-item window instead of all questions.');
}
if (!/disable-touch="\{\{mode === 'recite'\}\}"/.test(examTemplate)) {
    errors.push('Recite mode must disable question swiper touch navigation.');
}

const examPage = fs.readFileSync(path.join(miniprogramRoot, 'pages', 'exam', 'exam.ts'), 'utf8');
if (!/onSwiperChange[\s\S]*?this\.data\.mode === 'recite'[\s\S]*?return;/.test(examPage)) {
    errors.push('Recite mode swiper events must be ignored defensively.');
}
if (!/syncExamAttempt[\s\S]*?startDeadlineTimer/.test(examPage)
    || !/onShow\(\)[\s\S]*?syncExamAttempt/.test(examPage)
    || !/handleSubmissionFailure[\s\S]*?startDeadlineTimer/.test(examPage)) {
    errors.push('Timed exams must calibrate against the server deadline and recover after submission failures.');
}
if (!/initializePersonalExamAttempt[\s\S]*?attemptInitializationError/.test(examPage)
    || !/saveProgress\(immediate = false\)[\s\S]*?!this\.isExamSessionReady\(\)/.test(examPage)
    || !/onSubmit\(isAuto = false\)[\s\S]*?!this\.isExamSessionReady\(\)/.test(examPage)
    || !/bindtap="onRetryAttemptInitialization"/.test(examTemplate)) {
    errors.push('Personal exams must remain blocked until the server attempt is initialized.');
}

const runtimeConfig = fs.readFileSync(path.join(miniprogramRoot, 'config', 'runtime.ts'), 'utf8');
if (!/envVersion !== 'develop'[\s\S]*?assertDistributionCompliance/.test(runtimeConfig)) {
    errors.push('Trial and release builds must enforce distribution compliance metadata.');
}

const learningApi = fs.readFileSync(path.join(miniprogramRoot, 'services', 'learningApi.ts'), 'utf8');
if (!/question-analysis[\s\S]*?timeout:\s*AI_ANALYSIS_TIMEOUT_MS/.test(learningApi)) {
    errors.push('AI analysis requests must use the extended endpoint timeout.');
}

const requestUtility = fs.readFileSync(path.join(miniprogramRoot, 'utils', 'request.ts'), 'utf8');
if (!/const showError = options\.showError !== false;/.test(requestUtility)) {
    errors.push('Mini program requests must show errors by default unless explicitly disabled.');
}
if (!/shouldClearSession[\s\S]*?clearLocalAuth\(\)/.test(requestUtility)) {
    errors.push('Expired authentication must preserve local study progress.');
}

const progressApi = fs.readFileSync(path.join(miniprogramRoot, 'services', 'progressApi.ts'), 'utf8');
if (!/uploadLatestProgress[\s\S]*?isSameProgressSnapshot/.test(progressApi)
    || !/flushPromises\s*=\s*new Map/.test(progressApi)
    || !/uploadPromises\s*=\s*new Map/.test(progressApi)) {
    errors.push('Progress uploads must serialize per key and preserve newer local snapshots.');
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
}

console.log('Miniprogram source ok');
