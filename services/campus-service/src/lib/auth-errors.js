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

// 「需要用户重新登录学校账号」的统一对外语义。
//
// 各连接器抛 401 的文案和 code 各不相同（教务、能耗、用户中心、研讨间、座位预约…），
// 客户端此前只能靠中文文案里有没有「登录」「会话」来猜，文案一改就静默失效。
// 响应出口把这类 401 归一成同一个 code，客户端按 code 拉起短信登录弹窗即可。
export const SCHOOL_ACCOUNT_REQUIRED = "SCHOOL_ACCOUNT_REQUIRED";

const SCHOOL_ACCOUNT_REQUIRED_TEXT = /统一身份认证|重新登录学校账号|还没有连接学校账号|登录已失效|登录失效|会话已过期|会话可能已过期/;

// 系统账号自身的 401（密码错误、访问会话过期）不属于学校账号失效，
// 客户端不能因此弹学校登录框，否则会把「平台密码输错」误导成「学校账号过期」。
const SYSTEM_AUTH_PATH_PREFIX = "/api/auth/";

export function isSchoolAccountRequiredCode(code) {
  return String(code || "") === SCHOOL_ACCOUNT_REQUIRED;
}

/**
 * 把连接器抛出的 401 归一为对外 code。返回 null 表示保持原状。
 *
 * 只处理两类来源：
 *   1. 已知的「拿不到统一认证票据」code；
 *   2. 没有 code 的老抛错点，靠文案兜底。
 * 已经带其它明确 code 的 401（例如票据兑换失败）必须原样保留——
 * 它们不需要重新登录，归一化会让用户在登录仍然有效时被反复要求登录。
 */
export function schoolAccountRequiredCode({ status, code, message, pathname }) {
  if (Number(status) !== 401) return null;
  if (String(pathname || "").startsWith(SYSTEM_AUTH_PATH_PREFIX)) return null;
  const normalized = String(code || "");
  if (CAS_LOGIN_REQUIRED_CODES.has(normalized)) return SCHOOL_ACCOUNT_REQUIRED;
  if (normalized && normalized !== "REQUEST_FAILED") return null;
  return SCHOOL_ACCOUNT_REQUIRED_TEXT.test(String(message || "")) ? SCHOOL_ACCOUNT_REQUIRED : null;
}

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
