import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTick, reactive } from 'vue';

import { usePaperShares } from '../src/features/paper-share/usePaperShares.js';

// 分享二维码渲染依赖真实 DOM；测试环境给出空实现，让渲染调度走「找不到容器」分支即可。
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
};

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

function createMessageBox({ confirmImpl } = {}) {
  const calls = [];
  return {
    calls,
    async confirm(text, title) {
      calls.push({ text, title });
      if (confirmImpl) return confirmImpl();
      return 'confirm';
    },
  };
}

function createShareDialog() {
  return reactive({
    visible: false,
    loading: false,
    saving: false,
    category: null,
    shares: [],
    result: null,
    selectedShareId: '',
    form: {
      permission: 'view',
      expireMode: '7d',
      customExpiresAt: '',
      maxAcceptEnabled: false,
      maxAcceptCount: 0,
      note: '',
    },
  });
}

function createSubject({ isDemoManage = false, confirmImpl = null, rejectCreateWith = null, rejectListWith = null } = {}) {
  const message = createMessageRecorder();
  const messageBox = createMessageBox({ confirmImpl });
  const shareDialog = createShareDialog();
  const analysisDialog = reactive({
    visible: false,
    loading: false,
    category: null,
    data: null,
  });
  const calls = { list: [], create: [], analysis: [], revoke: [] };
  const rendered = [];

  const subject = usePaperShares({
    adminApi: {
      async listPaperShares(categoryId) {
        calls.list.push(categoryId);
        if (rejectListWith) throw rejectListWith;
        return { data: { data: [{ _id: 's1', shareCode: 'ABC' }] } };
      },
      async createPaperShare(categoryId, payload) {
        calls.create.push({ categoryId, payload });
        if (rejectCreateWith) throw rejectCreateWith;
        return { data: { data: { _id: 's9', shareCode: 'NEW', shareUrl: 'https://example.test/s/NEW' } } };
      },
      async getCategoryAnalysis(categoryId) {
        calls.analysis.push(categoryId);
        return { data: { data: { totalQuestions: 12 } } };
      },
      async revokePaperShare(shareId) {
        calls.revoke.push(shareId);
        return { data: { code: 0 } };
      },
    },
    shareDialog,
    analysisDialog,
    isDemoManage: { value: isDemoManage },
    renderQrcodeToElement: async (el, text, size) => {
      rendered.push({ el, text, size });
    },
    message,
    messageBox,
  });

  return { ...subject, shareDialog, analysisDialog, message, messageBox, calls, rendered };
}

test('paper share: resetting the form restores defaults and drops the previous result', () => {
  const subject = createSubject();
  subject.shareDialog.form.permission = 'edit';
  subject.shareDialog.form.note = '遗留备注';
  subject.shareDialog.result = { _id: 'old' };
  subject.shareDialog.selectedShareId = 'old';

  subject.resetShareForm();

  assert.deepEqual({ ...subject.shareDialog.form }, {
    permission: 'view',
    expireMode: '7d',
    customExpiresAt: '',
    maxAcceptEnabled: false,
    maxAcceptCount: 0,
    note: '',
  });
  assert.equal(subject.shareDialog.result, null);
  assert.equal(subject.shareDialog.selectedShareId, '');
});

test('paper share: expiry modes map to the expected deadlines', () => {
  const subject = createSubject();

  subject.shareDialog.form.expireMode = 'forever';
  assert.equal(subject.buildShareExpiresAt(), null);

  subject.shareDialog.form.expireMode = 'custom';
  subject.shareDialog.form.customExpiresAt = '2026-12-31T00:00:00.000Z';
  assert.equal(subject.buildShareExpiresAt(), '2026-12-31T00:00:00.000Z');

  subject.shareDialog.form.customExpiresAt = '';
  assert.equal(subject.buildShareExpiresAt(), null, '自定义模式未选时间时返回 null，由调用方拦截');

  const now = Date.now();
  const expectations = { '1d': 1, '7d': 7, '30d': 30 };
  for (const [mode, days] of Object.entries(expectations)) {
    subject.shareDialog.form.expireMode = mode;
    const drift = new Date(subject.buildShareExpiresAt()).getTime() - now - days * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(drift) < 5000, `${mode} 应约为 ${days} 天后，实际偏差 ${drift}ms`);
  }

  subject.shareDialog.form.expireMode = 'unknown';
  const fallbackDrift = new Date(subject.buildShareExpiresAt()).getTime() - now - 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(fallbackDrift) < 5000, '未知模式回退为 7 天');
});

