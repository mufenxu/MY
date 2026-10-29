import assert from 'node:assert/strict';
import test from 'node:test';
import { ref } from 'vue';

import { useLearningOperations } from '../src/features/learning-operations/useLearningOperations.js';
import { useUserAssignments } from '../src/features/user-assignments/useUserAssignments.js';

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

function createLearningSubject({ isConsoleMode = false, rejectListWith = null, confirmImpl = null } = {}) {
  const message = createMessageRecorder();
  const messageBox = createMessageBox({ confirmImpl });
  const harness = createRequestHarness();
  const calls = { plans: [], cohorts: [], options: [], saveCohort: [], savePlan: [], archiveCohort: [], archivePlan: [] };

  const subject = useLearningOperations({
    adminApi: {
      async listLearningPlans(params, config) {
        calls.plans.push({ params, config });
        if (rejectListWith) throw rejectListWith;
        return { data: { code: 0, data: [{ _id: 'p1', status: 'active', userOpenids: ['u1'], progress: { overdueCount: 1 } }] } };
      },
      async listCohorts(params, config) {
        calls.cohorts.push({ params, config });
        return { data: { code: 0, data: [{ _id: 'g1', name: '一班' }] } };
      },
      async getLearningPlanOptions(config) {
        calls.options.push({ config });
        return { data: { code: 0, data: { categories: [{ _id: 'c1' }], cohorts: [{ _id: 'g1' }], users: [{ openid: 'u1' }] } } };
      },
      async saveCohort(id, payload) {
        calls.saveCohort.push({ id, payload });
        return { data: { code: 0, message: '班组已保存' } };
      },
      async saveLearningPlan(id, payload) {
        calls.savePlan.push({ id, payload });
        return { data: { code: 0, message: '' } };
      },
      async archiveCohort(id) {
        calls.archiveCohort.push(id);
        return { data: { code: 0 } };
      },
      async archiveLearningPlan(id) {
        calls.archivePlan.push(id);
        return { data: { code: 0 } };
      },
    },
    isConsoleMode: { value: isConsoleMode },
    beginViewRequest: harness.beginViewRequest,
    finishViewRequest: harness.finishViewRequest,
    quietRequestConfig: harness.quietRequestConfig,
    message,
    messageBox,
  });

  return { ...subject, message, messageBox, harness, calls };
}

test('learning ops: stats only count active plans but aggregate unique users', () => {
  const subject = createLearningSubject();
  subject.learningPlans.value = [
    { status: 'active', userOpenids: ['u1', 'u2'], progress: { overdueCount: 2 } },
    { status: 'active', userOpenids: ['u2', 'u3'], progress: { overdueCount: '1' } },
    { status: 'archived', userOpenids: ['u9'], progress: { overdueCount: 5 } },
    { status: 'active', userOpenids: [], progress: {} },
  ];

  assert.deepEqual({ ...subject.learningOpsStats.value }, {
    activePlans: 3,
    assignedUsers: 3,
    overdueUsers: 3,
  });
});

