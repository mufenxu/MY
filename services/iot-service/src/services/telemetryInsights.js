const RANGE_BUCKETS = Object.freeze({
  '1h': 60 * 1000,
  '24h': 15 * 60 * 1000,
  '7d': 60 * 60 * 1000
});

function normalizeRange(value) {
  const range = String(value || '24h').trim();
  return Object.prototype.hasOwnProperty.call(RANGE_BUCKETS, range) ? range : '24h';
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeMetric(rows, field) {
  const values = rows.map((row) => finite(row[field])).filter((value) => value !== null);
  if (!values.length) return { count: 0, min: null, max: null, average: null };
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length)
  };
}

function downsampleTelemetry(rows, bucketMs) {
  const buckets = new Map();
  for (const row of rows) {
    const timestamp = finite(row.created_at);
    if (timestamp === null) continue;
    const bucketStart = Math.floor(timestamp / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart) || { created_at: bucketStart, rows: [] };
    bucket.rows.push(row);
    buckets.set(bucketStart, bucket);
  }

  return [...buckets.values()]
    .sort((left, right) => left.created_at - right.created_at)
    .map((bucket) => {
      const temperature = summarizeMetric(bucket.rows, 'temp');
      const humidity = summarizeMetric(bucket.rows, 'hum');
      return {
        created_at: bucket.created_at,
        sampleCount: bucket.rows.length,
        temp: temperature.average,
        tempMin: temperature.min,
        tempMax: temperature.max,
        hum: humidity.average,
        humMin: humidity.min,
        humMax: humidity.max
      };
    });
}

function metricAnomalies(rows, field, label, { minimum, maximum }) {
  const samples = rows
    .map((row) => ({ created_at: finite(row.created_at), value: finite(row[field]) }))
    .filter((sample) => sample.created_at !== null && sample.value !== null);
  const values = samples.map((sample) => sample.value);
  const center = median(values);
  const deviations = center === null ? [] : values.map((value) => Math.abs(value - center));
  const mad = median(deviations);

  return samples.flatMap((sample) => {
    const outsidePhysicalRange = sample.value < minimum || sample.value > maximum;
    const modifiedZ = mad > 0 ? 0.6745 * Math.abs(sample.value - center) / mad : 0;
    if (!outsidePhysicalRange && (samples.length < 8 || modifiedZ < 3.5)) return [];
    return [{
      metric: field,
      label,
      value: sample.value,
      created_at: sample.created_at,
      severity: outsidePhysicalRange ? 'critical' : 'warning',
      reason: outsidePhysicalRange ? 'outside_physical_range' : 'statistical_outlier',
      score: round(modifiedZ)
    }];
  });
}

function detectTelemetryAnomalies(rows) {
  return [
    ...metricAnomalies(rows, 'temp', 'temperature', { minimum: -40, maximum: 125 }),
    ...metricAnomalies(rows, 'hum', 'humidity', { minimum: 0, maximum: 100 })
  ]
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, 50);
}

function createTelemetryInsight(device, rows, {
  range = '24h',
  onlineThresholdMs = 60_000,
  now = Date.now()
} = {}) {
  const normalizedRange = normalizeRange(range);
  const anomalies = detectTelemetryAnomalies(rows);
  const lastActive = finite(device?.lastActive);
  const online = device?.onlineStatus === 'online'
    && lastActive !== null
    && now - lastActive < onlineThresholdMs;
  const recentCritical = anomalies.some((item) => item.severity === 'critical'
    && now - item.created_at < 60 * 60 * 1000);

  return {
    generatedAt: now,
    range: normalizedRange,
    device: {
      id: device.id,
      name: device.name,
      state: online ? (recentCritical ? 'degraded' : 'healthy') : 'offline',
      online,
      lastActive,
      temperature: finite(device.temp),
      humidity: finite(device.hum),
      relays: device.relays || {}
    },
    summary: {
      samples: rows.length,
      temperature: summarizeMetric(rows, 'temp'),
      humidity: summarizeMetric(rows, 'hum'),
      anomalyCount: anomalies.length
    },
    series: downsampleTelemetry(rows, RANGE_BUCKETS[normalizedRange]),
    anomalies
  };
}

module.exports = {
  createTelemetryInsight,
  detectTelemetryAnomalies,
  downsampleTelemetry,
  normalizeRange,
  summarizeMetric
};
