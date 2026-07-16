/**
 * 批量导入题目工具模块（ESM 版）
 * 从 batch-import-utils.js 全局 IIFE 迁移为 ES Module。
 * 逻辑完全一致，无任何业务改动。
 */

const SPREADSHEET_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
let excelParserPromise = null;
let csvParserPromise = null;
const MAX_SPREADSHEET_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SPREADSHEET_ROWS = 10000;
const MAX_SPREADSHEET_COLUMNS = 100;
const MAX_XLSX_ENTRIES = 2000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const truthySet = new Set(['正确', '对', 'true', 'yes', 'y', 't', '√', '是']);
const falsySet = new Set(['错误', '错', 'false', 'no', 'n', 'f', '×', '否']);
const judgeKeywordSet = new Set([...truthySet, ...falsySet]);

const toHalfWidthLabel = (rawLabel) => {
    if (!rawLabel) return '';
    const ch = String(rawLabel).trim().charAt(0);
    if (!ch) return '';
    const code = ch.charCodeAt(0);
    if (code >= 0xff21 && code <= 0xff28) return String.fromCharCode(code - 0xfee0);
    return ch.toUpperCase();
};

const normalizeToken = (raw) =>
    String(raw || '').trim().replace(/[。．]/g, '').toLowerCase();

const isJudgeKeyword = (raw) => judgeKeywordSet.has(normalizeToken(raw));

const appendOption = (question, label, value) => {
    if (!question) return false;
    const normalizedLabel = toHalfWidthLabel(label);
    const trimmedValue = String(value || '').trim();
    if (!/^[A-H]$/.test(normalizedLabel) || !trimmedValue) return false;
    const existing = question.options.find((opt) => opt.label === normalizedLabel);
    if (existing) { existing.value = trimmedValue; return true; }
    question.options.push({ label: normalizedLabel, value: trimmedValue });
    return true;
};