test('learning ops: deadline formatting distinguishes open, invalid, and real deadlines', () => {
  const subject = createLearningSubject();

  assert.equal(subject.formatLearningDeadline(''), '长期有效');
  assert.equal(subject.formatLearningDeadline(null), '长期有效');
  assert.equal(subject.formatLearningDeadline('not-a-date'), '未设置');
  assert.match(subject.formatLearningDeadline('2026-10-29T02:30:00.000Z'), /^2026\//);
});

test('learning ops: plan state falls back to the plan status and then to active', () => {
  const subject = createLearningSubject();

  assert.equal(subject.learningPlanStateText({ progress: { state: 'overdue' } }), '有逾期');
  assert.equal(subject.learningPlanStateType({ progress: { state: 'overdue' } }), 'danger');
  assert.equal(subject.learningPlanStateText({ status: 'archived' }), '已归档');
  assert.equal(subject.learningPlanStateType({ status: 'completed' }), 'success');
  assert.equal(subject.learningPlanStateText({}), '进行中');
  assert.equal(subject.learningPlanStateType({}), 'primary');
  assert.equal(subject.learningPlanStateText({ progress: { state: 'unknown' } }), '进行中');
});

test('learning ops: category labels join the major name only when it exists', () => {
  const subject = createLearningSubject();

  assert.equal(subject.learningCategoryLabel({ name: '期中考', majorCategoryId: { name: '数学' } }), '数学 / 期中考');
  assert.equal(subject.learningCategoryLabel({ name: '期中考' }), '期中考');
  assert.equal(subject.learningCategoryLabel({ name: '期中考', majorCategoryId: {} }), '期中考');
});

test('learning ops: loading fans out to three endpoints and fills options', async () => {
  const subject = createLearningSubject();

  await subject.loadLearningOperations();

  assert.equal(subject.calls.plans.length, 1);
  assert.deepEqual(subject.calls.plans[0].params, { status: 'all' });
  assert.equal(subject.learningPlans.value.length, 1);
  assert.equal(subject.cohorts.value.length, 1);
  assert.deepEqual({ ...subject.learningPlanOptions }, {
    categories: [{ _id: 'c1' }],
    cohorts: [{ _id: 'g1' }],
    users: [{ openid: 'u1' }],
  });
  assert.deepEqual(subject.harness.calls, ['begin:learningPlans', 'finish:learningPlans:false']);
});

test('learning ops: aborted loads keep state and stay silent', async () => {
  const subject = createLearningSubject();
  subject.harness.abortNext = true;

  await subject.loadLearningOperations();

  assert.deepEqual(subject.learningPlans.value, []);
  assert.equal(subject.message.calls.length, 0);
  assert.deepEqual(subject.harness.calls, ['begin:learningPlans', 'finish:learningPlans:true']);
});

test('learning ops: load failures surface the server message', async () => {
  const subject = createLearningSubject({
    rejectListWith: { response: { data: { message: '服务不可用' } } },
  });

  await subject.loadLearningOperations();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '服务不可用' });
});

test('learning ops: console identities never load learning data', async () => {
  const subject = createLearningSubject({ isConsoleMode: true });

  await subject.loadLearningOperations();

  assert.equal(subject.calls.plans.length, 0);
  assert.equal(subject.harness.calls.length, 0);
});

test('learning ops: the cohort dialog copies member ids instead of aliasing them', () => {
  const subject = createLearningSubject();
  const cohort = { _id: 'g1', name: '一班', description: '备注', memberOpenids: ['u1'], status: 'archived' };

  subject.openCohortDialog(cohort);
  assert.equal(subject.cohortDialog.visible, true);
  assert.equal(subject.cohortDialog.id, 'g1');
  assert.deepEqual(subject.cohortDialog.form.memberOpenids, ['u1']);

  subject.cohortDialog.form.memberOpenids.push('u2');
  assert.deepEqual(cohort.memberOpenids, ['u1'], '编辑副本不应污染来源记录');

  subject.openCohortDialog(null);
  assert.equal(subject.cohortDialog.id, '');
  assert.deepEqual(subject.cohortDialog.form.memberOpenids, []);
  assert.equal(subject.cohortDialog.form.status, 'active');
});

test('learning ops: saving a cohort requires a name and omits status when creating', async () => {
  const subject = createLearningSubject();
  subject.cohortDialog.form.name = '   ';
  await subject.saveCohort();
  assert.equal(subject.calls.saveCohort.length, 0);
  assert.deepEqual(subject.message.last(), { level: 'warning', text: '请输入班组名称' });

  subject.cohortDialog.form.name = '  一班  ';
  subject.cohortDialog.form.description = '  备注  ';
  subject.cohortDialog.form.memberOpenids = ['u1'];
  subject.cohortDialog.visible = true;
  await subject.saveCohort();

  assert.deepEqual(subject.calls.saveCohort, [{
    id: '',
    payload: { name: '一班', description: '备注', memberOpenids: ['u1'] },
  }]);
  assert.equal(subject.cohortDialog.visible, false);
  assert.equal(subject.cohortDialog.saving, false);
});

