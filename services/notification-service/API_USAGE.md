# 企业微信通知 API 接入教程

面向第三方服务，说明如何通过统一网关 `https://pxyb.cn/api/notify` 发送企业微信消息。平台内部服务使用 Docker DNS 和签名请求，不使用公网域名。

---

## 1. 接入前准备

1. **获取访问凭证**
   - 管理员会提供唯一的 `X-API-KEY`（示例：`replace_with_a_random_api_key`）。
   - 请妥善保管，不要暴露在公开仓库或前端代码中。

2. **确认可访问域名**
   - 通知接口：`https://pxyb.cn/api/notify`
   - 健康检查：`https://pxyb.cn/api/notify/healthz`
   - 支持 HTTPS，默认端口 443，无需额外拼接端口。

3. **确保调用出口 IP 合法**
   - 仅当消息发送失败且返回 `60020 not allow to access from your ip` 时，说明该出口 IP 未加入企业微信可信 IP 白名单，需要对接管理员添加。

---

## 2. 核心接口概览

| 接口 | 方法 | 说明 |
| ---- | ---- | ---- |
| `/healthz` | `GET` | 探活接口，返回 `{ "status": "ok" }` |
| `/notify` | `POST` | 发送企业微信消息（核心接口） |

所有接口均返回 JSON，响应体中的 `errcode` 为 0 表示调用成功。

---

## 3. 鉴权方式

- 所有需要发送通知的请求必须携带请求头：

  ```
  X-API-KEY: 你的访问密钥
  ```

- 建议在服务端配置该密钥，避免通过 GET 参数或日志泄露。
- 如果返回 401，说明密钥缺失或不匹配。

---

## 4. 快速调用示例

### 4.1 使用 curl

```bash
curl -X POST "https://pxyb.cn/api/notify" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: replace_with_a_random_api_key" \
  -d '{
    "msg_type": "text",
    "data": { "content": "测试通知：现在是上线前联调" },
    "touser": "@all"
  }'
```

期望响应：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "detail": {
    "errcode": 0,
    "errmsg": "ok",
    "invaliduser": "",
    "invalidparty": "",
    "invalidtag": ""
  }
}
```

### 4.2 Node.js (axios)

```js
const axios = require("axios");

async function sendNotify() {
  const response = await axios.post(
    "https://pxyb.cn/api/notify",
    {
      msg_type: "markdown",
      data: {
        content: "#### 系统通知\n> 新版本已上线\n"
      },
      toparty: "1|2"
    },
    {
      headers: {
        "X-API-KEY": "replace_with_a_random_api_key"
      }
    }
  );

  console.log(response.data);
}

sendNotify().catch(console.error);
```

### 4.3 Python (requests)

```python
import requests

url = "https://pxyb.cn/api/notify"
headers = {
    "Content-Type": "application/json",
    "X-API-KEY": "replace_with_a_random_api_key",
}
payload = {
    "msg_type": "news",
    "data": {
        "articles": [
            {
                "title": "系统巡检报告",
                "description": "查看最新巡检结果",
                "url": "https://example.com/report",
            }
        ]
    },
    "touser": "@all",
}

response = requests.post(url, json=payload, headers=headers, timeout=10)
print(response.json())
```

---

## 5. 请求参数详解

### 5.1 通用字段

| 字段 | 类型 | 是否必填 | 说明 |
| ---- | ---- | -------- | ---- |
| `msg_type` | string | 是 | 消息类型，支持 `text` / `markdown` / `textcard` / `news` |
| `data` | object | 是 | 消息内容，结构需符合企业微信原始接口规范 |
| `touser` | string | 否 | 成员 ID 列表，使用 `|` 分隔；缺省默认 `@all` |
| `toparty` | string | 否 | 部门 ID 列表，`|` 分隔 |
| `totag` | string | 否 | 标签 ID 列表，`|` 分隔 |
| `agent_id` | number | 否 | 覆盖默认 AgentID，不填则使用服务端配置 |
| `safe` | number | 否 | 是否保密消息，仅对 `text`/`markdown`/`news` 有效，0 或 1 |
| `enable_id_trans` | number | 否 | 是否开启用户 ID 转换 |
| `enable_duplicate_check` | number | 否 | 是否开启重复检查 |
| `duplicate_check_interval` | number | 否 | 重复检查时间间隔（秒） |

> `touser`、`toparty`、`totag` 至少需要提供其中一个；若都不提供，系统默认设置为 `@all`。

### 5.2 各消息类型要求

- **text**
  - `data` 需包含 `content` 字段（字符串，<=2048 字符）
- **markdown**
  - `data` 需包含 `content` 字段（字符串，<=4096 字符）
  - 支持企业微信 Markdown 语法
- **textcard**
  - `data` 必须包含 `title`、`description`、`url`
  - 可选 `btntxt`
- **news**
  - `data.articles` 为数组，长度 1~8
  - 每个 `article` 要包含 `title`、`url`；可选 `description`、`picurl`

若参数不符合规范，接口会返回 `errcode:400`，`detail` 字段给出具体的校验错误位置。

---

## 6. 返回结果说明

- 成功响应：

  ```json
  {
    "errcode": 0,
    "errmsg": "ok",
    "detail": { ... 企业微信原始返回 ... }
  }
  ```

- 常见错误：

  | errcode | http 状态 | 说明 |
  | ------- | ---------- | ---- |
  | 401 | 401 | API Key 缺失或不正确 |
  | 400 | 400 | 请求参数校验失败，查看 `detail` 获取具体字段错误 |
  | 502 | 502 | 企业微信接口返回错误，`errmsg` 会包含原始 errcode |
  | 500 | 500 | 服务内部错误，建议联系维护者并提供请求日志 |

- 企业微信错误码示例：
  - `60020 not allow to access from your ip`：出口 IP 未加入企业微信可信 IP
  - `81013 user not found`：成员 ID 不存在
  - `45009 reach max api daily quota limit`：接口调用次数达上限

---

## 7. 最佳实践与注意事项

- **密钥管理**：将 `X-API-KEY` 放在服务端配置，不写入代码仓库。若怀疑泄露，联系管理员更新。
- **重试策略**：遇到 502 时可根据企业微信 errcode 判断是否短暂失败（如系统繁忙）再实施重试。建议退避重试，并设置最大次数。
- **日志记录**：记录发送请求、响应及 errcode，有助于排查企业微信返回的错误。
- **频率控制**：遵循企业微信接口的频率限制（参考官方文档），避免因频繁调用导致封禁。
- **数据安全**：消息内容可能包含敏感信息，请通过 HTTPS 访问，并避免在日志中输出完整内容。

---

## 8. 常见问题 FAQ

1. **返回 401：无效的 API KEY**  
   - 检查是否忘记添加 `X-API-KEY` 请求头，或密钥拼写错误。

2. **返回 400：请求参数错误**  
   - `detail` 数组会列出字段与错误原因，按提示修改。

3. **返回 502，提示企业微信发送失败**  
   - 查看 `errmsg` 中的企业微信 errcode，根据官方文档排查。常见如 `60020`（IP 白名单）、`81013`（成员 ID 不存在）。

4. **如何给指定部门或标签发消息？**  
   - 设置 `toparty` 或 `totag` 即可，多个值用 `|` 分隔。

5. **能否并发调用？**  
   - 服务端支持并发请求，AccessToken 会自动缓存。但请控制频率，避免触发企业微信限流。

---

如需扩展更多消息类型或封装 SDK，可参考本接口返回的结构进行二次开发。遇到问题可记录请求示例和响应结果，联系维护者协助排查。祝接入顺利！


