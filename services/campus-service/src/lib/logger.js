const SENSITIVE_KEY = /authorization|cookie|password|secret|token|ticket|photo|image|code_text|jar_json/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const COOKIE_VALUE = /\b(CASTGC|JSESSIONID|SESSION|token)=[^;\s]+/gi;
const QUERY_SECRET = /([?&](?:ticket|token|code|session|key)=)[^&\s]+/gi;

function redactString(value) {
  return String(value)
    .replace(BEARER_VALUE, "Bearer [Redacted]")
    .replace(COOKIE_VALUE, "$1=[Redacted]")
    .replace(QUERY_SECRET, "$1[Redacted]");
}

function redact(value, depth = 0) {
  if (depth > 5) return "[Truncated]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ""),
      code: value.code || undefined
    };
  }
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[Redacted]" : redact(item, depth + 1)
    ]));
  }
  if (typeof value === "string") {
    return redactString(value.slice(0, 2_000));
  }
  return value;
}

export function createLogger({ service, environment }) {
  function write(level, event, fields = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      environment,
      event,
      ...redact(fields)
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields)
  };
}
