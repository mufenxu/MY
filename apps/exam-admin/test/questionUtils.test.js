import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addQuestionOption,
  applyAnswerSelectionChange,
  applyQuestionTypeChange,
  createEditableQuestionFromApi,
  createQuestionSavePayload,
  countInvalidQuestions,
  countQuestionTypes,
  getCompletedQuestionCount,
  getCompletionPercent,
  getInvalidQuestionIndexes,
  removeQuestionOption,
  summarizeSelectedAnswer,
} from '../src/features/exam-editor/questionUtils.js';

const validSingle = {
  type: 'single',
  content: '1 + 1 等于？',
  options: [
    { label: 'A', value: '1', isAnswer: false },
    { label: 'B', value: '2', isAnswer: true },
  ],
};

const validFill = {
  type: 'fill',
  content: '首都是____。',
  fillAnswer: '北京',
  options: [],
};

const invalidSingle = {
  type: 'single',
  content: '缺少答案',
  options: [
    { label: 'A', value: 'A', isAnswer: false },
    { label: 'B', value: 'B', isAnswer: false },
  ],
};

test('question summary helpers count validity and completion consistently', () => {
  const questions = [validSingle, invalidSingle, validFill];

  assert.deepEqual(getInvalidQuestionIndexes(questions), [1]);
  assert.equal(countInvalidQuestions(questions), 1);
  assert.equal(getCompletedQuestionCount(questions, 1), 2);
  assert.equal(getCompletionPercent(questions, 2), 67);
});

test('question type counts ignore unknown types and default missing type to single', () => {
  assert.deepEqual(countQuestionTypes([
    validSingle,
    validFill,
    { type: 'judge' },
    { type: 'multiple' },
    { type: 'essay' },
    {},
  ]), {
    single: 2,
    multiple: 1,
    judge: 1,
    fill: 1,
  });
});

test('selected answer summaries match editor display rules', () => {
  assert.equal(summarizeSelectedAnswer(null), '未选择');
  assert.equal(summarizeSelectedAnswer(validSingle), 'B');
  assert.equal(summarizeSelectedAnswer({ ...validSingle, options: [] }), '未设置');
  assert.equal(summarizeSelectedAnswer(validFill), '北京');
  assert.equal(summarizeSelectedAnswer({ type: 'fill', fillAnswer: '' }), '未设置');
});

test('answer selection keeps single choice and judge questions mutually exclusive', () => {
  const question = {
    type: 'single',
    options: [
      { label: 'A', value: 'A', isAnswer: true },
      { label: 'B', value: 'B', isAnswer: true },
      { label: 'C', value: 'C', isAnswer: false },
    ],
  };

  applyAnswerSelectionChange(question, question.options[1]);

  assert.deepEqual(question.options.map((option) => option.isAnswer), [false, true, false]);
});

test('question type changes reset incompatible answer structures', () => {
  const question = {
    type: 'multiple',
    content: '题干',
    fillAnswer: '旧填空',
    options: [
      { label: 'A', value: 'A', isAnswer: true },
      { label: 'B', value: 'B', isAnswer: true },
    ],
  };

  applyQuestionTypeChange(question, 'single');

  assert.equal(question.type, 'single');
  assert.deepEqual(question.options.map((option) => option.isAnswer), [true, false]);

  applyQuestionTypeChange(question, 'fill');

  assert.equal(question.type, 'fill');
  assert.deepEqual(question.options, []);
  assert.equal(question.fillAnswer, '旧填空');

  applyQuestionTypeChange(question, 'judge');

  assert.equal(question.type, 'judge');
  assert.deepEqual(question.options, [
    { label: 'A', value: '正确', isAnswer: false },
    { label: 'B', value: '错误', isAnswer: false },
  ]);
  assert.equal(question.fillAnswer, '');
});

test('question option helpers enforce editor labels and limits', () => {
  const question = {
    type: 'multiple',
    options: [
      { label: 'A', value: 'A', isAnswer: false },
      { label: 'B', value: 'B', isAnswer: true },
    ],
  };

  assert.equal(addQuestionOption(question), true);
  assert.deepEqual(question.options.map((option) => option.label), ['A', 'B', 'C']);

  assert.equal(removeQuestionOption(question, 0), true);
  assert.deepEqual(question.options, [
    { label: 'A', value: 'B', isAnswer: true },
    { label: 'B', value: '', isAnswer: false },
  ]);

  question.options = Array.from({ length: 8 }, (_, index) => ({
    label: String.fromCharCode(65 + index),
    value: String(index),
    isAnswer: false,
  }));
  assert.equal(addQuestionOption(question), false);
  assert.equal(addQuestionOption({ type: 'fill', options: [] }), false);
});

test('question save payload trims values and preserves persisted ids only', () => {
  assert.deepEqual(createQuestionSavePayload({
    _id: 'question-1',
    type: 'single',
    content: '  题干  ',
    options: [
      { label: 'A', value: '  A  ', isAnswer: true },
      { label: 'B', value: ' B ', isAnswer: false },
    ],
    analysis: '  解析  ',
  }), {
    _id: 'question-1',
    type: 'single',
    content: '题干',
    options: [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
    ],
    answer: ['A'],
    analysis: '解析',
  });

  assert.deepEqual(createQuestionSavePayload({
    _id: 'temp_1',
    type: 'fill',
    content: ' 填空 ',
    fillAnswer: ' 答案 ',
    options: [{ label: 'A', value: '忽略', isAnswer: true }],
  }), {
    type: 'fill',
    content: '填空',
    options: [],
    answer: ['答案'],
    analysis: '',
  });
});

test('API questions are normalized for the editor form model', () => {
  assert.deepEqual(createEditableQuestionFromApi({
    _id: 'q1',
    type: 'multiple',
    content: '多选题',
    options: [
      { label: 'A', value: '选 A' },
      { label: 'B', value: '选 B' },
      { label: 'C', value: '选 C' },
    ],
    answer: ['A', 'C'],
    analysis: '',
  }), {
    _id: 'q1',
    type: 'multiple',
    content: '多选题',
    options: [
      { label: 'A', value: '选 A', isAnswer: true },
      { label: 'B', value: '选 B', isAnswer: false },
      { label: 'C', value: '选 C', isAnswer: true },
    ],
    analysis: '',
    analysisSource: 'manual',
    fillAnswer: '',
  });

  assert.equal(createEditableQuestionFromApi({
    type: 'fill',
    answer: ['填空答案'],
  }).fillAnswer, '填空答案');
});