test('learning ops: editing a cohort forwards its status', async () => {
  const subject = createLearningSubject();
  subject.cohortDialog.id = 'g1';
  subject.cohortDialog.form.name = '一班';
  subject.cohortDialog.form.status = 'archived';

  await subject.saveCohort();

  assert.deepEqual(subject.calls.saveCohort[0].payload, {
    name: '一班',
    description: '',
    memberOpenids: [],
    status: 'archived',
  });
});

test('learning ops: a cohort save failure keeps the dialog editable', async () => {
  const message = createMessageRecorder();
  const subject = useLearningOperations({
    adminApi: {
      async saveCohort() {
        throw { response: { data: { message: '名称重复' } } };
      },
    },
    isConsoleMode: { value: false },
    beginViewRequest: () => new AbortController(),
    finishViewRequest: () => {},
    quietRequestConfig: () => ({}),
    message,
  });
  subject.cohortDialog.form.name = '一班';
  subject.cohortDialog.visible = true;

  await subject.saveCohort();

  assert.deepEqual(message.last(), { level: 'error', text: '名称重复' });
  assert.equal(subject.cohortDialog.visible, true);
  assert.equal(subject.cohortDialog.saving, false);
});

test('learning ops: the plan dialog normalises nested ids to strings', () => {
  const subject = createLearningSubject();

  subject.openLearningPlanDialog({
    _id: 'p1',
    title: '冲刺',
    categoryIds: [{ _id: 'c1' }, 'c2'],
    cohortIds: [{ _id: 'g1' }],
    directUserOpenids: ['u1'],
    targetScore: '80',
    status: 'archived',
  });

  assert.deepEqual(subject.learningPlanDialog.form.categoryIds, ['c1', 'c2']);
  assert.deepEqual(subject.learningPlanDialog.form.cohortIds, ['g1']);
  assert.deepEqual(subject.learningPlanDialog.form.directUserOpenids, ['u1']);
  assert.equal(subject.learningPlanDialog.form.targetScore, 80);
  assert.equal(subject.learningPlanDialog.form.status, 'archived');

  subject.openLearningPlanDialog(null);
  assert.equal(subject.learningPlanDialog.form.targetScore, 60);
  assert.deepEqual(subject.learningPlanDialog.form.categoryIds, []);
});

test('learning ops: saving a plan enforces the three required selections', async () => {
  const subject = createLearningSubject();

  await subject.saveLearningPlan();
  assert.equal(subject.message.last().text, '请输入计划名称');

  subject.learningPlanDialog.form.title = '冲刺';
  await subject.saveLearningPlan();
  assert.equal(subject.message.last().text, '请至少选择一份试卷');

  subject.learningPlanDialog.form.categoryIds = ['c1'];
  await subject.saveLearningPlan();
  assert.equal(subject.message.last().text, '请至少选择一个班组或一位考生');

  assert.equal(subject.calls.savePlan.length, 0);
});

test('learning ops: creating a plan sends null for a missing deadline and omits status', async () => {
  const subject = createLearningSubject();
  Object.assign(subject.learningPlanDialog.form, {
    title: '  冲刺  ',
    description: '  冲  ',
    categoryIds: ['c1'],
    cohortIds: ['g1'],
    directUserOpenids: [],
    dueAt: '',
    targetScore: 60,
  });

  await subject.saveLearningPlan();

  assert.deepEqual(subject.calls.savePlan, [{
    id: '',
    payload: {
      title: '冲刺',
      description: '冲',
      categoryIds: ['c1'],
      cohortIds: ['g1'],
      directUserOpenids: [],
      dueAt: null,
      targetScore: 60,
    },
  }]);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '学习计划已保存' });
  assert.equal(subject.learningPlanDialog.visible, false);
});

test('learning ops: archiving respects cancellation and ignores close', async () => {
  const cancelled = createLearningSubject({ confirmImpl: () => { throw 'cancel'; } });
  await cancelled.archiveCohort({ _id: 'g1', name: '一班' });
  assert.equal(cancelled.calls.archiveCohort.length, 0);
  assert.equal(cancelled.message.calls.length, 0);

  const closed = createLearningSubject({ confirmImpl: () => { throw 'close'; } });
  await closed.archiveLearningPlan({ _id: 'p1', title: '冲刺' });
  assert.equal(closed.calls.archivePlan.length, 0);
  assert.equal(closed.message.calls.length, 0);
});

