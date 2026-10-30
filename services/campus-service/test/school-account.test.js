import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSchoolAccount, rememberSchoolAccount, resolveSchoolAccount } from "../src/lib/school-account.js";

test("已记录的学号优先于能耗账号", () => {
  const meta = { schoolAccount: "2023010101", account: "energy-01" };
  assert.equal(resolveSchoolAccount(meta, { connected: true }), "2023010101");
});

test("缺少学号时用能耗账号兜底（仅限存在学校会话）", () => {
  const meta = { schoolAccount: null, account: "2023010101" };
  assert.equal(resolveSchoolAccount(meta, { connected: true }), "2023010101");
  assert.equal(resolveSchoolAccount(meta, { connected: false }), "");
});

test("兼容只写了 loginUsername 的历史会话", () => {
  assert.equal(resolveSchoolAccount({ loginUsername: " 2023010101 " }), "2023010101");
});

test("没有能耗账号时保持未确认状态，不伪造学号", () => {
  assert.equal(resolveSchoolAccount({ schoolAccount: "" }, { connected: true }), "");
  assert.equal(resolveSchoolAccount(undefined, { connected: true }), "");
});

test("读到上游账号时同时补齐能耗账号与学号", () => {
  const jar = { meta: {} };
  assert.equal(rememberSchoolAccount(jar, { account: " 2023010101 " }), true);
  assert.equal(jar.meta.account, "2023010101");
  assert.equal(jar.meta.schoolAccount, "2023010101");
  assert.equal(jar.meta.schoolAccountSource, "energy-account");
  // 第二次调用没有变化，避免重复写库。
  assert.equal(rememberSchoolAccount(jar, { account: "2023010101" }), false);
});

test("已有学号时不被能耗账号覆盖", () => {
  const jar = { meta: { schoolAccount: "2023010101", account: "2023010101" } };
  assert.equal(rememberSchoolAccount(jar, { account: "9999999999" }), false);
  assert.equal(jar.meta.schoolAccount, "2023010101");
});

test("上游没有账号或参数异常时不做任何写入", () => {
  assert.equal(rememberSchoolAccount({ meta: {} }, { account: "" }), false);
  assert.equal(rememberSchoolAccount({ meta: {} }, null), false);
  assert.equal(rememberSchoolAccount(null, { account: "1" }), false);
});

test("归一化只去空白，不改变学号本身", () => {
  assert.equal(normalizeSchoolAccount("  2023010101\n"), "2023010101");
  assert.equal(normalizeSchoolAccount(null), "");
  assert.equal(normalizeSchoolAccount(undefined), "");
});
