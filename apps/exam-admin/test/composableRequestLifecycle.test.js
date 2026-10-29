import assert from 'node:assert/strict';
import test from 'node:test';
import { ref } from 'vue';

import { useExamResults } from '../src/features/exam-results/useExamResults.js';
import { useFeedback } from '../src/features/feedback/useFeedback.js';
import { usePersonalCategories } from '../src/features/personal-categories/usePersonalCategories.js';

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

function createMessageBox({ confirm } = {}) {
  const calls = [];
  return {
    calls,
    async confirm(text, title) {
      calls.push({ text, title });
      if (confirm) return confirm();
      return 'confirm';
    },
  };
}

/**
 * 请求生命周期替身：记录 begin/finish 顺序，可模拟「请求在飞行中被中断」。
 */
function createRequestHarness() {
  const calls = [];
  const harness = {
    calls,
    abortNext: false,
    beginViewRequest(key) {
      const controller = new AbortController();
      if (harness.abortNext) {
        harness.abortNext = false;
        controller.abort();
      }
      calls.push(`begin:${key}`);
      return controller;
    },
    finishViewRequest(key, controller) {
      calls.push(`finish:${key}:${controller.signal.aborted}`);
    },
    quietRequestConfig(controller) {
      return { signal: controller.signal, quiet: true };
    },
  };
  return harness;
}

function composeRequestDeps(harness) {
  return {
    beginViewRequest: harness.beginViewRequest,
    finishViewRequest: harness.finishViewRequest,
    quietRequestConfig: harness.quietRequestConfig,
  };
}

function createExamResultsSubject({ isConsoleMode = false, rejectListWith = null } = {}) {
  const message = createMessageRecorder();
  const harness = createRequestHarness();
  const calls = { list: [], delete: [] };
  const loading = ref(false);

  const subject = useExamResults({
    adminApi: {
      async listExamResults(params, config) {
        calls.list.push({ params, config });
        if (rejectListWith) throw rejectListWith;
        return { data: { code: 0, data: { list: [{ _id: 'r1' }], total: 1 } } };
      },
      async deleteExamResults(ids) {
        calls.delete.push(ids);
        return { data: { code: 0, message: '已删除 2 条' } };
      },
    },
    isConsoleMode: { value: isConsoleMode },
    loading,
    ...composeRequestDeps(harness),
    message,
  });

  return { ...subject, message, harness, calls, loading };
}

test('exam results: console identities never request the list or open the delete dialog', async () => {
  const subject = createExamResultsSubject({ isConsoleMode: true });
  subject.selectedExamResults.value = [{ _id: 'r1' }];

  await subject.loadExamResults();
  subject.openDeleteDialog();

  assert.equal(subject.calls.list.length, 0);
  assert.equal(subject.deleteDialog.visible, false);
  assert.equal(subject.message.calls.length, 0);
});

test('exam results: paging and filters are forwarded with the shared abort config', async () => {
  const subject = createExamResultsSubject();
  subject.examResultsFilter.categoryId = 'cat-1';

  await subject.loadExamResults(3);

  const [request] = subject.calls.list;
  assert.deepEqual(request.params, {
    page: 3,
    pageSize: 20,
    categoryId: 'cat-1',
    userId: undefined,
  });
  assert.equal(request.config.quiet, true);
  assert.ok(request.config.signal instanceof AbortSignal);
});

test('exam results: a successful load fills the table and always releases the request slot', async () => {
  const subject = createExamResultsSubject();

  await subject.loadExamResults();

  assert.deepEqual(subject.examResults.list, [{ _id: 'r1' }]);
  assert.equal(subject.examResults.total, 1);
  assert.deepEqual(subject.harness.calls, ['begin:examResults', 'finish:examResults:false']);
});

test('exam results: a superseded request drops its payload silently', async () => {
  const subject = createExamResultsSubject();
  subject.harness.abortNext = true;

  await subject.loadExamResults();

  assert.deepEqual(subject.examResults.list, []);
  assert.equal(subject.examResults.total, 0);
  assert.equal(subject.message.calls.length, 0, '中断不应提示用户');
  assert.deepEqual(subject.harness.calls, ['begin:examResults', 'finish:examResults:true']);
});