const parseAnswer = (answerText) => {
    const raw = String(answerText || '').trim();
    if (!raw) return [];
    const normalizeAnswerLetters = (text) =>
        String(text || '').replace(/[Ａ-Ｈａ-ｈ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).toUpperCase();

    const choiceCandidate = normalizeAnswerLetters(raw)
        .replace(/[（(【\[].*$/, '').replace(/[）)】\]]/g, '').replace(/选项/g, '')
        .replace(/[和及与]/g, ',').replace(/[，、；;\/|。.]/g, ',').replace(/\s+/g, '').trim();

    if (/[A-H]/.test(choiceCandidate) && /^[A-H,]+$/.test(choiceCandidate)) {
        return choiceCandidate.split(',').flatMap((t) => t.split('')).filter((ch) => /^[A-H]$/.test(ch));
    }
    const normalized = raw.replace(/[；;、/|]/g, ',').replace(/[，]/g, ',').replace(/\s+/g, ' ').trim();
    const normalizedLetters = normalizeAnswerLetters(normalized);
    if (/^[A-H]+$/.test(normalizedLetters)) return normalizedLetters.split('');
    if (/^[A-H,\s]+$/.test(normalizedLetters)) return normalizedLetters.split(/[,\s]+/).map((i) => i.trim()).filter(Boolean);
    return normalized.split(',').map((i) => i.trim()).filter(Boolean);
};

const normalizeAnswerList = (answerList) => {
    const dedup = [];
    const seen = new Set();
    for (const raw of answerList) {
        const token = String(raw || '').trim();
        if (!token) continue;
        const key = token.toUpperCase();
        if (!seen.has(key)) { seen.add(key); dedup.push(token); }
    }
    return dedup;
};

const detectTypeFromMeta = (question, meta) => {
    const line = String(meta || '');
    if (line.includes('多选')) question.type = 'multiple';
    if (line.includes('判断')) question.type = 'judge';
    if (line.includes('填空')) question.type = 'fill';
};

const extractContentFromHeaderMeta = (meta) => {
    const cleaned = String(meta || '')
        .replace(/[（(]\s*\d+\s*分\s*[）)]/g, '')
        .replace(/^\s*[【\[\(（]?\s*(单选题?|多选题?|判断题?|填空题?)\s*[】\]\)）]?\s*[:：、.．]?\s*/i, '')
        .replace(/^[：:、]\s*/, '').trim();
    if (!cleaned || /^[【\[\(（]?\s*(单选题?|多选题?|判断题?|填空题?)\s*[】\]\)）]?$/i.test(cleaned)) return '';
    return cleaned;
};

const getTypeHeaderMeta = (line) => {
    const text = String(line || '').trim();
    if (!text) return '';
    if (/^[【\[\(（]?\s*(单选题?|多选题?|判断题?|填空题?)\s*[】\]\)）]?\s*$/i.test(text)) {
        return text;
    }
    const wrappedMatch = text.match(/^[【\[\(（]\s*(单选题?|多选题?|判断题?|填空题?)\s*[】\]\)）]\s*[:：、.．]?\s*(.*)$/i);
    if (wrappedMatch) return text;
    const plainMatch = text.match(/^(单选题?|多选题?|判断题?|填空题?)\s*(?:[:：、.．]|\s+)\s*(.*)$/i);
    return plainMatch ? text : '';
};

const shouldStartFromTypeHeader = (question) => (
    !question ||
    !String(question.content || '').trim() ||
    question.options.length > 0 ||
    question.answer.length > 0 ||
    Boolean(question.analysis)
);

const isAnswerLine = (line) => /^\s*(?:参考|正确)?答案(?:是)?\s*[:：]?\s*(.+)$/i.test(line);
const isAnalysisLine = (line) => /^解析\s*[:：]?/.test(line);
const isOptionHeaderLine = (line) => /^(?:选项|备选项|选项如下)\s*[:：]?$/i.test(line);
const isScoreLine = (line) => /^本题得分\s*[:：]/.test(line) || /^得分\s*[:：]/.test(line);
const isQuestionContentLine = (line) => /^(?:题目|题干|问题|question|q)\s*[:：]\s*(.+)$/i.test(line);
const isLikelyOptionLine = (line) => (
    /^[\(（\[]?[A-HＡ-Ｈ][\)）\]】]?\s*[\.．:：、]\s*.+$/.test(line) ||
    /^[\(（\[]?[A-HＡ-Ｈ][\)）\]】]\s*.+$/.test(line) ||
    /^选项\s*[A-HＡ-Ｈ]\s*[\.．:：、]?\s*.+$/i.test(line)
);
const isPotentialImplicitContentLine = (line) => (
    !isAnswerLine(line) &&
    !isAnalysisLine(line) &&
    !isOptionHeaderLine(line) &&
    !isScoreLine(line) &&
    !isQuestionContentLine(line) &&
    !getTypeHeaderMeta(line) &&
    !isLikelyOptionLine(line)
);
const hasAnswerLikeQuestion = (question) => (
    question &&
    String(question.content || '').trim() &&
    (question.answer.length > 0 || Boolean(question.analysis))
);

const getNextNonBlankLine = (lines, startIndex) => {
    for (let i = startIndex + 1; i < lines.length; i++) {
        if (lines[i].text) return lines[i].text;
    }
    return '';
};

const shouldStartImplicitQuestion = (line, question, lines, index) => {
    if (!hasAnswerLikeQuestion(question) || !isPotentialImplicitContentLine(line)) return false;
    const nextLine = getNextNonBlankLine(lines, index);
    return Boolean(nextLine && (
        isAnswerLine(nextLine) ||
        isOptionHeaderLine(nextLine) ||
        isLikelyOptionLine(nextLine)
    ));
};

const mapJudgeAnswerToAB = (rawAnswer, question) => {
    const token = normalizeToken(rawAnswer);
    if (truthySet.has(token)) return 'A';
    if (falsySet.has(token)) return 'B';
    const upper = String(rawAnswer || '').trim().toUpperCase();
    if (upper === 'A' || upper === 'B') return upper;
    if (question.options.length >= 2) {
        if (token === normalizeToken(question.options[0].value)) return 'A';
        if (token === normalizeToken(question.options[1].value)) return 'B';
    }
    return '';
};

const parseInlineOptions = (line, question, expectingOptions) => {
    if (!question) return false;
    let foundOption = false;
    const markerRegex = /([A-HＡ-Ｈ])\s*[\.．:：、\)）\]】]\s*/g;
    const markers = [];
    let markerMatch = null;
    while ((markerMatch = markerRegex.exec(line)) !== null) {
        markers.push({ label: markerMatch[1], start: markerMatch.index, end: markerRegex.lastIndex });
    }
    if (markers.length >= 2) {
        for (let i = 0; i < markers.length; i++) {
            const start = markers[i].end;
            const end = i + 1 < markers.length ? markers[i + 1].start : line.length;
            if (appendOption(question, markers[i].label, line.slice(start, end).trim())) foundOption = true;
        }
        if (foundOption) return true;
    }
    let singleMatch = line.match(/^[\(（\[]?([A-HＡ-Ｈ])[\)）\]】]?\s*[\.．:：、]\s*(.+)$/);
    if (!singleMatch) singleMatch = line.match(/^[\(（\[]?([A-HＡ-Ｈ])[\)）\]】]\s*(.+)$/);
    if (singleMatch) return appendOption(question, singleMatch[1], singleMatch[2]);
    const relaxedMatch = line.match(/^([A-HＡ-Ｈ])\s+(.+)$/);
    if (relaxedMatch) {
        const canUseRelaxed = expectingOptions || question.options.length > 0 ||
            (question.content && question.answer.length === 0 && !question.analysis);
        if (canUseRelaxed) return appendOption(question, relaxedMatch[1], relaxedMatch[2]);
    }
    const withPrefixMatch = line.match(/^选项\s*([A-HＡ-Ｈ])\s*[\.．:：、]?\s*(.+)$/i);
    if (withPrefixMatch) return appendOption(question, withPrefixMatch[1], withPrefixMatch[2]);
    return false;
};

