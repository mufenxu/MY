function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyTopicStats(topics = []) {
  return Object.fromEntries(
    topics
      .filter(Boolean)
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
  parseOnlineStatus
};