test('exam results: a failed load reports once and still releases the request slot', async () => {
  const subject = createExamResultsSubject({ rejectListWith: new Error('boom') });

  await subject.loadExamResults();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '加载考试记录失败' });
  assert.deepEqual(subject.harness.calls, ['begin:examResults', 'finish:examResults:false']);
});

test('exam results: batch delete refuses to open without a selection', () => {
  const subject = createExamResultsSubject();

  subject.openDeleteDialog();

  assert.equal(subject.deleteDialog.visible, false);
  assert.deepEqual(subject.message.last(), { level: 'warning', text: '请先选择要删除的记录' });
});

test('exam results: batch delete issues a math challenge before deleting', () => {
  const subject = createExamResultsSubject();
  subject.handleExamResultSelection([{ _id: 'r1' }]);

  subject.openDeleteDialog();

  assert.equal(subject.deleteDialog.visible, true);
  assert.match(subject.deleteDialog.mathQuestion, /^\d+ [+×-] \d+ = \?$/);
  assert.equal(typeof subject.deleteDialog.mathAnswer, 'number');
  assert.equal(subject.deleteDialog.userInput, '');
});

test('exam results: a wrong challenge answer regenerates the challenge and deletes nothing', async () => {
  const subject = createExamResultsSubject();
  subject.handleExamResultSelection([{ _id: 'r1' }]);
  subject.openDeleteDialog();
  subject.deleteDialog.userInput = String(subject.deleteDialog.mathAnswer + 1);

  await subject.confirmBatchDelete();

  assert.equal(subject.calls.delete.length, 0);
  assert.deepEqual(subject.message.last(), { level: 'error', text: '验证答案错误，请重新输入' });
  assert.equal(subject.deleteDialog.userInput, '', '重新出题时应清空上次输入');
  assert.equal(subject.deleteDialog.visible, true);
});

test('exam results: a correct challenge answer deletes the selection and reloads the list', async () => {
  const subject = createExamResultsSubject();
  subject.handleExamResultSelection([{ _id: 'r1' }, { _id: 'r2' }]);
  subject.openDeleteDialog();
  subject.deleteDialog.userInput = String(subject.deleteDialog.mathAnswer);

  await subject.confirmBatchDelete();

  assert.deepEqual(subject.calls.delete, [['r1', 'r2']]);
  assert.equal(subject.deleteDialog.visible, false);
  assert.deepEqual(subject.selectedExamResults.value, []);
  assert.equal(subject.calls.list.length, 1, '删除成功后应刷新列表');
  assert.equal(subject.loading.value, false);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '已删除 2 条' });
});

test('exam results: clearing the selection tolerates a missing table ref', () => {
  const subject = createExamResultsSubject();
  let cleared = 0;
  subject.selectedExamResults.value = [{ _id: 'r1' }];

  subject.examResultsTable.value = { clearSelection: () => { cleared += 1; } };
  subject.clearExamResultSelection();
  assert.equal(cleared, 1);
  assert.deepEqual(subject.selectedExamResults.value, []);

  subject.examResultsTable.value = null;
  assert.doesNotThrow(() => subject.clearExamResultSelection());
});

function createPersonalCategoriesSubject({ isConsoleMode = false, rejectListWith = null } = {}) {
  const message = createMessageRecorder();
  const harness = createRequestHarness();
  const calls = { list: [], questions: [], detail: [] };

  const subject = usePersonalCategories({
    adminApi: {
      async listPersonalCategories(params, config) {
        calls.list.push({ params, config });
        if (rejectListWith) throw rejectListWith;
        return { data: { code: 0, data: { list: [{ _id: 'c1' }], total: 1, page: 2, limit: 30 } } };
      },
      async listPersonalCategoryQuestions(categoryId, params) {
        calls.questions.push({ categoryId, params });
        return { data: { code: 0, data: { list: [{ _id: 'q1' }], total: 1, page: 1, limit: 50 } } };
      },
      async getPersonalCategory(categoryId) {
        calls.detail.push(categoryId);
        return { data: { code: 0, data: { category: { _id: categoryId, name: '最新名称' }, stats: { total: 3 } } } };
      },
    },
    isConsoleMode: { value: isConsoleMode },
    ...composeRequestDeps(harness),
    message,
  });

  return { ...subject, message, harness, calls };
}

