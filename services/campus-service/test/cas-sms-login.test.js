import test from "node:test";
import assert from "node:assert/strict";
import {
  SMS_CODE_MAX_ATTEMPTS,
  SMS_PENDING_TTL_MS,
  SMS_SEND_INTERVAL_MS,
  casSmsSendUrl,
  createSmsPendingStore,
  isMobilePhone,
  looksLikeSmsChallenge,
  maskSmsPhone,
  normalizeSmsPhone
} from "../src/lib/cas-sms-login.js";

test("发码地址固定指向 CAS 短信登录接口", () => {
  assert.equal(casSmsSendUrl("https://cas.hgu.edu.cn"), "https://cas.hgu.edu.cn/cas/smsLogin/sendSms");
});

test("手机号标准化兼容 86 前缀、空格和横线", () => {
  assert.equal(normalizeSmsPhone("13800138000"), "13800138000");
  assert.equal(normalizeSmsPhone("138 0013 8000"), "13800138000");
  assert.equal(normalizeSmsPhone("8613800138000"), "13800138000");
  assert.equal(normalizeSmsPhone("+86 138-0013-8000"), "13800138000");
  assert.equal(normalizeSmsPhone("12345"), "");
  assert.equal(normalizeSmsPhone("23800138000"), "");
  assert.equal(isMobilePhone("13800138000"), true);
  assert.equal(isMobilePhone("1380013800"), false);
});

test("手机号脱敏只保留前三后四", () => {
  assert.equal(maskSmsPhone("13800138000"), "138****8000");
  assert.equal(maskSmsPhone(""), "");
});

test("能识别学校下发的短信二次验证页面", () => {
  assert.equal(looksLikeSmsChallenge('<input id="smscode" name="smscode" />'), true);
  assert.equal(looksLikeSmsChallenge("<div>请输入动态验证码</div>"), true);
  assert.equal(
    looksLikeSmsChallenge('<input id="smscode" /><input id="passwordShow" />'),
    false,
    "同时存在密码输入框时是普通登录页，不是二次验证页"
  );
  assert.equal(looksLikeSmsChallenge('<input id="username" /><input id="passwordShow" />'), false);
  assert.equal(looksLikeSmsChallenge(""), false);
});

function fixedClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    }
  };
}

test("待验证会话可用一次并累计尝试次数", () => {
  const clock = fixedClock();
  const store = createSmsPendingStore({ now: clock.now, newId: () => "p1" });
  const { id } = store.put({ userId: "u1", jar: {}, phone: "13800138000", execution: "e1", action: "a" });

  const first = store.take({ userId: "u1", id });
  assert.equal(first.ok, true);
  assert.equal(first.entry.phone, "13800138000");
  assert.equal(first.entry.attempts, 1);

  const second = store.take({ userId: "u1", id });
  assert.equal(second.ok, true);
  assert.equal(second.entry.attempts, 2);
});

test("待验证会话不能跨用户使用", () => {
  const store = createSmsPendingStore({ newId: () => "p1" });
  const { id } = store.put({ userId: "u1", jar: {}, phone: "13800138000" });
  const taken = store.take({ userId: "u2", id });
  assert.equal(taken.ok, false);
  assert.equal(taken.reason, "missing");
});

test("超过有效期后会话失效", () => {
  const clock = fixedClock();
  const store = createSmsPendingStore({ now: clock.now, newId: () => "p1" });
  const { id } = store.put({ userId: "u1", jar: {}, phone: "13800138000" });

  clock.advance(SMS_PENDING_TTL_MS);
  const taken = store.take({ userId: "u1", id });
  assert.equal(taken.ok, false);
  assert.equal(taken.reason, "expired");
});

test("验证码错误次数达到上限后会话作废", () => {
  const store = createSmsPendingStore({ newId: () => "p1" });
  const { id } = store.put({ userId: "u1", jar: {}, phone: "13800138000" });

  for (let attempt = 1; attempt <= SMS_CODE_MAX_ATTEMPTS; attempt += 1) {
    assert.equal(store.take({ userId: "u1", id }).ok, true, `第 ${attempt} 次应允许重试`);
  }
  const blocked = store.take({ userId: "u1", id });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "too_many_attempts");
  assert.equal(store.size(), 0);
});

test("同一用户重新发码会顶掉旧会话", () => {
  const ids = ["p1", "p2"];
  const store = createSmsPendingStore({ newId: () => ids.shift() });
  const first = store.put({ userId: "u1", jar: {}, phone: "13800138000" });
  const second = store.put({ userId: "u1", jar: {}, phone: "13800138000" });

  assert.equal(store.size(), 1);
  assert.equal(store.take({ userId: "u1", id: first.id }).ok, false);
  assert.equal(store.take({ userId: "u1", id: second.id }).ok, true);
});

test("发码冷却按用户独立计时", () => {
  const clock = fixedClock();
  const store = createSmsPendingStore({ now: clock.now });

  assert.equal(store.sendAllowed("u1").allowed, true);
  store.markSent("u1");
  const blocked = store.sendAllowed("u1");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, SMS_SEND_INTERVAL_MS);

  assert.equal(store.sendAllowed("u2").allowed, true, "其他用户不受影响");

  clock.advance(SMS_SEND_INTERVAL_MS);
  assert.equal(store.sendAllowed("u1").allowed, true);
});

test("会话数量受上限约束且淘汰最旧记录", () => {
  let seq = 0;
  const store = createSmsPendingStore({ maxEntries: 2, newId: () => `p${(seq += 1)}` });
  store.put({ userId: "u1", jar: {}, phone: "13800138000" });
  store.put({ userId: "u2", jar: {}, phone: "13800138001" });
  store.put({ userId: "u3", jar: {}, phone: "13800138002" });

  assert.equal(store.size(), 2);
  assert.equal(store.take({ userId: "u1", id: "p1" }).ok, false);
  assert.equal(store.take({ userId: "u3", id: "p3" }).ok, true);
});
