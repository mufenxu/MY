import assert from 'node:assert/strict';
import test from 'node:test';

import { usePasswordDialog } from '../src/features/account/usePasswordDialog.js';

const STRONG_PASSWORD = 'Abcdefgh1234!';

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

function createSubject({ isConsoleMode = false, isPlatformSso = false, rejectWith = null } = {}) {
  const message = createMessageRecorder();
  const requests = [];
  const outcome = { changed: 0 };

  const subject = usePasswordDialog({
    adminApi: {
      async changePassword(payload) {
        requests.push(payload);
        if (rejectWith) throw rejectWith;
        return { data: { code: 0 } };
      },
    },
    isConsoleMode: { value: isConsoleMode },
    isPlatformSso,
    onChanged: () => { outcome.changed += 1; },
    message,
  });

  return { ...subject, message, requests, outcome };
}

function fillForm(subject, { oldPassword = 'old-password', newPassword, confirmPassword }) {
  subject.passwordForm.oldPassword = oldPassword;
  subject.passwordForm.newPassword = newPassword;
  subject.passwordForm.confirmPassword = confirmPassword ?? newPassword;
}

function openAndFill(subject, options) {
  subject.openPasswordDialog();
  fillForm(subject, options);
}

test('console identities cannot open the password dialog', () => {
  const subject = createSubject({ isConsoleMode: true });

  subject.openPasswordDialog();

  assert.equal(subject.passwordDialog.visible, false);
  assert.deepEqual(subject.message.last(), {
    level: 'info',
    text: '个人题库身份不使用账号密码登录',
  });
});

test('opening the password dialog always starts from an empty form', () => {
  const subject = createSubject();
  subject.passwordForm.oldPassword = 'stale';
  subject.passwordForm.newPassword = 'stale';
  subject.passwordForm.confirmPassword = 'stale';

  subject.openPasswordDialog();

  assert.equal(subject.passwordDialog.visible, true);
  assert.deepEqual({ ...subject.passwordForm }, {
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
});

test('an incomplete form is rejected before any request is sent', async () => {
  const subject = createSubject();
  subject.openPasswordDialog();

  await subject.submitChangePassword();

  assert.equal(subject.requests.length, 0);
  assert.deepEqual(subject.message.last(), { level: 'warning', text: '请填写完整信息' });
});

test('password policy rejects short, weak, and mismatched inputs in order', async () => {
  const short = createSubject();
  openAndFill(short, { newPassword: 'Short1!' });
  await short.submitChangePassword();
  assert.equal(short.message.last().text, '新密码长度不能少于 12 位');

  const weak = createSubject();
  openAndFill(weak, { newPassword: 'abcdefgh1234' });
  await weak.submitChangePassword();
  assert.equal(weak.message.last().text, '新密码需包含大小写字母、数字和特殊符号');

  const mismatched = createSubject();
  openAndFill(mismatched, { newPassword: STRONG_PASSWORD, confirmPassword: 'Abcdefgh1234?' });
  await mismatched.submitChangePassword();
  assert.equal(mismatched.message.last().text, '两次输入的新密码不一致');

  for (const subject of [short, weak, mismatched]) {
    assert.equal(subject.requests.length, 0);
    assert.equal(subject.passwordDialog.loading, false);
  }
});

test('a successful change submits only the old and new password and closes the dialog', async () => {
  const subject = createSubject();
  openAndFill(subject, { newPassword: STRONG_PASSWORD });

  await subject.submitChangePassword();

  assert.deepEqual(subject.requests, [{ oldPassword: 'old-password', newPassword: STRONG_PASSWORD }]);
  assert.deepEqual(subject.message.last(), { level: 'success', text: '密码修改成功，请重新登录' });
  assert.equal(subject.passwordDialog.visible, false);
  assert.equal(subject.passwordDialog.loading, false);
  assert.equal(subject.outcome.changed, 1);
});

test('platform SSO keeps the session alive and reports a different success copy', async () => {
  const subject = createSubject({ isPlatformSso: true });
  openAndFill(subject, { newPassword: STRONG_PASSWORD });

  await subject.submitChangePassword();

  assert.deepEqual(subject.message.last(), { level: 'success', text: '考试后台独立密码已修改' });
  assert.equal(subject.passwordDialog.visible, false);
  assert.equal(subject.outcome.changed, 0, 'SSO 模式下不触发登出跳转');
});

test('a rejected request surfaces the server message and clears the loading flag', async () => {
  const subject = createSubject({
    rejectWith: { response: { data: { message: '原密码不正确' } } },
  });
  openAndFill(subject, { newPassword: STRONG_PASSWORD });

  await subject.submitChangePassword();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '原密码不正确' });
  assert.equal(subject.passwordDialog.visible, true, '失败时保留弹窗以便重试');
  assert.equal(subject.passwordDialog.loading, false);
  assert.equal(subject.outcome.changed, 0);
});

test('a network failure without a server message falls back to the generic error copy', async () => {
  const subject = createSubject({ rejectWith: new Error('socket hang up') });
  openAndFill(subject, { newPassword: STRONG_PASSWORD });

  await subject.submitChangePassword();

  assert.deepEqual(subject.message.last(), { level: 'error', text: '修改密码失败' });
});
