import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readQuestionsFromSpreadsheetFile } from '../src/utils/batchImport.js';

function file(name, text, type = 'text/csv') {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
}

async function xlsxFile(workbook, name = 'questions.xlsx') {
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    name,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

test('CSV imports quoted cells into the question parser format', async () => {
  const result = await readQuestionsFromSpreadsheetFile(file(
    'questions.csv',
    '题目,类型,选项A,选项B,答案,解析\n"1, 加 1 等于？",单选题,1,2,B,基础题'
  ));
  assert.match(result, /1, 加 1 等于？/);
  assert.match(result, /答案: B/);
  assert.match(result, /解析: 基础题/);
});

test('spreadsheet imports reject oversized files before parsing', async () => {
  await assert.rejects(
    readQuestionsFromSpreadsheetFile({ name: 'large.xlsx', size: 11 * 1024 * 1024 }),
    /10 MiB/
  );
});

test('CSV imports enforce row and column limits while parsing', async () => {
  const tooManyColumns = Array.from({ length: 101 }, (_, index) => `c${index}`).join(',');
  await assert.rejects(
    readQuestionsFromSpreadsheetFile(file('wide.csv', tooManyColumns)),
    /10000 行、100 列/
  );

  const tooManyRows = Array.from({ length: 10001 }, () => 'question').join('\n');
  await assert.rejects(
    readQuestionsFromSpreadsheetFile(file('tall.csv', tooManyRows)),
    /10000 行、100 列/
  );
});

test('XLSX imports preserve sparse columns', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.getCell('A1').value = '题目';
  sheet.getCell('C1').value = '选项A';
  sheet.getCell('A2').value = '稀疏列题目';
  sheet.getCell('C2').value = '保留的选项';

  const result = await readQuestionsFromSpreadsheetFile(await xlsxFile(workbook));
  assert.match(result, /A\. 保留的选项/);
});

test('XLSX imports reject sparse dimensions beyond the limits', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Questions');
  sheet.getCell('A1').value = '题目';
  sheet.getCell('CW1').value = '第 101 列';
  sheet.getCell('A10001').value = '第 10001 行';

  await assert.rejects(
    readQuestionsFromSpreadsheetFile(await xlsxFile(workbook)),
    /10000 行、100 列/
  );
});

test('legacy XLS files are rejected explicitly', async () => {
  await assert.rejects(
    readQuestionsFromSpreadsheetFile(file('legacy.xls', 'not-an-xlsx', 'application/vnd.ms-excel')),
    /只支持 \.xlsx 或 \.csv/
  );
});