const normalizeSpreadsheetHeader = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[：:。．.、，,；;（）()\[\]【】"'“”‘’_-]/g, '');

const normalizeSpreadsheetCell = (value) => String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u3000/g, ' ')
    .trim();

const getSpreadsheetOptionLabelFromHeader = (header) => {
    const normalized = normalizeSpreadsheetHeader(header).toUpperCase();
    const direct = normalized.match(/^[A-H]$/);
    if (direct) return direct[0];

    const optionLetter = normalized.match(/(?:选项|OPTION)([A-H])/i) || normalized.match(/^([A-H])(?:选项|OPTION)$/i);
    if (optionLetter) return optionLetter[1].toUpperCase();

    const optionNumber = normalized.match(/(?:选项|OPTION)([1-8])/i) || normalized.match(/^([1-8])(?:选项|OPTION)$/i);
    if (optionNumber) return SPREADSHEET_OPTION_LABELS[Number(optionNumber[1]) - 1] || '';

    return '';
};

const getSpreadsheetColumnRole = (header) => {
    const normalized = normalizeSpreadsheetHeader(header);
    if (['题型', '类型', '题目类型', 'questiontype', 'type'].includes(normalized)) return 'type';
    if (['题干', '题目', '题目内容', '问题', '内容', 'question', 'content', 'q'].includes(normalized)) return 'content';
    if (['答案', '正确答案', '参考答案', '标准答案', 'answer', 'correctanswer'].includes(normalized)) return 'answer';
    if (['解析', '答案解析', '题目解析', '说明', 'analysis', 'explanation'].includes(normalized)) return 'analysis';
    const optionLabel = getSpreadsheetOptionLabelFromHeader(header);
    return optionLabel ? `option:${optionLabel}` : '';
};

const detectSpreadsheetHeaderRow = (rows) => {
    const maxScanRows = Math.min(rows.length, 8);
    let best = { index: -1, score: 0, hasContent: false };

    for (let rowIndex = 0; rowIndex < maxScanRows; rowIndex++) {
        const row = rows[rowIndex] || [];
        const roles = row.map(getSpreadsheetColumnRole).filter(Boolean);
        const uniqueRoles = new Set(roles);
        const hasContent = uniqueRoles.has('content');
        const score = uniqueRoles.size + (hasContent ? 3 : 0) + (uniqueRoles.has('answer') ? 2 : 0);
        if (score > best.score) {
            best = { index: rowIndex, score, hasContent };
        }
    }

    return best.score >= 4 && best.hasContent ? best.index : -1;
};

