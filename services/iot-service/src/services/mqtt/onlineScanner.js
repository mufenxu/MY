function findOfflineDevices(devices, now, threshold) {
  return Object.values(devices || {}).filter((device) => (
    device.onlineStatus === 'online'
    && device.lastActive
    && now - device.lastActive >= threshold
  ));
}

function markTimedOutDevicesOffline(devices, now, threshold) {
  const offlineDevices = findOfflineDevices(devices, now, threshold);
  offlineDevices.forEach((device) => {
    device.onlineStatus = 'offline';
  });
  return offlineDevices;
}

module.exports = {
  findOfflineDevices,
  markTimedOutDevicesOffline
};
