import assert from "node:assert/strict";
import test from "node:test";

import {
  casEncryptPassword,
  describeLoginPage,
  extractFormAction,
  extractInputValue,
  htmlErrorMessage
} from "../src/lib/cas-protocol.js";

test("CAS protocol extracts form fields and sanitizes error markup", () => {
  const html = '<form id="fm1" action="/cas/login"><input name="execution" value="e1s1"><span id="msg1"><b>密码错误</b></span></form>';
  assert.equal(extractInputValue(html, "execution"), "e1s1");
  assert.equal(extractFormAction(html, "https://service.example"), "/cas/login");
  assert.equal(htmlErrorMessage(html), "密码错误");
});

test("extractInputValue 兼容 value 写在 name 之前的网关改写", () => {
  const html = '<input type="hidden" value="e2s2" name="execution"/>';
  assert.equal(extractInputValue(html, "execution"), "e2s2");
});

test("extractInputValue 兼容单引号与自闭合标签", () => {
  const html = "<input type='hidden' name='execution' value='e3s3' />";
  assert.equal(extractInputValue(html, "execution"), "e3s3");
});

test("extractFormAction 在缺少 fm1 时退化为第一个带 action 的表单", () => {
  const html = '<form id="login" action="/cas/login?service=x" method="post"></form>';
  assert.equal(extractFormAction(html, "https://service.example"), "/cas/login?service=x");
});

test("extractFormAction 无表单时回到标准地址", () => {
  assert.equal(extractFormAction("<html></html>", "https://service.example"), "/cas/login?service=https%3A%2F%2Fservice.example");
});

test("describeLoginPage 识别正常 CAS 页面", () => {
  const html = '<html><head><title>统一身份认证平台</title></head><body><form id="fm1"></form><input name="execution" value="x"></body></html>';
  const info = describeLoginPage(html);
  assert.equal(info.title, "统一身份认证平台");
  assert.ok(info.markers.includes("execution"));
  assert.ok(info.markers.includes("fm1"));
  assert.equal(info.looksCompressed, false);
});

test("describeLoginPage 识别深信服网关认证页", () => {
  const html = '<html><head><title>Sangfor 上网认证</title></head><body>请先登录 深信服 上网行为管理</body></html>';
  const info = describeLoginPage(html);
  assert.ok(info.markers.includes("Sangfor"));
  assert.ok(info.markers.includes("深信服"));
  assert.ok(info.sample.includes("请先登录"));
});

test("describeLoginPage 标记疑似未解压的响应体", () => {
  const info = describeLoginPage(String.fromCharCode(0x1f, 0x8b, 0x08, 0x00));
  assert.equal(info.looksCompressed, true);
});

test("CAS protocol encryption is deterministic for the configured key", () => {
  const options = { modulusHex: "010001", exponentHex: "03" };
  assert.equal(casEncryptPassword("ab", options), casEncryptPassword("ab", options));
  assert.notEqual(casEncryptPassword("ab", options), casEncryptPassword("ac", options));
});