test('learning ops: confirmed archiving reloads the plans', async () => {
  const subject = createLearningSubject();

  await subject.archiveCohort({ _id: 'g1', name: '一班' });
  assert.deepEqual(subject.calls.archiveCohort, ['g1']);
  assert.equal(subject.calls.plans.length, 1);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '班组已归档' });

  await subject.archiveLearningPlan({ _id: 'p1', title: '冲刺' });
  assert.deepEqual(subject.calls.archivePlan, ['p1']);
  assert.equal(subject.calls.plans.length, 2);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '学习计划已归档' });
});

function createAssignmentSubject({ isConsoleMode = false, rejectAssignmentWith = null, rejectSaveWith = null } = {}) {
  const message = createMessageRecorder();
  const counters = { loadUsers: 0 };
  const calls = { get: [], save: [] };

  const subject = useUserAssignments({
    adminApi: {
      async getUserAssignments(openid) {
        calls.get.push(openid);
        if (rejectAssignmentWith) throw rejectAssignmentWith;
        return {
          data: {
            code: 0,
            data: {
              assignment: { majorCategoryIds: ['m1'], categoryIds: ['c2'] },
              availableMajorCategories: [{ _id: 'm1', name: '数学', sortOrder: 1 }],
              availableCategories: [
                { _id: 'c1', name: 'A卷', majorCategoryId: { _id: 'm1' } },
                { _id: 'c2', name: 'B卷', majorCategoryId: 'm1' },
                { _id: 'c3', name: 'C卷', majorCategoryId: { _id: 'm2' } },
                { _id: 'c4', name: 'D卷' },
              ],
            },
          },
        };
      },
      async saveUserAssignments(openid, payload) {
        calls.save.push({ openid, payload });
        if (rejectSaveWith) throw rejectSaveWith;
        return { data: { code: 0 } };
      },
    },
    isConsoleMode: ref(isConsoleMode),
    loadUsers: async () => { counters.loadUsers += 1; },
    message,
  });

  return { ...subject, message, counters, calls };
}

test('user assignments: categories group by major, sort by order, and bucket the rest last', () => {
  const subject = createAssignmentSubject();
  subject.userAssignmentDialog.options.majorCategories = [
    { _id: 'm1', name: '数学', sortOrder: 2 },
    { _id: 'm2', name: '英语', sortOrder: 1 },
  ];
  subject.userAssignmentDialog.options.categories = [
    { _id: 'c1', name: 'B卷', majorCategoryId: { _id: 'm1' } },
    { _id: 'c2', name: 'A卷', majorCategoryId: 'm1' },
    { _id: 'c3', name: '英语卷', majorCategoryId: { _id: 'm2' } },
    { _id: 'c4', name: '散卷' },
  ];

  const groups = subject.groupedAssignmentCategories.value;

  assert.deepEqual(groups.map((group) => group.id), ['m2', 'm1', 'ungrouped']);
  assert.deepEqual(groups.map((group) => group.name), ['英语', '数学', '未分组试卷']);
  assert.deepEqual(groups[1].items.map((item) => item._id), ['c2', 'c1'], '组内按名称排序');
  assert.equal(groups[2].sortOrder, 999999);
});

test('user assignments: an unknown major falls back to a stable label', () => {
  const subject = createAssignmentSubject();
  subject.userAssignmentDialog.options.categories = [
    { _id: 'c1', name: 'A卷', majorCategoryId: { _id: 'ghost' } },
  ];

  const [group] = subject.groupedAssignmentCategories.value;

  assert.equal(group.name, '未命名科目');
  assert.equal(group.sortOrder, 0);
});

