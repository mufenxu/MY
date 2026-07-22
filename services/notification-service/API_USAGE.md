# 通知 API 接入说明

第三方服务通过统一网关 `https://pxyb.cn/api/notify` 调用通知服务。平台内部服务继续使用 Docker DNS 与服务签名，不使用公网 API 密钥。

## 1. 创建 API 应用

在统一控制台进入“通知服务 > API 接入 > 应用与密钥”，为每个接入系统创建独立应用。创建时配置：

- 应用名称与用途；
- 每分钟调用上限；
- 到期日期；
- 最小必要权限。

支持的权限：

| 权限 | 用途 |
| --- | --- |
| `notifications:send` | 立即发送通知 |
| `notifications:enqueue` | 创建即时或定时任务 |
| `notifications:status:read` | 查询本应用产生的发送结果 |
| `notifications:broadcast` | 向多用户、部门、标签或 `@all` 发送 |

完整 API 密钥只在创建或轮换后显示一次。服务端只保存 SHA-256 摘要，密钥不得放入前端代码、URL、仓库或普通业务日志。

## 2. 鉴权

所有受保护接口必须携带请求头：

```http
X-API-KEY: ntf_live_xxx.yyy
Content-Type: application/json
```

`401` 表示密钥无效、过期或已吊销；`403` 表示应用缺少当前操作所需权限。

## 3. 立即发送

`POST https://pxyb.cn/api/notify`

微信插件会话需要使用 `text`。`markdown`、`textcard`、`news` 等类型在微信侧可能显示“暂不支持此消息类型，请在企业微信中查看”。

```bash
curl --request POST 'https://pxyb.cn/api/notify' \
  --header 'Content-Type: application/json' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --data '{
    "msg_type": "text",
    "touser": "zhangsan",
    "data": { "content": "系统通知：任务已完成" }
  }'
```

请求必须显式指定 `touser`、`toparty`、`totag` 中的一种。普通发送权限仅允许单个 `touser`；以下目标还需要 `notifications:broadcast`：

- `touser: "@all"`；
- 使用 `|` 分隔的多个用户；
- 任意部门或标签目标。

成功响应包含发送记录 ID：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "deliveryId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 4. 创建通知任务

`POST https://pxyb.cn/api/notify/enqueue`，需要 `notifications:enqueue`。

```json
{
  "msgType": "text",
  "content": "巡检已完成",
  "target": { "touser": "zhangsan" },
  "scheduledAt": "2026-07-23T09:00:00+08:00",
  "dedupeKey": "daily-check-20260723"
}
```

也可以传入控制台维护的 `templateKey` 与 `variables`。任务支持接收偏好、免打扰、去重和失败退避重试。

## 5. 查询发送结果

`GET https://pxyb.cn/api/notify/deliveries/{deliveryId}`，需要 `notifications:status:read`。

API 应用只能查询由自身密钥发起的发送记录；其他应用的记录统一返回 `404`，避免跨应用信息泄露。

## 6. 密钥轮换与吊销

- 轮换会生成一个只显示一次的新密钥；
- 默认给旧密钥保留 24 小时迁移窗口；
- 吊销应用会让该应用的全部密钥立即失效；
- 每次调用都会记录应用、端点、状态码、耗时和目标元数据，不记录消息正文或完整密钥。

## 7. 常见状态码

| HTTP 状态 | 说明 |
| --- | --- |
| `400` | 参数无效、未指定目标或消息格式错误 |
| `401` | 密钥无效、过期或已吊销 |
| `403` | 权限不足，例如未授权批量发送 |
| `429` | 超过应用每分钟调用上限 |
| `502` | 企业微信接口发送失败 |

OpenAPI 定义可从 `GET https://pxyb.cn/api/notify/openapi.json` 获取。调用审计与密钥状态可在统一控制台“通知服务 > API 接入”中查看。
