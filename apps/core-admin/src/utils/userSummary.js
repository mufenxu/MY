// 浏览器里只保留界面展示需要的用户摘要。
// 服务端返回的是整份用户文档（含微信 openid、权限列表、tokenVersion），不应长期留在 localStorage。
const SUMMARY_FIELDS = ['_id', 'userId', 'nickName', 'avatarUrl', 'role'];

export function toUserSummary(user) {
  if (!user || typeof user !== 'object') return null;
  const summary = {};
  for (const field of SUMMARY_FIELDS) {
    if (user[field] !== undefined && user[field] !== null) summary[field] = user[field];
  }
  return summary;
}

export function storeUserSummary(user, storage = globalThis.localStorage) {
  const summary = toUserSummary(user);
  if (summary) storage.setItem('user', JSON.stringify(summary));
  else storage.removeItem('user');
  return summary;
}
