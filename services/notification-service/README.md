# 企业微信通知 API 接入教程（Node.js）

本文指导如何在宝塔面板上部署企业微信通知服务，并通过域名 `https://tongzhiapi.pxyb.cn` 对外提供统一的消息发送接口。

---

## 1. 项目简介

- 技术栈：Node.js + Express + Axios + Zod  
- 提供接口：`GET /healthz` 探活、`POST /notify` 发送企业微信消息  
- 支持消息类型：`text`、`markdown`、`textcard`、`news`  
- 鉴权方式：请求头携带 `X-API-KEY`  
- AccessToken：自动缓存刷新，处理失效重试

---

## 2. 前置准备

1. 企业微信后台创建好自建应用，并记录：
   - 企业 ID（`CorpID`）
   - 应用 ID（`AgentID`）
   - 应用 Secret（`Secret`）
2. 在“开发管理 -> 企业可信 IP”处添加服务器出口 IP（如 `107.173.38.23`），否则会出现 `60020 not allow to access from your ip`。
3. 将代码上传至宝塔服务器目录（示例 `/root/tongzhiapi`）。
4. 服务器需安装 Node.js 18 及以上（宝塔可一键安装）。

---

## 3. 宝塔面板部署步骤

1. **创建 Node 项目**
   - 面板路径：`网站 -> Node项目 -> 添加Node项目`
   - `项目目录`：选择 `/root/tongzhiapi`
   - `项目名称`：任意，例如“企业微信通知api”
   - `启动选项`：选择或手动输入 `node src/server.js`
   - `Node 版本`：选择 `v24.11.0`（或任何 ≥18 的版本）
   - `包管理器`：建议 `npm`，若选择 `pnpm`，后续命令需对应调整
   - 点击“确定”完成创建

2. **安装依赖**
   - 进入该项目详情页，找到“命令行/依赖管理”
   - 执行 `npm install`（或 `pnpm install`），等待 `node_modules` 安装完成

3. **配置环境变量**
   - 面板路径：`项目设置 -> 环境变量`
   - 添加下列键值（示例）：
     ```
     WECOM_CORP_ID=wwxxxxxxxxxxxxxxxx
     WECOM_AGENT_ID=1000002
     WECOM_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     NOTIFY_API_KEY=replace_with_a_random_api_key
     TOKEN_CACHE_MARGIN=120
     PORT=3000
     ```
   - 保存后重启项目，使配置生效

4. **域名与 HTTPS**
   - 在宝塔“网站”中为 `tongzhiapi.pxyb.cn` 创建反向代理，指向本项目监听的端口（默认 3000）
   - 在该站点申请并开启 SSL 证书，确保外部调用使用 `https://tongzhiapi.pxyb.cn`

---

## 4. 服务验证

1. 浏览器访问 `https://tongzhiapi.pxyb.cn/healthz`  
   - 预期响应：`{"status":"ok"}`
2. 终端使用 curl 发送测试通知：

   ```bash
   curl -X POST "https://tongzhiapi.pxyb.cn/notify" \
     -H "Content-Type: application/json" \
     -H "X-API-KEY: replace_with_a_random_api_key" \
     -d '{
       "msg_type": "text",
       "data": { "content": "测试通知：现在是上线前联调" },
       "touser": "@all"
     }'
   ```

   - 预期响应：`{"errcode":0,"errmsg":"ok",...}`  
   - 若返回 `60020`，检查企业微信可信 IP 是否已添加当前服务器出口 IP

---

## 5. 接口说明

- **基础信息**
  - 基础域名：`https://tongzhiapi.pxyb.cn`
  - 鉴权头：`X-API-KEY: replace_with_a_random_api_key`
  - 全部接口均返回 JSON

- **`GET /healthz`**
  - 功能：探活心跳
  - 响应：`{"status":"ok"}`

- **`POST /notify`**
  - 功能：发送企业微信消息
  - 请求头：`Content-Type: application/json` + `X-API-KEY`
  - 请求体字段：
    | 字段 | 类型 | 说明 |
    | ---- | ---- | ---- |
    | `msg_type` | `text`/`markdown`/`textcard`/`news` | 必填，消息类型 |
    | `data` | 对象 | 必填，结构与企业微信原始接口一致 |
    | `touser` | 字符串 | 可选，成员 ID 使用 `|` 分隔，缺省为 `@all` |
    | `toparty`/`totag` | 字符串 | 可选，与企业微信一致 |
    | `agent_id` | 整数 | 可选，覆盖默认 `AgentID` |
    | `safe` | 0/1 | 可选，保密消息 |
    | `enable_id_trans` 等 | 整数 | 可选，具体见企业微信文档 |

  - 响应体：
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

### 示例请求体

- `text` 消息

  ```json
  {
    "msg_type": "text",
    "data": { "content": "系统已完成备份" },
    "touser": "@all"
  }
  ```

- `markdown` 消息

  ```json
  {
    "msg_type": "markdown",
    "data": {
      "content": "#### 发布提醒\n> 新版本已上线\n"
    },
    "toparty": "1|2"
  }
  ```

- `textcard` 消息

  ```json
  {
    "msg_type": "textcard",
    "data": {
      "title": "部署提醒",
      "description": "<div class=\"gray\">2025年11月10日</div><div class=\"normal\">新版本已上线</div>",
      "url": "https://example.com/release",
      "btntxt": "详情"
    }
  }
  ```

- `news` 消息

  ```json
  {
    "msg_type": "news",
    "data": {
      "articles": [
        {
          "title": "系统巡检报告",
          "description": "查看最新的巡检结果",
          "url": "https://example.com/report",
          "picurl": "https://example.com/assets/report.png"
        }
      ]
    }
  }
  ```

---

## 6. 系统集成指引

1. **后端调用**：在业务服务中通过 HTTP 客户端（Axios、requests 等）调用 `POST https://tongzhiapi.pxyb.cn/notify`，携带 `X-API-KEY` 与消息体。  
2. **失败重试**：若接口返回企业微信错误码，可读取 `detail` 中的 `errcode` 判断原因并决定是否重试。  
3. **鉴权管理**：建议将 `NOTIFY_API_KEY` 存放在服务端安全配置文件中，并定期更换。  
4. **审计日志**：业务侧可记录调用参数与返回结果，便于排查发送失败。

---

## 7. 常见问题

- **60020 not allow to access from your ip**  
  未将服务器出口 IP 添加进企业微信“可信 IP”白名单。

- **40014 invalid access_token**  
  AccessToken 失效。服务会自动刷新，如仍失败请检查 `CorpID/Secret` 是否正确。

- **请求返回 401**  
  `X-API-KEY` 与服务端配置不一致，或未在请求头中传递。

- **如何更换端口或域名？**  
  修改 `.env` 中的 `PORT` 后重启项目，确保宝塔反向代理指向新的端口；若更换域名，重新配置宝塔站点与 SSL 即可。

---

## 8. 安全建议

- 服务端仅对受信任的业务系统开放，必要时配置 IP 白名单或网关访问控制
- 定期轮换 `NOTIFY_API_KEY`，避免泄露
- 监控日志，结合企业微信回调及时发现发送失败
- 备份 `.env` 配置，变更后在多个环境保持一致

---

至此，`https://tongzhiapi.pxyb.cn` 已完成部署并可用于企业微信通知推送。若需扩展更多消息类型或集成拍错回调，可在 `src/notification-schema.js` 与 `src/app.js` 中按企业微信官方文档继续拓展。