const buildColumnMapFromHeader = (headerRow) => {
    const map = {
        type: -1,
        content: -1,
        answer: -1,
        analysis: -1,
        options: new Map(),
    };

    headerRow.forEach((header, index) => {
        const role = getSpreadsheetColumnRole(header);
        if (!role) return;
        if (role.startsWith('option:')) {
            map.options.set(role.slice('option:'.length), index);
            return;
        }
        if (map[role] === -1) {
            map[role] = index;
        }
    });

    return map;
};

const detectSpreadsheetQuestionType = (value) => {
    const normalized = normalizeSpreadsheetHeader(value);
    if (!normalized) return '';
    if (['单选', '单选题', 'single', 'radio'].includes(normalized)) return '单选题';
    if (['多选', '多选题', 'multiple', 'multi', 'checkbox'].includes(normalized)) return '多选题';
    if (['判断', '判断题', 'judge', 'truefalse', 'tf'].includes(normalized)) return '判断题';
    if (['填空', '填空题', 'fill', 'blank', 'shortanswer'].includes(normalized)) return '填空题';
    return '';
};

const buildFallbackColumnMap = (firstRow) => {
    const firstCellType = detectSpreadsheetQuestionType(firstRow?.[0]);
    const secondCellType = detectSpreadsheetQuestionType(firstRow?.[1]);
    const startsWithType = Boolean(firstCellType);
    const secondIsType = Boolean(secondCellType);

    if (startsWithType) {
        return {
            type: 0,
            content: 1,
            answer: 6,
            analysis: 7,
            options: new Map(SPREADSHEET_OPTION_LABELS.slice(0, 4).map((label, index) => [label, index + 2])),
        };
    }

    if (secondIsType) {
        return {
            type: 1,
            content: 0,
            answer: 6,
            analysis: 7,
            options: new Map(SPREADSHEET_OPTION_LABELS.slice(0, 4).map((label, index) => [label, index + 2])),
        };
    }

    return {
        type: -1,
        content: 0,
        answer: 5,
        analysis: 6,
        options: new Map(SPREADSHEET_OPTION_LABELS.slice(0, 4).map((label, index) => [label, index + 1])),
    };
};

const getSpreadsheetCell = (row, index) => (index >= 0 ? normalizeSpreadsheetCell(row[index]) : '');

const rowHasSpreadsheetContent = (row) => row.some((cell) => normalizeSpreadsheetCell(cell));

const createQuestionTextFromSpreadsheetRows = (rows, fileName = '') => {
    const cleanRows = rows.filter(rowHasSpreadsheetContent);
    if (cleanRows.length === 0) return '';

    const headerRowIndex = detectSpreadsheetHeaderRow(cleanRows);
    const columnMap = headerRowIndex >= 0
        ? buildColumnMapFromHeader(cleanRows[headerRowIndex])
        : buildFallbackColumnMap(cleanRows[0]);
    const dataRows = cleanRows.slice(headerRowIndex >= 0 ? headerRowIndex + 1 : 0);

    const blocks = [];
    dataRows.forEach((row) => {
        const content = getSpreadsheetCell(row, columnMap.content);
        if (!content) return;

        const rowNumber = blocks.length + 1;
        const typeText = detectSpreadsheetQuestionType(getSpreadsheetCell(row, columnMap.type));
        const header = typeText ? `${rowNumber}. ${typeText}：${content}` : `${rowNumber}. ${content}`;
        const lines = [header];

        const options = SPREADSHEET_OPTION_LABELS
            .map((label) => ({ label, value: getSpreadsheetCell(row, columnMap.options.get(label) ?? -1) }))
            .filter((option) => option.value);
        if (options.length > 0) {
            lines.push('选项:');
            options.forEach((option) => {
                lines.push(`${option.label}. ${option.value}`);
            });
        }

        const answer = getSpreadsheetCell(row, columnMap.answer);
        if (answer) lines.push(`答案: ${answer}`);

        const analysis = getSpreadsheetCell(row, columnMap.analysis);
        if (analysis) lines.push(`解析: ${analysis}`);

        blocks.push(lines.join('\n'));
    });

    if (blocks.length === 0) return '';
    const sourceLabel = fileName ? `# 来源：${fileName}` : '';
    return [sourceLabel, ...blocks].filter(Boolean).join('\n\n');
};