test('personal categories: default query keeps the published/source filters explicit', () => {
  const subject = createPersonalCategoriesSubject();

  assert.deepEqual(subject.buildPersonalCategoryParams(), {
    page: 1,
    limit: 20,
    keyword: undefined,
    ownerStudyId: undefined,
    publishStatus: 'all',
    source: 'all',
  });
});

test('personal categories: filters and page size reach the request', () => {
  const subject = createPersonalCategoriesSubject();
  subject.personalCategoryFilter.keyword = '高数';
  subject.personalCategoryFilter.ownerStudyId = 'S001';
  subject.personalCategoryFilter.publishStatus = 'published';
  subject.personalCategories.limit = 50;

  assert.deepEqual(subject.buildPersonalCategoryParams(4), {
    page: 4,
    limit: 50,
    keyword: '高数',
    ownerStudyId: 'S001',
    publishStatus: 'published',
    source: 'all',
  });
});

test('personal categories: the list adopts server pagination instead of the requested page', async () => {
  const subject = createPersonalCategoriesSubject();

  await subject.loadPersonalCategories(1);

  assert.deepEqual(subject.personalCategories.list, [{ _id: 'c1' }]);
  assert.equal(subject.personalCategories.total, 1);
  assert.equal(subject.personalCategories.page, 2);
  assert.equal(subject.personalCategories.limit, 30);
});

test('personal categories: aborted loads keep the previous page intact', async () => {
  const subject = createPersonalCategoriesSubject();
  subject.harness.abortNext = true;

  await subject.loadPersonalCategories(2);

  assert.deepEqual(subject.personalCategories.list, []);
  assert.equal(subject.personalCategories.page, 1);
  assert.equal(subject.message.calls.length, 0);
});

test('personal categories: failures surface the server message', async () => {
  const subject = createPersonalCategoriesSubject({
    rejectListWith: { response: { data: { message: '无权重' } } },
  });

  await subject.loadPersonalCategories();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '无权重' });
});

test('personal categories: question loading needs a selected category', async () => {
  const subject = createPersonalCategoriesSubject();

  await subject.loadPersonalCategoryQuestions();

  assert.equal(subject.calls.questions.length, 0);
  assert.equal(subject.personalCategoryDialog.questionsLoading, false);
});

test('personal categories: question pages fill the dialog and clear the loading flag', async () => {
  const subject = createPersonalCategoriesSubject();
  subject.personalCategoryDialog.category = { _id: 'c9' };

  await subject.loadPersonalCategoryQuestions(1);

  assert.deepEqual(subject.calls.questions, [{ categoryId: 'c9', params: { page: 1, limit: 50 } }]);
  assert.deepEqual(subject.personalCategoryDialog.questions, [{ _id: 'q1' }]);
  assert.equal(subject.personalCategoryDialog.questionsTotal, 1);
  assert.equal(subject.personalCategoryDialog.questionsLoading, false);
});

test('personal categories: opening a detail ignores rows without an id', async () => {
  const subject = createPersonalCategoriesSubject();

  await subject.openPersonalCategoryDetail({});
  await subject.openPersonalCategoryDetail(null);

  assert.equal(subject.calls.detail.length, 0);
  assert.equal(subject.personalCategoryDialog.visible, false);
});

test('personal categories: opening a detail prefills from the server and loads questions', async () => {
  const subject = createPersonalCategoriesSubject();

  await subject.openPersonalCategoryDetail({ _id: 'c1', name: '旧名称' });

  assert.equal(subject.personalCategoryDialog.visible, true);
  assert.equal(subject.personalCategoryDialog.category.name, '最新名称');
  assert.deepEqual(subject.personalCategoryDialog.stats, { total: 3 });
  assert.equal(subject.calls.questions.length, 1, '打开详情后应自动加载首页题目');
  assert.equal(subject.personalCategoryDialog.loading, false);
});

