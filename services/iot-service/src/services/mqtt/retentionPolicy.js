function getRetentionDays(config) {
  const retentionDays = Number.parseInt(config.dashboard?.dataRetentionDays || '0', 10);
  return Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 0;
}

function shouldRunRetentionCleanup(config) {
  return getRetentionDays(config) > 0;
}

module.exports = {
  getRetentionDays,
  shouldRunRetentionCleanup
};
