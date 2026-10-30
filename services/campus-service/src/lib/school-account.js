// 短信验证码登录时，登录请求里只有手机号，拿不到学号/工号。
// 学号只能在登录成功后由学校上游（能耗平台的 viewdata）反查补齐，这一步一旦
// 因为上游瞬时不可用而失败，此后没有任何路径会再回写，会话就会长期停在
// 「有学校会话、但学号未确认」的状态，前端因此反复提示重新登录。
//
// 这里把「学号从哪来」收敛成两个纯函数：
//   - rememberSchoolAccount：读到上游账号时立刻补齐（含能耗账号本身）；
//   - resolveSchoolAccount：读取时兜底，兼容已经被写坏的历史会话。
export function normalizeSchoolAccount(value) {
  return String(value ?? "").trim();
}

// connected 表示确实存在学校会话。没有会话时不要用历史账号兜底，
// 否则登出后仍会显示一个学号。
export function resolveSchoolAccount(meta, { connected = false } = {}) {
  const explicit = normalizeSchoolAccount(meta?.schoolAccount || meta?.loginUsername);
  if (explicit) return explicit;
  if (!connected) return "";
  return normalizeSchoolAccount(meta?.account);
}

// 返回是否发生了变更，调用方据此决定要不要落盘，避免每次读数据都写一次会话。
export function rememberSchoolAccount(jar, view) {
  const account = normalizeSchoolAccount(view?.account);
  if (!account || !jar || typeof jar !== "object") return false;
  const meta = (jar.meta ||= {});
  let changed = false;
  if (!normalizeSchoolAccount(meta.account)) {
    meta.account = account;
    changed = true;
  }
  if (!normalizeSchoolAccount(meta.schoolAccount)) {
    meta.schoolAccount = account;
    meta.schoolAccountSource = "energy-account";
    changed = true;
  }
  return changed;
}
