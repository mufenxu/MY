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

const parseInteger = (value, name) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`环境变量 ${name} 必须是整数`);
  }
  return parsed;
};

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  apiKey: ensureEnv("NOTIFY_API_KEY"),
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

