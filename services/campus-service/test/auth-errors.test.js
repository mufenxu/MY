import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../src/lib/http.js";
import { casLoginRequiredMessage, isCasLoginRequiredError, schoolAccountRequiredCode, SCHOOL_ACCOUNT_REQUIRED } from "../src/lib/auth-errors.js";
import { exchangeLibroomMemberToken } from "../src/lib/libroom.js";

function upstreamError(status, message, code) {
  return new HttpError(status, message, null, code);
}

test("拿不到统一认证票据才算需要重新登录", () => {
  assert.equal(
    isCasLoginRequiredError(upstreamError(401, "学校预约入口未返回统一认证票据，请重新登录学校账号。", "LIBROOM_CAS_TICKET_REQUIRED")),
    true
  );
  assert.equal(
    isCasLoginRequiredError(upstreamError(401, "座位预约官方入口未返回登录票据，请重新登录学校账号。", "LIBRARY_SEAT_CAS_TOKEN_REQUIRED")),
    true
  );
  assert.equal(isCasLoginRequiredError(upstreamError(401, "统一身份认证会话已过期，请重新登录学校账号。")), true);
});

test("票据兑换失败不得被判成学校登录态失效", () => {
  // 这两类错误发生在 CAS 票据已经拿到之后，只说明下游系统拒绝兑换。
  // 把它们算成「需要重新登录」会让用户在登录有效时被反复要求重新登录。
  assert.equal(isCasLoginRequiredError(upstreamError(401, "图书馆预约系统身份转换失败，请重新打开官方入口后重试。", "LIBROOM_AUTH_EXPIRED")), false);
  assert.equal(isCasLoginRequiredError(upstreamError(502, "座位预约系统身份转换失败，请重新打开官方入口后重试。", "LIBRARY_SEAT_AUTH_EXPIRED")), false);
  assert.equal(isCasLoginRequiredError(upstreamError(401, "操作失败", "LIBRARY_SEAT_AUTH_EXPIRED")), false);
  assert.equal(isCasLoginRequiredError(undefined), false);
});

test("登录提示文案保留上游可读信息，否则回落到统一口径", () => {
  assert.equal(
    casLoginRequiredMessage(upstreamError(401, "统一身份认证会话已过期，请重新登录学校账号。")),
    "统一身份认证会话已过期，请重新登录学校账号。"
  );
  assert.equal(
    casLoginRequiredMessage(upstreamError(401, "操作失败", "LIBROOM_CAS_TICKET_REQUIRED")),
    "统一身份认证会话已过期，请重新登录学校账号。"
  );
});

test("研讨间票据被消费后返回 502 而不是 401", async () => {
  // 实测上游对已消费/过期票据的行为：HTTP 200 + {"code":1,"message":"操作失败","data":{"member":[]}}
  await assert.rejects(
    () => exchangeLibroomMemberToken({
      cas: "7c115b104d4a1776fcaaa7bb8497123e",
      requestImpl: async () => ({
        status: 200,
        ok: true,
        payload: { code: 1, message: "操作失败", data: { third: 0, member: [] } }
      })
    }),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, "LIBROOM_AUTH_EXPIRED");
      assert.equal(error.message, "图书馆预约系统身份转换失败，请重新打开官方入口后重试。");
      assert.equal(isCasLoginRequiredError(error), false);
      return true;
    }
  );
});

test("研讨间换票成功时返回成员令牌", async () => {
  const token = await exchangeLibroomMemberToken({
    cas: "cas-ticket",
    requestImpl: async () => ({
      status: 200,
      ok: true,
      payload: { code: 0, data: { member: { token: "member-token" } } }
    })
  });
  assert.equal(token, "member-token");
});

test("学校账号失效的 401 归一成统一 code", () => {
  const cases = [
    { status: 401, message: "统一身份认证会话已过期，请重新登录学校账号。" },
    { status: 401, message: "教务系统会话已过期，请重新登录学校账号。" },
    { status: 401, message: "还没有连接学校账号，请先登录。" },
    { status: 401, message: "学校平台返回登录页，会话可能已过期。" },
    { status: 401, message: "学校预约入口未返回统一认证票据。", code: "LIBROOM_CAS_TICKET_REQUIRED" },
    { status: 401, message: "座位预约官方入口未返回登录票据。", code: "LIBRARY_SEAT_CAS_TOKEN_REQUIRED" }
  ];
  for (const item of cases) {
    assert.equal(
      schoolAccountRequiredCode({ ...item, pathname: "/api/energy/summary" }),
      SCHOOL_ACCOUNT_REQUIRED,
      item.message
    );
  }
});

test("不需要重新登录的 401 与其它状态码保持原样", () => {
  // 票据已拿到、仅下游兑换失败：重新登录解决不了，归一化会让用户被反复要求登录。
  assert.equal(
    schoolAccountRequiredCode({
      status: 401,
      code: "LIBRARY_SEAT_AUTH_EXPIRED",
      message: "座位预约系统身份转换失败，请重新打开官方入口后重试。",
      pathname: "/api/campus/library-seat/overview"
    }),
    null
  );
  assert.equal(
    schoolAccountRequiredCode({ status: 401, code: "LIBROOM_AUTH_EXPIRED", message: "操作失败", pathname: "/api/libroom/spaces" }),
    null
  );
  assert.equal(
    schoolAccountRequiredCode({ status: 401, message: "服务器异常", pathname: "/api/energy/summary" }),
    null
  );
  assert.equal(
    schoolAccountRequiredCode({ status: 502, message: "统一身份认证会话已过期，请重新登录学校账号。", pathname: "/api/energy/summary" }),
    null
  );
  assert.equal(
    schoolAccountRequiredCode({ status: 400, code: "CAS_SMS_REQUIRED", message: "学校已启用短信二次验证。", pathname: "/api/auth/login" }),
    null
  );
});

test("系统账号自身的 401 不得被判成学校账号失效", () => {
  // 否则平台密码输错会弹出「学校账号登录」，把用户引到错误的恢复路径。
  const authPaths = ["/api/auth/login", "/api/auth/login/sms/send", "/api/auth/login/sms/verify", "/api/auth/status"];
  for (const pathname of authPaths) {
    assert.equal(
      schoolAccountRequiredCode({ status: 401, message: "系统账号或密码不正确。", pathname }),
      null,
      pathname
    );
  }
});
