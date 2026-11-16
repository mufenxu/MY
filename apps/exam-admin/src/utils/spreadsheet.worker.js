import { readQuestionsFromSpreadsheetFile } from './batchImport.js';

globalThis.onmessage = async ({ data: { arrayBuffer, fileName } }) => {
  try {
    const file = new globalThis.File([arrayBuffer], fileName);
    const text = await readQuestionsFromSpreadsheetFile(file);
    globalThis.postMessage({ text });
  } catch (error) {
    globalThis.postMessage({ error: error.message || '表格解析失败' });
  }
};
