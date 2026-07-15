const express = require("express");
const morgan = require("morgan");

const config = require("./config");
const WeComClient = require("./wecom-client");
const { notificationSchema, buildWeComPayload } = require("./notification-schema");

const app = express();
const wecomClient = new WeComClient({
  corpId: config.wecom.corpId,
  secret: config.wecom.secret,
  margin: config.tokenCacheMargin,
});

const checkApiKey = (req, res, next) => {
  const apiKey = req.get("X-API-KEY");
  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({ errcode: 401, errmsg: "无效的 API KEY" });
  }
  return next();
};

app.disable("x-powered-by");
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  express.json({
    limit: "1mb",
  })
);

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/notify", checkApiKey, async (req, res, next) => {
  try {
    const parsed = notificationSchema.parse(req.body);
    const payload = buildWeComPayload(parsed, config.wecom.agentId);
    const result = await wecomClient.sendMessage(payload);
    res.json({ errcode: 0, errmsg: "ok", detail: result });
  } catch (error) {
    next(error);
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  if (err.name === "ZodError") {
    return res.status(400).json({
      errcode: 400,
      errmsg: "请求参数错误",
      detail: err.issues,
    });
  }

  if (err.message && err.message.startsWith("企业微信发送失败")) {
    return res.status(502).json({
      errcode: 502,
      errmsg: err.message,
    });
  }

  if (err.message && err.message.startsWith("获取企业微信 token 失败")) {
    return res.status(502).json({
      errcode: 502,
      errmsg: err.message,
    });
  }

  // 其他未知错误
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    errcode: 500,
    errmsg: "服务器内部错误",
  });
});

module.exports = app;

