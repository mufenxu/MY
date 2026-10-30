/**
 * 课表缓存新鲜度判定。
 *
 * 课表一次回源要顺次请求上游三次（课表页 HTML、学期课程 JSON、校历），而客户端会按
 * 30–60 秒轮询；课表本身变动极慢，因此允许在一个短窗口内直接复用缓存。
 *
 * @param {{ cachedAt?: string }} cached 缓存对象，cachedAt 为写入时的 ISO 时间戳
 * @param {number} ttlMs 允许复用的时长（毫秒），<= 0 表示禁用缓存
 * @param {number} now 当前时间戳，便于测试注入
 */
export function isTimetableCacheFresh(cached, ttlMs, now = Date.now()) {
  const ttl = Math.max(0, Number(ttlMs) || 0);
  if (!ttl) return false;
  const cachedAt = Date.parse(cached?.cachedAt || "");
  if (!Number.isFinite(cachedAt)) return false;
  const age = Number(now) - cachedAt;
  return age >= 0 && age < ttl;
}