test('paper share: identity prefers the record id and falls back to the share code', () => {
  const subject = createSubject();

  assert.equal(subject.getPaperShareIdentity({ _id: 'id-1', shareCode: 'CODE' }), 'id-1');
  assert.equal(subject.getPaperShareIdentity({ shareCode: 'CODE' }), 'CODE');
  assert.equal(subject.getPaperShareIdentity(null), '');
});

test('paper share: only the selected row is highlighted', () => {
  const subject = createSubject();
  subject.shareDialog.selectedShareId = 'id-1';

  assert.equal(subject.getPaperShareRowClass({ row: { _id: 'id-1' } }), 'is-selected-share');
  assert.equal(subject.getPaperShareRowClass({ row: { _id: 'id-2' } }), '');
});

test('paper share: selecting a record copies it instead of aliasing the row', () => {
  const subject = createSubject();
  const row = { _id: 's1', shareCode: 'ABC' };

  subject.selectPaperShare(row);
  assert.equal(subject.shareDialog.selectedShareId, 's1');
  assert.deepEqual({ ...subject.shareDialog.result }, row);
  assert.notEqual(subject.shareDialog.result, row, '选中结果应是副本，避免表格编辑串改');

  subject.shareDialog.selectedShareId = 'keep';
  subject.selectPaperShare(null);
  assert.equal(subject.shareDialog.selectedShareId, 'keep', '空行不应清空当前选择');
});

test('paper share: the list request needs a category and reports failures', async () => {
  const idle = createSubject();
  await idle.loadPaperShares();
  assert.equal(idle.calls.list.length, 0);

  const failing = createSubject({ rejectListWith: new Error('boom') });
  failing.shareDialog.category = { _id: 'cat-1' };
  await failing.loadPaperShares();
  assert.deepEqual(failing.message.last(), { level: 'error', text: '加载分享记录失败' });
  assert.equal(failing.shareDialog.loading, false);
});

test('paper share: a successful list fills the dialog state', async () => {
  const subject = createSubject();
  subject.shareDialog.category = { _id: 'cat-1' };

  await subject.loadPaperShares();

  assert.deepEqual(subject.calls.list, ['cat-1']);
  assert.deepEqual(subject.shareDialog.shares, [{ _id: 's1', shareCode: 'ABC' }]);
  assert.equal(subject.shareDialog.loading, false);
});

test('paper share: demo and read-only exams cannot be shared', async () => {
  const demo = createSubject({ isDemoManage: true });
  await demo.openShareDialog({ _id: 'cat-1' });
  assert.equal(demo.shareDialog.visible, false);
  assert.deepEqual(demo.message.last(), { level: 'warning', text: '示例题库不支持分享' });
  assert.equal(demo.calls.list.length, 0);

  const readOnly = createSubject();
  await readOnly.openShareDialog({ _id: 'cat-1', readOnly: true });
  assert.equal(readOnly.shareDialog.visible, false);
  assert.deepEqual(readOnly.message.last(), { level: 'warning', text: '只读试卷不能继续分享' });
});

test('paper share: opening the dialog resets the form and loads existing shares', async () => {
  const subject = createSubject();
  subject.shareDialog.form.note = '遗留备注';
  subject.shareDialog.shares = [{ _id: 'stale' }];

  await subject.openShareDialog({ _id: 'cat-1' });

  assert.equal(subject.shareDialog.visible, true);
  assert.equal(subject.shareDialog.category._id, 'cat-1');
  assert.equal(subject.shareDialog.form.note, '');
  assert.deepEqual(subject.calls.list, ['cat-1']);
});

