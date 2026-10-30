// 登录态判定集中在这里，避免每个业务各自解释 401。
//
// 必须区分两类失败，它们的处置完全不同：
//   1. 「需要重新登录学校账号」——连统一认证的票据都拿不到（跳到 CAS 登录页、
//      入口没有回传 ticket）。这时只有用户重新登录才能恢复。
//   2. 「业务系统身份转换失败」——CAS 票据已经拿到，但下游系统拒绝兑换（票据
//      一次性已被消费、票据过期、下游抖动）。这类失败只影响那一个系统，把整个
//      学校登录态标成失效会让用户在明明登录有效时被反复要求重新登录。
const CAS_LOGIN_REQUIRED_CODES = new Set([
  "LIBROOM_CAS_TICKET_REQUIRED",
  "LIBRARY_SEAT_CAS_TOKEN_REQUIRED"
]);

const CAS_LOGIN_REQUIRED_TEXT = /统一身份认证|CAS|重新登录学校账号/;

export function isCasLoginRequiredError(error) {
  if (error?.status !== 401) return false;
  const code = String(error?.code || "");
  if (CAS_LOGIN_REQUIRED_CODES.has(code)) return true;
  // 没有 code 的老路径（例如 WebVPN 会话直接判定失效）靠文案兜底。
  return CAS_LOGIN_REQUIRED_TEXT.test(String(error?.message || ""));
}

export function casLoginRequiredMessage(error) {
  const message = error?.message || "";
  return CAS_LOGIN_REQUIRED_TEXT.test(message) ? message : "统一身份认证会话已过期，请重新登录学校账号。";
}