const decodeSpreadsheetCsv = (arrayBuffer) => {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
    } catch (err) {
        try {
            return new TextDecoder('gb18030').decode(arrayBuffer);
        } catch (fallbackErr) {
            return new TextDecoder().decode(arrayBuffer);
        }
    }
};

const getExcelParser = () => {
    if (!excelParserPromise) {
        excelParserPromise = import('exceljs').then((module) => module.default || module);
    }
    return excelParserPromise;
};

const getCsvParser = () => {
    if (!csvParserPromise) {
        csvParserPromise = import('papaparse').then((module) => module.default || module);
    }
    return csvParserPromise;
};

function inspectXlsxArchive(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minimumEocdSize = 22;
    const firstCandidate = Math.max(0, bytes.byteLength - 65557);
    let eocdOffset = -1;
    for (let offset = bytes.byteLength - minimumEocdSize; offset >= firstCandidate; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0) throw new Error('XLSX 文件不是有效的 ZIP 文档');

    const entryCount = view.getUint16(eocdOffset + 10, true);
    const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
        throw new Error('不支持 ZIP64 格式的 XLSX 文件');
    }
    if (entryCount > MAX_XLSX_ENTRIES || centralDirectoryOffset + centralDirectorySize > bytes.byteLength) {
        throw new Error('XLSX 压缩包结构或条目数量超出限制');
    }

    let cursor = centralDirectoryOffset;
    let uncompressedBytes = 0;
    for (let index = 0; index < entryCount; index += 1) {
        if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
            throw new Error('XLSX 压缩包目录损坏');
        }
        const uncompressedSize = view.getUint32(cursor + 24, true);
        const fileNameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        if (uncompressedSize === 0xffffffff) throw new Error('不支持 ZIP64 格式的 XLSX 文件');
        uncompressedBytes += uncompressedSize;
        if (uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
            throw new Error('XLSX 解压后内容不能超过 50 MiB');
        }
        cursor += 46 + fileNameLength + extraLength + commentLength;
    }
}

function parseCsvRows(Papa, source) {
    const rows = [];
    const errors = [];
    let dimensionError = null;
    Papa.parse(source, {
        skipEmptyLines: true,
        dynamicTyping: false,
        step(result, parser) {
            if (result.errors?.length) errors.push(...result.errors);
            const row = Array.isArray(result.data) ? result.data : [];
            if (rows.length >= MAX_SPREADSHEET_ROWS || row.length > MAX_SPREADSHEET_COLUMNS) {
                dimensionError = new Error('表格最多允许 10000 行、100 列');
                parser.abort();
                return;
            }
            rows.push(row);
        },
    });
    if (dimensionError) throw dimensionError;
    if (errors.length) throw new Error(`CSV 解析失败：${errors[0].message}`);
    return rows;
}