test('personal categories: a failed detail request closes the dialog instead of showing stale data', async () => {
  const message = createMessageRecorder();
  const subject = usePersonalCategories({
    adminApi: {
      async getPersonalCategory() {
        throw { response: { data: { message: '题库不存在' } } };
      },
    },
    isConsoleMode: { value: false },
    ...composeRequestDeps(createRequestHarness()),
    message,
  });

  await subject.openPersonalCategoryDetail({ _id: 'c1' });

  assert.equal(subject.personalCategoryDialog.visible, false);
  assert.deepEqual(message.last(), { level: 'error', text: '题库不存在' });
  assert.equal(subject.personalCategoryDialog.loading, false);
});

function createFeedbackSubject({
  isConsoleMode = false,
  unread = false,
  rejectListWith = null,
  rejectMarkReadWith = null,
  confirmResult = null,
} = {}) {
  const message = createMessageRecorder();
  const messageBox = createMessageBox({ confirm: confirmResult });
  const harness = createRequestHarness();
  const calls = { list: [], create: [], reply: [], markRead: [], status: [] };
  const counters = { summary: 0 };

  const subject = useFeedback({
    adminApi: {
      async listFeedbacks(params, config) {
        calls.list.push({ params, config });
        if (rejectListWith) throw rejectListWith;
        return { data: { code: 0, data: { list: [{ _id: 'f1' }], total: 1, page: params.page, limit: params.limit } } };
      },
      async createFeedback(payload) {
        calls.create.push(payload);
        return { data: { code: 0 } };
      },
      async replyFeedback(id, payload) {
        calls.reply.push({ id, payload });
        return { data: { code: 0 } };
      },
      async markFeedbackReplyRead(id) {
        calls.markRead.push(id);
        if (rejectMarkReadWith) throw rejectMarkReadWith;
        return { data: { code: 0, data: { replyReadAt: '2026-10-29T00:00:00.000Z' } } };
      },
      async updateFeedbackStatus(id, payload) {
        calls.status.push({ id, payload });
        return { data: { code: 0 } };
      },
    },
    isConsoleMode: { value: isConsoleMode },
    ...composeRequestDeps(harness),
    loadFeedbackSummary: async () => { counters.summary += 1; },
    isFeedbackReplyUnread: () => unread,
    message,
    messageBox,
  });

  return { ...subject, message, messageBox, harness, calls, counters };
}

test('feedback: the keyword filter is admin-only and status is always forwarded', async () => {
  const admin = createFeedbackSubject();
  admin.feedbackFilter.keyword = '闪退';
  admin.feedbackFilter.status = 'open';
  await admin.loadFeedbacks(2);
  assert.deepEqual(admin.calls.list[0].params, { page: 2, limit: 20, status: 'open', keyword: '闪退' });

  const consoleUser = createFeedbackSubject({ isConsoleMode: true });
  consoleUser.feedbackFilter.keyword = '闪退';
  await consoleUser.loadFeedbacks();
  assert.equal(consoleUser.calls.list[0].params.keyword, undefined);
});

test('feedback: a successful load refreshes the summary badge', async () => {
  const subject = createFeedbackSubject();

  await subject.loadFeedbacks();

  assert.deepEqual(subject.feedbacks.list, [{ _id: 'f1' }]);
  assert.equal(subject.feedbacks.total, 1);
  assert.equal(subject.counters.summary, 1);
});

test('feedback: aborted loads neither fill the table nor refresh the summary', async () => {
  const subject = createFeedbackSubject();
  subject.harness.abortNext = true;

  await subject.loadFeedbacks();

  assert.deepEqual(subject.feedbacks.list, []);
  assert.equal(subject.counters.summary, 0);
  assert.equal(subject.message.calls.length, 0);
});

test('feedback: load failures are reported without touching the summary', async () => {
  const subject = createFeedbackSubject({ rejectListWith: new Error('boom') });

  await subject.loadFeedbacks();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '加载反馈失败' });
  assert.equal(subject.counters.summary, 0);
});

test('feedback: opening an unread item writes a read receipt and refreshes the badge', async () => {
  const subject = createFeedbackSubject({ unread: true });
  const item = { _id: 'f1', replyContent: '已修复' };

  await subject.openFeedbackDetail(item);

  assert.deepEqual(subject.calls.markRead, ['f1']);
  assert.equal(item.replyReadAt, '2026-10-29T00:00:00.000Z');
  assert.equal(subject.feedbackDetailDialog.visible, true);
  assert.equal(subject.feedbackReplyForm.replyContent, '已修复');
  assert.equal(subject.counters.summary, 1);
});

