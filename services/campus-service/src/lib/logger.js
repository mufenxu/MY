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

// 网络类上游故障的真因只在 cause 上：`TypeError: fetch failed` 本身没有 code，
// ECONNREFUSED / ENOTFOUND / CERT_HAS_EXPIRED / UND_ERR_CONNECT_TIMEOUT 全在 cause 里。
// 双栈建连都失败时 cause 还是 AggregateError，逐地址的失败原因在 errors 数组里。
const MAX_CAUSE_DEPTH = 4;
const MAX_AGGREGATE_ERRORS = 5;
// 连接层错误把定位信息放在这些自有属性上（哪个主机、哪个协议栈调用、哪个地址端口）。
// 只放白名单，避免 Error 上被挂任意字段带进日志。
const CAUSE_DETAIL_KEYS = ["errno", "syscall", "hostname", "address", "port"];

function redactError(error, depth) {
  const entry = {
    name: error.name,
    message: redactString(error.message || ""),
    code: error.code || undefined
  };
  for (const key of CAUSE_DETAIL_KEYS) {
    if (error[key] !== undefined) entry[key] = error[key];
  }
  if (error.cause && depth < MAX_CAUSE_DEPTH) entry.cause = redact(error.cause, depth + 1);
  if (Array.isArray(error.errors) && error.errors.length && depth < MAX_CAUSE_DEPTH) {
    entry.errors = error.errors.slice(0, MAX_AGGREGATE_ERRORS).map((item) => redact(item, depth + 1));
  }
  return entry;
}

function redact(value, depth = 0) {
  if (depth > 5) return "[Truncated]";
  if (value instanceof Error) return redactError(value, depth);
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
