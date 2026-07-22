export class OperationalIntelligenceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function boundedInteger(value, {
  fallback,
  minimum = 1,
  maximum,
  code = 'INVALID_QUERY_PARAMETER',
  label = 'Query parameter',
} = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value) || !/^\d+$/.test(String(value))) {
    throw new OperationalIntelligenceError(400, code, `${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new OperationalIntelligenceError(400, code, `${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function normalizedText(value, {
  minimum = 0,
  maximum,
  code = 'INVALID_QUERY_PARAMETER',
  label = 'Query parameter',
} = {}) {
  if (Array.isArray(value)) {
    throw new OperationalIntelligenceError(400, code, `${label} must be a single value.`);
  }
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new OperationalIntelligenceError(400, code, `${label} must contain between ${minimum} and ${maximum} characters.`);
  }
  return normalized;
}

export function enumFilter(value, allowed, {
  fallback = [...allowed],
  code = 'INVALID_QUERY_PARAMETER',
  label = 'Type filter',
} = {}) {
  if (value === undefined || value === null || value === '') return [...fallback];
  if (Array.isArray(value)) {
    throw new OperationalIntelligenceError(400, code, `${label} must be a comma-separated value.`);
  }
  const requested = [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
  if (!requested.length || requested.some((item) => !allowed.has(item))) {
    throw new OperationalIntelligenceError(400, code, `${label} contains an unsupported value.`);
  }
  return requested;
}

function parseDate(value, fallback, code, label) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) throw new OperationalIntelligenceError(400, code, `${label} must be a single ISO timestamp.`);
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new OperationalIntelligenceError(400, code, `${label} must be a valid ISO timestamp.`);
  return new Date(timestamp);
}

export function boundedDateRange({ from, to } = {}, {
  now = () => new Date(),
  defaultPastDays = 30,
  defaultFutureDays = 30,
  maximumDays = 90,
  code = 'INVALID_DATE_RANGE',
} = {}) {
  const current = now();
  const start = parseDate(from, new Date(current.getTime() - defaultPastDays * 86400000), code, 'from');
  const end = parseDate(to, new Date(current.getTime() + defaultFutureDays * 86400000), code, 'to');
  if (start.getTime() >= end.getTime() || end.getTime() - start.getTime() > maximumDays * 86400000) {
    throw new OperationalIntelligenceError(400, code, `Date range must be positive and no longer than ${maximumDays} days.`);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

export function sanitizeOperationalText(value, maximum = 160) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b(password|secret|token|credential|api[-_ ]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

export function safeIdentifiers(values, maximum = 50) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter((value) => /^[A-Za-z0-9._:-]{1,100}$/.test(value)))]
    .slice(0, maximum);
}

export function safeIdentifier(value, fallback = 'unknown') {
  const normalized = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(normalized) ? normalized : fallback;
}