test('feedback: a failed read receipt never blocks reading the detail', async () => {
  const subject = createFeedbackSubject({ unread: true, rejectMarkReadWith: new Error('offline') });
  const item = { _id: 'f1', replyContent: '' };

  await assert.doesNotReject(() => subject.openFeedbackDetail(item));

  assert.equal(subject.feedbackDetailDialog.visible, true);
  assert.equal(item.replyReadAt, undefined);
  assert.equal(subject.message.calls.length, 0, '已读回执失败不应打扰用户');
});

test('feedback: already-read items skip the read receipt request', async () => {
  const subject = createFeedbackSubject({ unread: false });

  await subject.openFeedbackDetail({ _id: 'f1' });

  assert.equal(subject.calls.markRead.length, 0);
  assert.equal(subject.counters.summary, 0);
});

test('feedback: submitting requires console identity and a complete form', async () => {
  const admin = createFeedbackSubject();
  admin.feedbackCreateForm.title = '标题';
  admin.feedbackCreateForm.content = '内容';
  await admin.submitFeedback();
  assert.equal(admin.calls.create.length, 0, '管理员身份只读，不应提交反馈');

  const consoleUser = createFeedbackSubject({ isConsoleMode: true });
  consoleUser.feedbackCreateForm.title = '   ';
  await consoleUser.submitFeedback();
  assert.equal(consoleUser.calls.create.length, 0);
  assert.deepEqual(consoleUser.message.last(), { level: 'warning', text: '请填写反馈标题和详细说明' });
});

test('feedback: submitting trims the payload and reloads the first page', async () => {
  const subject = createFeedbackSubject({ isConsoleMode: true });
  Object.assign(subject.feedbackCreateForm, {
    category: 'suggestion',
    title: '  希望支持导出  ',
    content: '  导出为 PDF  ',
    contact: '  qq@example.com  ',
  });

  await subject.submitFeedback();

  assert.deepEqual(subject.calls.create, [{
    category: 'suggestion',
    title: '希望支持导出',
    content: '导出为 PDF',
    contact: 'qq@example.com',
  }]);
  assert.equal(subject.feedbackCreateDialog.visible, false);
  assert.equal(subject.calls.list[0].params.page, 1);
  // loadFeedbacks 内部已刷新一次汇总，提交成功后外层再刷新一次，属既有的重复请求。
  assert.ok(subject.counters.summary >= 1, '提交后必须刷新未读汇总');
});

test('feedback: replying needs content and reloads the current page', async () => {
  const subject = createFeedbackSubject();
  subject.feedbackDetailDialog.item = { _id: 'f1' };
  subject.feedbacks.page = 3;

  await subject.replyFeedback();
  assert.equal(subject.calls.reply.length, 0);
  assert.deepEqual(subject.message.last(), { level: 'warning', text: '请输入回复内容' });

  subject.feedbackReplyForm.replyContent = '  已处理  ';
  subject.feedbackReplyForm.closeAfterReply = true;
  await subject.replyFeedback();

  assert.deepEqual(subject.calls.reply, [{
    id: 'f1',
    payload: { replyContent: '已处理', closeAfterReply: true },
  }]);
  assert.equal(subject.feedbackDetailDialog.visible, false);
  assert.equal(subject.calls.list[0].params.page, 3);
});

test('feedback: cancelling the close confirmation keeps the item open and silent', async () => {
  const subject = createFeedbackSubject({
    confirmResult: () => { throw 'cancel'; },
  });

  await subject.closeFeedback({ _id: 'f1' });

  assert.equal(subject.calls.status.length, 0);
  assert.equal(subject.message.calls.length, 0, '取消不是错误，不应提示');
});

test('feedback: confirming closes the item and reloads the list', async () => {
  const subject = createFeedbackSubject();
  subject.feedbackDetailDialog.visible = true;
  subject.feedbacks.page = 2;

  await subject.closeFeedback({ _id: 'f1' });

  assert.deepEqual(subject.calls.status, [{ id: 'f1', payload: { status: 'closed' } }]);
  assert.equal(subject.feedbackDetailDialog.visible, false);
  assert.equal(subject.calls.list[0].params.page, 2);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '反馈已关闭' });
});
