import assert from "node:assert/strict";
import test from "node:test";

import {
  casEncryptPassword,
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

test("CAS protocol encryption is deterministic for the configured key", () => {
  const options = { modulusHex: "010001", exponentHex: "03" };
  assert.equal(casEncryptPassword("ab", options), casEncryptPassword("ab", options));
  assert.notEqual(casEncryptPassword("ab", options), casEncryptPassword("ac", options));
});
