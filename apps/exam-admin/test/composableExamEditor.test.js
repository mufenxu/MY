import assert from 'node:assert/strict';
import test from 'node:test';

import { useBatchImport } from '../src/features/exam-editor/useBatchImport.js';
import { useExamDetailData } from '../src/features/exam-editor/useExamDetailData.js';
import { useQuestionEditor } from '../src/features/exam-editor/useQuestionEditor.js';
import { useAiAnalysis } from '../src/features/exam-editor/useAiAnalysis.js';

function createMessageRecorder() {
  const calls = [];
  const record = (level) => (text) => {
    calls.push({ level, text });
    return { close() {} };
  };
  return {
    calls,
    info: record('info'),
    warning: record('warning'),
    success: record('success'),
    error: record('error'),
    last() {
      return calls[calls.length - 1];
    },
  };
}

test('batch import reports an empty paste through the injected message API', () => {
  const message = createMessageRecorder();
  const subject = useBatchImport({ canEdit: true, existingQuestions: [], message });

  subject.batchForm.text = '   ';
  const parsed = subject.runBatchParse();

  assert.deepEqual(parsed, []);
  assert.deepEqual(message.last(), { level: 'warning', text: '请输入题目文本' });
});

test('batch import surfaces the specific spreadsheet limit instead of a generic format hint', async () => {
  const message = createMessageRecorder();
  const subject = useBatchImport({ canEdit: true, existingQuestions: [], message });
  // 超过 10 MiB 的文件在读取前就被解析层拒绝，这条原因必须原样到达用户。
  const oversized = { name: 'big.xlsx', size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };

  await subject.handleBatchFileChange({ target: { files: [oversized], value: 'big.xlsx' } });

  assert.equal(message.last().level, 'error');
  assert.match(message.last().text, /10 MiB/);
});

test('exam detail data blocks saving a read-only paper through the injected message API', async () => {
  const message = createMessageRecorder();
  const calls = [];
  const subject = useExamDetailData({
    examApi: { saveQuestions: async () => { calls.push('save'); return { data: { code: 0 } }; } },
    questions: { value: [] },
    selectedIndex: { value: -1 },
    message,
  });
  subject.examInfo.readOnly = true;

  await subject.saveExam();

  assert.deepEqual(calls, []);
  assert.deepEqual(message.last(), { level: 'warning', text: '管理员分配的试卷只能查看，不能保存修改' });
});

test('question editor and AI analysis accept injected feedback without touching Element Plus', () => {
  const message = createMessageRecorder();
  const messageBox = { confirm: async () => true };

  assert.doesNotThrow(() => useQuestionEditor({
    canEdit: { value: false },
    currentQuestion: { value: null },
    questions: { value: [] },
    selectedIndex: { value: -1 },
    message,
    messageBox,
  }));
  assert.doesNotThrow(() => useAiAnalysis({
    canEdit: { value: false },
    canBatchGenerateAi: { value: false },
    currentQuestion: { value: null },
    examApi: {},
    isDirty: { value: false },
    questions: { value: [] },
    selectedIndex: { value: -1 },
    message,
    messageBox,
  }));
});