test('paper share: analysis ignores rows without an id and reports failures', async () => {
  const subject = createSubject();
  await subject.openCategoryAnalysis({});
  assert.equal(subject.calls.analysis.length, 0);

  await subject.openCategoryAnalysis({ _id: 'cat-1' });
  assert.deepEqual(subject.calls.analysis, ['cat-1']);
  assert.deepEqual({ ...subject.analysisDialog.data }, { totalQuestions: 12 });
  assert.equal(subject.analysisDialog.loading, false);
});

test('paper share: creating a share validates the custom expiry first', async () => {
  const noCategory = createSubject();
  await noCategory.createPaperShare();
  assert.equal(noCategory.calls.create.length, 0);

  const subject = createSubject();
  subject.shareDialog.category = { _id: 'cat-1' };
  subject.shareDialog.form.expireMode = 'custom';
  subject.shareDialog.form.customExpiresAt = '';

  await subject.createPaperShare();

  assert.equal(subject.calls.create.length, 0);
  assert.deepEqual(subject.message.last(), { level: 'warning', text: '请选择自定义过期时间' });
});

test('paper share: creating a share posts the normalised payload and selects the result', async () => {
  const subject = createSubject();
  subject.shareDialog.category = { _id: 'cat-1' };
  subject.shareDialog.form.permission = 'edit';
  subject.shareDialog.form.expireMode = 'forever';
  subject.shareDialog.form.maxAcceptEnabled = true;
  subject.shareDialog.form.maxAcceptCount = '5';
  subject.shareDialog.form.note = '给同事';

  await subject.createPaperShare();

  assert.deepEqual(subject.calls.create, [{
    categoryId: 'cat-1',
    payload: {
      permission: 'edit',
      expiresAt: null,
      maxAcceptCount: 5,
      note: '给同事',
    },
  }]);
  assert.equal(subject.shareDialog.result._id, 's9');
  assert.equal(subject.shareDialog.selectedShareId, 's9');
  assert.equal(subject.shareDialog.saving, false);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '分享已生成' });
  assert.deepEqual(subject.calls.list, ['cat-1'], '生成后应刷新分享记录');
  await nextTick();
});

test('paper share: a disabled accept limit is sent as zero', async () => {
  const subject = createSubject();
  subject.shareDialog.category = { _id: 'cat-1' };
  subject.shareDialog.form.maxAcceptEnabled = false;
  subject.shareDialog.form.maxAcceptCount = '9';

  await subject.createPaperShare();

  assert.equal(subject.calls.create[0].payload.maxAcceptCount, 0);
  await nextTick();
});

test('paper share: failures while creating a share keep the dialog open', async () => {
  const subject = createSubject({ rejectCreateWith: { response: { data: { message: '配额已满' } } } });
  subject.shareDialog.category = { _id: 'cat-1' };
  subject.shareDialog.visible = true;

  await subject.createPaperShare();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '配额已满' });
  assert.equal(subject.shareDialog.visible, true);
  assert.equal(subject.shareDialog.saving, false);
});

test('paper share: cancelling a revoke stays silent and calls nothing', async () => {
  const subject = createSubject({ confirmImpl: () => { throw 'cancel'; } });

  await subject.revokePaperShare({ _id: 's1' });

  assert.equal(subject.calls.revoke.length, 0);
  assert.equal(subject.message.calls.length, 0);
});

test('paper share: confirming a revoke calls the API and reloads the list', async () => {
  const subject = createSubject();
  subject.shareDialog.category = { _id: 'cat-1' };

  await subject.revokePaperShare({ _id: 's1' });

  assert.deepEqual(subject.calls.revoke, ['s1']);
  assert.deepEqual(subject.calls.list, ['cat-1']);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '分享已撤销' });
});
