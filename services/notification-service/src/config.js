const path = require("path");
const dotenv = require("dotenv");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

function ensureEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少必要环境变量：${name}`);
  }
  return value;
}

function ensureStrongSecret(name, { minLength = 32 } = {}) {
  const value = ensureEnv(name);
  if (process.env.NODE_ENV === "production") {
    const placeholder = /^(?:replace|change)_with_/i.test(value);
    if (value.length < minLength || placeholder) {
      throw new Error(`环境变量 ${name} 必须是至少 ${minLength} 位的随机值`);
    }
  }
  return value;
}

const parseInteger = (value, name) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`环境变量 ${name} 必须是整数`);
  }
  return parsed;
};

function parseInternalCallers(value) {
  const callers = String(value || "platform-api,core-api")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(item));
  if (callers.length === 0) throw new Error("NOTIFY_INTERNAL_CALLERS must contain at least one caller");
  return [...new Set(callers)];
}

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  apiKey: ensureStrongSecret("NOTIFY_API_KEY"),
  internalCallers: parseInternalCallers(process.env.NOTIFY_INTERNAL_CALLERS),
  wecom: {
    corpId: ensureEnv("WECOM_CORP_ID"),
    agentId: parseInteger(ensureEnv("WECOM_AGENT_ID"), "WECOM_AGENT_ID"),
    secret: ensureEnv("WECOM_SECRET"),
  },
  tokenCacheMargin: parseInteger(
    process.env.TOKEN_CACHE_MARGIN || "120",
    "TOKEN_CACHE_MARGIN"
  ),
};

module.exports = config;

