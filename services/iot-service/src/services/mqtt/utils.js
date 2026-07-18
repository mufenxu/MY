function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function truncatePayload(value, maxBytes = 1024) {
  const buffer = Buffer.from(String(value ?? ''), 'utf8');
  if (buffer.length <= maxBytes) return buffer.toString('utf8');
  return buffer.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD$/, '');
}

function createEmptyTopicStats(topics = [], maxEntries = 256) {
  return Object.fromEntries(
    Array.from(new Set(topics.filter(Boolean)))
      .slice(0, maxEntries)
      .map((topic) => [topic, { count: 0, lastMessageAt: null, lastPayload: null }])
  );
}

function parseOnlineStatus(message) {
  const normalized = String(message || '').trim().toLowerCase();
  return ['online', 'on', '1', 'true', 'yes'].includes(normalized) ? 'online' : 'offline';
}

module.exports = {
  createEmptyTopicStats,
  deepClone,
  parseOnlineStatus,
  truncatePayload
};
