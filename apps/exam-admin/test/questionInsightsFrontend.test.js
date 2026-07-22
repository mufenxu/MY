import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

test('question revision APIs preserve paged loading and submit the complete load baseline', () => {
  const api = readSource('src', 'api', 'examDetail.js');
  const data = readSource('src', 'features', 'exam-editor', 'useExamDetailData.js');

  assert.match(api, /collectPagedItems/);
  assert.match(api, /listQuestionVersions:[\s\S]*?\/versions/);
  assert.match(api, /getQuestionVersion:[\s\S]*?\/versions\/\$\{encodeURIComponent/);
  assert.match(api, /restoreQuestionVersion:[\s\S]*?\/restore/);
  assert.match(api, /saveQuestions: \(questions, baseQuestions\)[\s\S]*scopePayload\(\{ questions, baseQuestions \}\)/);
  assert.match(data, /baseQuestions = createQuestionRevisionBaseline\(questions\.value\)/);
  assert.match(data, /examApi\.saveQuestions\(payload, baseQuestions\)/);
  assert.match(data, /cleanupExamDetailData[\s\S]*baseQuestions = \[\]/);
});

test('question history stays available in read-only editors while rollback is guarded and reloads data', () => {
  const detailView = readSource('src', 'views', 'ExamDetailView.vue');
  const versionDialog = readSource('src', 'components', 'QuestionVersionDialog.vue');

  assert.match(detailView, /isPersistedQuestion\(questions\[selectedIndex\]\)[\s\S]*版本记录/);
  assert.match(detailView, /@restored="handleQuestionVersionRestored"/);
  assert.match(detailView, /handleQuestionVersionRestored[\s\S]*await loadQuestions\(\)[\s\S]*focusQuestionById/);
  assert.match(detailView, /route\.query\.questionId[\s\S]*focusQuestionById/);
  assert.match(detailView, /openQuestionVersionDialog[\s\S]*isDirty\.value[\s\S]*请先保存后再查看版本记录/);
  assert.match(versionDialog, /props\.canEdit[\s\S]*!isCurrentRevision\(record\)/);
  assert.match(versionDialog, /restoreVersion[\s\S]*props\.dirty[\s\S]*请先保存后再回滚版本/);
  assert.match(versionDialog, /确认回滚版本/);
  assert.match(versionDialog, /restoreQuestionVersion[\s\S]*emit\('restored'/);
  assert.match(versionDialog, /:column="detailColumnCount"/);
  assert.match(versionDialog, /window\.innerWidth <= 640 \? 1 : 2/);
  const mobileInputMarker = detailView.indexOf('class="mobile-option-input"');
  assert.ok(mobileInputMarker > 0);
  const mobileOptionInput = detailView.slice(mobileInputMarker - 260, mobileInputMarker + 120);
  assert.match(mobileOptionInput, /:rows="2"/);
  assert.doesNotMatch(mobileOptionInput, /:autosize/);
  const desktopInputMarker = detailView.indexOf('class="option-input-wrapper"');
  assert.ok(desktopInputMarker > 0);
  const desktopOptionInput = detailView.slice(desktopInputMarker, desktopInputMarker + 420);
  assert.match(desktopOptionInput, /:rows="2"/);
  assert.doesNotMatch(desktopOptionInput, /:autosize/);
});

test('question quality is a scoped lazy dashboard view with filtering, pagination, and question navigation', () => {
  const adminApi = readSource('src', 'api', 'admin.js');
  const dashboard = readSource('src', 'views', 'DashboardView.vue');
  const nav = readSource('src', 'components', 'DashboardNavMenu.vue');
  const quality = readSource('src', 'components', 'QuestionQualityView.vue');

  assert.match(adminApi, /getQuestionQuality:[\s\S]*\/question-quality[\s\S]*scopeParams\(params\)/);
  assert.match(nav, /index="question-quality"[\s\S]*题库质量/);
  assert.match(dashboard, /defineAsyncComponent\(\(\) => import\('@\/components\/QuestionQualityView\.vue'\)\)/);
  assert.match(dashboard, /activeMenu === 'question-quality'[\s\S]*@open-question="openQuestionQualityTarget"/);
  assert.match(dashboard, /qualityIssueCodes = new Set[\s\S]*parseQualityInteger[\s\S]*qualityRouteState/);
  assert.match(dashboard, /returnQualityScopeType[\s\S]*returnQualityPage[\s\S]*returnQualityLimit/);
  assert.match(quality, /scopeType[\s\S]*issue[\s\S]*getQuestionQuality/);
  assert.match(quality, /initialScopeType[\s\S]*initialIssue[\s\S]*initialPage[\s\S]*initialLimit/);
  assert.match(quality, /state\.summary\.truncated/);
  assert.match(quality, /el-pagination/);
  assert.match(quality, /emit\('open-question'/);
});
