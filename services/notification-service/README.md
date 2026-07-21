# 企业微信通知 API 接入教程（Node.js）

通知服务由统一 Compose 部署在 Docker 内网，生产入口为 `https://pxyb.cn/api/notify`。可选独立域名只作为 `platform-api` 的 Host 别名，不直接代理容器端口。

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
3. 在仓库根目录准备 `.env`，通知服务与其他平台组件使用同一套 Compose 生命周期。
4. 本地开发需要 Node.js 20 及以上；生产运行使用仓库固定的容器镜像。

---

## 3. 统一部署步骤

1. 在仓库根目录配置 `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_SECRET`、至少 32 位的 `NOTIFY_API_KEY`、`NOTIFY_HISTORY_ENCRYPTION_KEY` 和独立的 `MONGO_NOTIFICATION_PASSWORD`。
2. 校验环境与拓扑：

   ```bash
   npm run env:check
   npm run check:topology
   docker compose --env-file .env -f infra/docker/compose.yml config --quiet
   ```

3. 启动或更新服务：

   ```bash
   docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build notification-service platform-api
   ```

   通知服务的发送台账写入独立的 `notification_app` 数据库，消息载荷在入库前使用 `NOTIFY_HISTORY_ENCRYPTION_KEY` 加密。密钥轮换前必须完成旧台账的保留期清理或迁移规划。

4. 主域名由 `infra/nginx/my-platform.conf.example` 统一代理到 `127.0.0.1:22100`。独立通知域名也代理到网关并加入 `NOTIFY_HOSTS`；禁止发布容器 `3000` 端口。

---

## 4. 服务验证

1. 浏览器访问 `https://pxyb.cn/api/notify/healthz`
   - 预期响应：`{"status":"ok"}`
2. 浏览器访问 `https://pxyb.cn/api/notify/readyz`
   - MongoDB 台账可用时预期响应：`{"status":"ready"}`
3. 终端使用 curl 发送测试通知：

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

   - 预期响应：`{"errcode":0,"errmsg":"ok",...}`  
   - 若返回 `60020`，检查企业微信可信 IP 是否已添加当前服务器出口 IP

---

## 5. 接口说明

- **基础信息**
  - 通知接口：`https://pxyb.cn/api/notify`
  - 健康检查：`https://pxyb.cn/api/notify/healthz`
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

1. **第三方调用**：通过 `POST https://pxyb.cn/api/notify` 携带 `X-API-KEY`；仓库内部服务使用 `http://notification-service:3000/notify` 和短时签名。
2. **统一控制台**：在统一服务控制台的“通知通道”页管理模板、定时任务、目标偏好和发送台账；测试发送仅允许指定单个企业微信用户。
3. **通知编排**：业务服务使用内部签名调用 `POST /enqueue` 创建即时或定时任务，支持幂等键、模板变量、最大重试次数和退避间隔。
4. **目标偏好**：免打扰时段和停用状态由服务端执行；被抑制的任务会记录明确原因，不会伪装成已发送。
5. **失败重试**：编排器按 `NOTIFY_ORCHESTRATION_INTERVAL_MS` 扫描到期任务；管理端也可对可重试失败受控重试。
6. **鉴权管理**：建议将 `NOTIFY_API_KEY` 存放在服务端安全配置文件中，并定期更换；内部调用方必须列入 `NOTIFY_INTERNAL_CALLERS`。
7. **审计日志**：任务状态、发送结果和重试来源都写入独立 `notification_app` 数据库，敏感载荷使用 AES-256-GCM 加密。

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

至此，通知能力已接入统一网关。若需扩展更多消息类型或回调，可在 `src/notification-schema.js` 与 `src/app.js` 中按企业微信官方文档继续拓展。



