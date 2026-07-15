const { z } = require("zod");

const notificationSchema = z
  .object({
    msg_type: z.enum(["text", "markdown", "textcard", "news"]),
    data: z.record(z.any()),
    touser: z.string().trim().min(1).optional(),
    toparty: z.string().trim().min(1).optional(),
    totag: z.string().trim().min(1).optional(),
    agent_id: z.number().int().optional(),
    safe: z
      .number()
      .int()
      .min(0, { message: "safe 只能是 0 或 1" })
      .max(1, { message: "safe 只能是 0 或 1" })
      .optional(),
    enable_id_trans: z.number().int().optional(),
    enable_duplicate_check: z.number().int().optional(),
    duplicate_check_interval: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    const { msg_type, data } = value;
    if (!data || Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data"],
        message: "data 不能为空",
      });
      return;
    }

    switch (msg_type) {
      case "text": {
        const content = data.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "content"],
            message: "text 消息的 data.content 不能为空",
          });
        } else if (content.length > 2048) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "content"],
            message: "text 消息的内容不能超过 2048 个字符",
          });
        }
        break;
      }
      case "markdown": {
        const content = data.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "content"],
            message: "markdown 消息的 data.content 不能为空",
          });
        } else if (content.length > 4096) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "content"],
            message: "markdown 消息的内容不能超过 4096 个字符",
          });
        }
        break;
      }
      case "textcard": {
        const required = ["title", "description", "url"];
        required.forEach((field) => {
          if (
            data[field] === undefined ||
            data[field] === null ||
            String(data[field]).trim().length === 0
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["data", field],
              message: `textcard 消息缺少必填字段：${field}`,
            });
          }
        });
        break;
      }
      case "news": {
        const articles = data.articles;
        if (!Array.isArray(articles) || articles.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "articles"],
            message: "news 消息的 data.articles 必须是非空列表",
          });
          break;
        }
        if (articles.length > 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["data", "articles"],
            message: "news 消息的 articles 数量需在 1~8 之间",
          });
        }
        articles.forEach((article, index) => {
          if (!article || typeof article !== "object") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["data", "articles", index],
              message: `news 消息的第 ${index + 1} 个 article 必须是对象`,
            });
            return;
          }
          if (!article.title || String(article.title).trim().length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["data", "articles", index, "title"],
              message: `news 消息的第 ${index + 1} 个 article 缺少 title`,
            });
          }
          if (!article.url || String(article.url).trim().length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["data", "articles", index, "url"],
              message: `news 消息的第 ${index + 1} 个 article 缺少 url`,
            });
          }
        });
        break;
      }
      default:
        break;
    }
  });

function buildWeComPayload(body, defaultAgentId) {
  const payload = {
    msgtype: body.msg_type,
    agentid: body.agent_id ?? defaultAgentId,
    safe: body.safe ?? 0,
  };

  if (body.touser) payload.touser = body.touser;
  if (body.toparty) payload.toparty = body.toparty;
  if (body.totag) payload.totag = body.totag;

  if (!payload.touser && !payload.toparty && !payload.totag) {
    payload.touser = "@all";
  }

  const optional = {
    enable_id_trans: body.enable_id_trans,
    enable_duplicate_check: body.enable_duplicate_check,
    duplicate_check_interval: body.duplicate_check_interval,
  };

  Object.entries(optional).forEach(([key, value]) => {
    if (value !== undefined) {
      payload[key] = value;
    }
  });

  payload[body.msg_type] = body.data;

  return payload;
}

module.exports = {
  notificationSchema,
  buildWeComPayload,
};