export async function readQuestionsFromSpreadsheetFile(file) {
    if (!file) return '';

    if (file.size > MAX_SPREADSHEET_FILE_BYTES) throw new Error('表格文件不能超过 10 MiB');
    const fileName = file.name || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    if (!['csv', 'xlsx'].includes(extension)) throw new Error('只支持 .xlsx 或 .csv 文件');
    const isCsv = extension === 'csv';
    const arrayBuffer = await file.arrayBuffer();
    let rows;
    if (isCsv) {
        const Papa = await getCsvParser();
        rows = parseCsvRows(Papa, decodeSpreadsheetCsv(arrayBuffer));
    } else {
        inspectXlsxArchive(arrayBuffer);
        const ExcelJS = await getExcelParser();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) return '';
        if (sheet.rowCount > MAX_SPREADSHEET_ROWS || sheet.columnCount > MAX_SPREADSHEET_COLUMNS) {
            throw new Error('表格最多允许 10000 行、100 列');
        }
        rows = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
            rows.push(Array.from({ length: sheet.columnCount }, (_, index) => {
                const cell = row.getCell(index + 1);
                if (cell.value == null) return '';
                if (cell.value instanceof Date) return cell.value.toISOString();
                if (typeof cell.value === 'object' && 'result' in cell.value) return String(cell.value.result ?? '');
                if (typeof cell.value === 'object' && Array.isArray(cell.value.richText)) {
                    return cell.value.richText.map((part) => part.text || '').join('');
                }
                return cell.text || String(cell.value);
            }));
        });
    }
    return createQuestionTextFromSpreadsheetRows(rows, fileName);
}

