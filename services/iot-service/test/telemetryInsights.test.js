const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createTelemetryInsight,
  detectTelemetryAnomalies,
  downsampleTelemetry
} = require('../src/services/telemetryInsights');

test('telemetry downsampling keeps bounded aggregate values per bucket', () => {
  const rows = [
    { created_at: 1000, temp: 20, hum: 40 },
    { created_at: 2000, temp: 22, hum: 44 },
    { created_at: 61000, temp: 24, hum: 48 }
  ];
  const buckets = downsampleTelemetry(rows, 60000);
  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets[0], {
    created_at: 0,
    sampleCount: 2,
    temp: 21,
    tempMin: 20,
    tempMax: 22,
    hum: 42,
    humMin: 40,
    humMax: 44
  });
});

test('telemetry anomaly detection reports physical and statistical outliers', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    created_at: index * 1000,
    temp: index === 9 ? 80 : 20 + (index % 2),
    hum: index === 8 ? 120 : 50 + (index % 2)
  }));
  const anomalies = detectTelemetryAnomalies(rows);
  assert.ok(anomalies.some((item) => item.metric === 'temp' && item.reason === 'statistical_outlier'));
  assert.ok(anomalies.some((item) => item.metric === 'hum' && item.reason === 'outside_physical_range'));
});

test('device insight exposes health, summary, downsampled series, and offline state', () => {
  const now = 2_000_000;
  const insight = createTelemetryInsight({
    id: 'room',
    name: 'Room',
    onlineStatus: 'online',
    lastActive: now - 120000,
    temp: 23,
    hum: 45,
    relays: { fan: 'OFF' }
  }, [{ created_at: now - 1000, temp: 23, hum: 45 }], { now, range: 'invalid' });

  assert.equal(insight.range, '24h');
  assert.equal(insight.device.state, 'offline');
  assert.equal(insight.summary.samples, 1);
  assert.equal(insight.series.length, 1);
});