test('user assignments: filtering by major hides the other groups and the counter follows', () => {
  const subject = createAssignmentSubject();
  subject.userAssignmentDialog.options.majorCategories = [
    { _id: 'm1', name: '数学', sortOrder: 1 },
    { _id: 'm2', name: '英语', sortOrder: 2 },
  ];
  subject.userAssignmentDialog.options.categories = [
    { _id: 'c1', name: 'A卷', majorCategoryId: 'm1' },
    { _id: 'c2', name: 'B卷', majorCategoryId: 'm2' },
    { _id: 'c3', name: 'C卷', majorCategoryId: 'm1' },
  ];
  subject.userAssignmentDialog.form.categoryIds = ['c1', 'c2'];

  assert.deepEqual({ ...subject.assignmentDialogStats.value }, { selectedCount: 2, visibleCount: 3 });

  subject.userAssignmentDialog.filterMajorIds = ['m1'];
  assert.deepEqual({ ...subject.assignmentDialogStats.value }, { selectedCount: 2, visibleCount: 2 });
});

test('user assignments: opening the dialog hydrates the checked state from the server', async () => {
  const subject = createAssignmentSubject();

  await subject.openUserAssignmentDialog({ openid: 'o1', name: '张三' });

  assert.equal(subject.userAssignmentDialog.visible, true);
  assert.deepEqual(subject.calls.get, ['o1']);
  assert.deepEqual(subject.userAssignmentDialog.form.categoryIds.sort(), ['c1', 'c2'],
    '已分配科目下的全部试卷都应视为选中');
  assert.deepEqual(subject.userAssignmentDialog.form.majorCategoryIds, [],
    '科目选择由试卷推导，不回填接口返回值');
  assert.equal(subject.userAssignmentDialog.options.categories.length, 4);
  assert.equal(subject.userAssignmentDialog.loading, false);
});

test('user assignments: console identities and missing openids are ignored', async () => {
  const consoleSubject = createAssignmentSubject({ isConsoleMode: true });
  await consoleSubject.openUserAssignmentDialog({ openid: 'o1' });
  assert.equal(consoleSubject.calls.get.length, 0);
  assert.equal(consoleSubject.userAssignmentDialog.visible, false);

  const subject = createAssignmentSubject();
  subject.userAssignmentDialog.form.categoryIds = ['c1'];
  await subject.saveUserAssignments();
  assert.equal(subject.calls.save.length, 0);
});

test('user assignments: a failed load closes the dialog', async () => {
  const subject = createAssignmentSubject({ rejectAssignmentWith: new Error('boom') });

  await subject.openUserAssignmentDialog({ openid: 'o1' });

  assert.deepEqual(subject.message.last(), { level: 'error', text: '加载分配数据失败' });
  assert.equal(subject.userAssignmentDialog.visible, false);
  assert.equal(subject.userAssignmentDialog.loading, false);
});

test('user assignments: saving posts the checked categories and refreshes the user list', async () => {
  const subject = createAssignmentSubject();
  subject.userAssignmentDialog.user = { openid: 'o1' };
  subject.userAssignmentDialog.visible = true;
  subject.userAssignmentDialog.form.categoryIds = ['c1', 'c3'];

  await subject.saveUserAssignments();

  assert.deepEqual(subject.calls.save, [{
    openid: 'o1',
    payload: { majorCategoryIds: [], categoryIds: ['c1', 'c3'] },
  }]);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '分配保存成功' });
  assert.equal(subject.userAssignmentDialog.visible, false);
  assert.equal(subject.userAssignmentDialog.saving, false);
  assert.equal(subject.counters.loadUsers, 1);
});

test('user assignments: a failed save keeps the dialog open for retry', async () => {
  const subject = createAssignmentSubject({ rejectSaveWith: { response: { data: { message: '试卷已删除' } } } });
  subject.userAssignmentDialog.user = { openid: 'o1' };
  subject.userAssignmentDialog.visible = true;

  await subject.saveUserAssignments();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '试卷已删除' });
  assert.equal(subject.userAssignmentDialog.visible, true);
  assert.equal(subject.userAssignmentDialog.saving, false);
  assert.equal(subject.counters.loadUsers, 0);
});
