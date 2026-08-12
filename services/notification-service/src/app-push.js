function createAppPushDispatcher({ providers = {} } = {}) {
  const providerMap = { ...providers };

  async function dispatch({ store, notification, recipients, now = new Date() }) {
    const results = [];
    if (!store || typeof store.listAppDeliveryDevices !== 'function') {
      return { attempted: 0, sent: 0, deferred: 0, failed: 0, suppressed: 0, results };
    }
    for (const recipientId of [...new Set(recipients || [])]) {
      const preference = typeof store.getRecipientPreference === 'function'
        ? await store.getRecipientPreference(recipientId)
        : null;
      if (isPushSuppressed(preference, now)) {
        results.push({ recipientId, status: 'suppressed' });
        continue;
      }
      const devices = await store.listAppDeliveryDevices(recipientId);
      for (const device of devices) {
        const provider = providerMap[device.provider];
        if (!provider || typeof provider.send !== 'function') {
          results.push({ installationId: device.installationId, provider: device.provider, status: 'deferred' });
          continue;
        }
        try {
          await provider.send({
            token: device.token,
            installationId: device.installationId,
            notificationId: notification.id,
            category: notification.category,
            priority: notification.priority,
          });
          results.push({ installationId: device.installationId, provider: device.provider, status: 'sent' });
        } catch (error) {
          results.push({
            installationId: device.installationId,
            provider: device.provider,
            status: 'failed',
            error: String(error?.code || error?.message || 'PUSH_PROVIDER_FAILED').slice(0, 120),
          });
        }
      }
    }
    const attempted = results.filter((item) => item.status !== 'suppressed').length;
    return {
      attempted,
      sent: results.filter((item) => item.status === 'sent').length,
      deferred: results.filter((item) => item.status === 'deferred').length,
      failed: results.filter((item) => item.status === 'failed').length,
      suppressed: results.filter((item) => item.status === 'suppressed').length,
      results,
    };
  }

  return { dispatch };
}

function isPushSuppressed(preference, now = new Date()) {
  if (!preference) return false;
  if (preference.enabled === false) return true;
  const quiet = preference.quietHours;
  if (!quiet?.enabled) return false;
  const offsetMinutes = Math.min(Math.max(Number(preference.timezoneOffsetMinutes) || 0, -840), 840);
  const localHour = new Date(now.getTime() + offsetMinutes * 60_000).getUTCHours();
  const start = Number(quiet.startHour);
  const end = Number(quiet.endHour);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start === end) return true;
  return start < end ? localHour >= start && localHour < end : localHour >= start || localHour < end;
}

module.exports = { createAppPushDispatcher, isPushSuppressed };