export function parseQuestions(text) {
    if (!text || typeof text !== 'string' || !text.trim()) return [];

    const questions = [];
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
        .map((l, index) => ({
            text: l.replace(/\u3000/g, ' ').trim(),
            lineNumber: index + 1,
        }))
        .filter((item) => item.text);

    let currentQuestion = null;
    let expectingOptions = false;
    const createQuestion = (sourceLine = null) => ({
        type: 'single',
        content: '',
        options: [],
        answer: [],
        analysis: '',
        sourceStartLine: sourceLine,
        sourceEndLine: sourceLine,
    });

    const touchQuestionLine = (lineNumber) => {
        if (!currentQuestion) currentQuestion = createQuestion(lineNumber);
        if (!currentQuestion.sourceStartLine) currentQuestion.sourceStartLine = lineNumber;
        currentQuestion.sourceEndLine = lineNumber;
    };

    const saveCurrentQuestion = () => {
        if (!currentQuestion) return;
        const q = {
            ...currentQuestion,
            content: String(currentQuestion.content || '').trim(),
            analysis: String(currentQuestion.analysis || '').trim(),
            sourceStartLine: currentQuestion.sourceStartLine,
            sourceEndLine: currentQuestion.sourceEndLine || currentQuestion.sourceStartLine,
            options: (currentQuestion.options || [])
                .map((opt) => ({ label: toHalfWidthLabel(opt.label), value: String(opt.value || '').trim() }))
                .filter((opt) => /^[A-H]$/.test(opt.label) && opt.value),
            answer: normalizeAnswerList(currentQuestion.answer || []),
        };
        if (!q.content) { currentQuestion = null; return; }
        if (q.type !== 'judge' && q.options.length === 2) {
            if (isJudgeKeyword(q.options[0].value) && isJudgeKeyword(q.options[1].value)) q.type = 'judge';
        }
        if (q.type !== 'judge' && q.answer.length > 0 && q.answer.every((a) => isJudgeKeyword(a))) q.type = 'judge';
        if (q.type !== 'judge' && q.type !== 'fill' && q.options.length === 0 && q.answer.some((a) => !/^[A-H]$/i.test(a))) {
            q.type = 'fill';
        }
        if (q.type === 'judge') {
            if (q.options.length === 0) q.options = [{ label: 'A', value: '正确' }, { label: 'B', value: '错误' }];
            if (q.answer.length > 0) { const mapped = mapJudgeAnswerToAB(q.answer[0], q); if (mapped) q.answer = [mapped]; }
        }
        if (q.type !== 'judge' && q.type !== 'fill' && q.answer.length > 1) q.type = 'multiple';
        if (q.type !== 'fill') {
            q.answer = q.answer.map((a) => String(a).trim().toUpperCase());
            const validLabels = new Set(q.options.map((o) => o.label));
            if (q.answer.length > 0 && q.answer.every((a) => /^[A-H]$/.test(a))) q.answer = q.answer.filter((a) => validLabels.has(a));
        }
        if ((q.type === 'fill' && q.content) || (q.type !== 'fill' && q.options.length > 0)) questions.push(q);
        currentQuestion = null;
    };

    for (let index = 0; index < lines.length; index++) {
        const { text: line, lineNumber } = lines[index];
        if (isOptionHeaderLine(line)) {
            expectingOptions = true;
            touchQuestionLine(lineNumber);
            continue;
        }
        if (isScoreLine(line)) continue;
        let headerMatch = line.match(/^(\d+)\s*[\.．、\)）]\s*(.*)$/);
        if (!headerMatch) headerMatch = line.match(/^第\s*(\d+)\s*题\s*[\.．、\)）]?\s*(.*)$/);
        if (!headerMatch) headerMatch = line.match(/^[\(（](\d+)[\)）]\s*(.*)$/);
        if (headerMatch) {
            saveCurrentQuestion();
            currentQuestion = createQuestion(lineNumber);
            expectingOptions = false;
            const meta = headerMatch[2] || '';
            detectTypeFromMeta(currentQuestion, meta);
            const headerContent = extractContentFromHeaderMeta(meta);
            if (headerContent) currentQuestion.content = headerContent;
            continue;
        }
        const typeHeaderMeta = getTypeHeaderMeta(line);
        if (typeHeaderMeta && shouldStartFromTypeHeader(currentQuestion)) {
            saveCurrentQuestion();
            currentQuestion = createQuestion(lineNumber);
            expectingOptions = false;
            detectTypeFromMeta(currentQuestion, typeHeaderMeta);
            const headerContent = extractContentFromHeaderMeta(typeHeaderMeta);
            if (headerContent) currentQuestion.content = headerContent;
            continue;
        }
        if (shouldStartImplicitQuestion(line, currentQuestion, lines, index)) {
            saveCurrentQuestion();
            currentQuestion = createQuestion(lineNumber);
            currentQuestion.content = line;
            expectingOptions = false;
            continue;
        }
        touchQuestionLine(lineNumber);
        const contentMatch = line.match(/^(?:题目|题干|问题|question|q)\s*[:：]\s*(.+)$/i);
        if (contentMatch) {
            if (currentQuestion.content || currentQuestion.options.length > 0 || currentQuestion.answer.length > 0 || currentQuestion.analysis) {
                saveCurrentQuestion();
                currentQuestion = createQuestion(lineNumber);
            }
            touchQuestionLine(lineNumber);
            currentQuestion.content = contentMatch[1].trim();
            expectingOptions = false;
            continue;
        }
        const answerMatch = line.match(/^\s*(?:参考|正确)?答案(?:是)?\s*[:：]?\s*(.+)$/i);
        if (answerMatch) { currentQuestion.answer = parseAnswer(answerMatch[1]); expectingOptions = false; continue; }
        const analysisMatch = line.match(/^解析\s*[:：]?\s*(.*)$/);
        if (analysisMatch) {
            const fragment = analysisMatch[1].trim();
            if (fragment) currentQuestion.analysis = currentQuestion.analysis ? `${currentQuestion.analysis}\n${fragment}` : fragment;
            continue;
        }
        if (parseInlineOptions(line, currentQuestion, expectingOptions)) { expectingOptions = true; continue; }
        if (currentQuestion.options.length === 0 && currentQuestion.answer.length === 0 && !currentQuestion.analysis) {
            currentQuestion.content = currentQuestion.content ? `${currentQuestion.content}\n${line}` : line;
        } else {
            currentQuestion.analysis = currentQuestion.analysis ? `${currentQuestion.analysis}\n${line}` : line;
        }
    }
    saveCurrentQuestion();
    return questions;
}

export function formatForExamDetail(questions) {
    return questions.map((q) => ({
        _id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        type: q.type,
        content: q.content,
        sourceStartLine: q.sourceStartLine || null,
        sourceEndLine: q.sourceEndLine || q.sourceStartLine || null,
        options: q.options.map((opt) => ({
            label: opt.label,
            value: opt.value,
            isAnswer: q.answer.includes(opt.label),
        })),
        analysis: q.analysis.trim(),
        fillAnswer: q.type === 'fill' ? (q.answer[0] || '') : '',
    }));
}
