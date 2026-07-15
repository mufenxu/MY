# MQTT 监控面板 API 接入说明

## 1. 简介

该服务用于从 MQTT Broker 订阅设备上报的温度、湿度、继电器状态和在线状态，并通过 HTTP API 与浏览器管理页面对外提供数据和配置能力。

默认访问地址示例：

```text
http://localhost:4066
```

如果你部署在服务器上，请把 `localhost` 替换为服务器 IP 或域名。

## 2. 数据接口

### `GET /api/latest`

返回最新采集数据。

响应示例：

```json
{
  "temp": 24.8,
  "hum": 26,
  "timestamp": 1763520770189,
  "relayStatus": "ON",
  "relay2Status": "OFF",
  "esp01sOnline": "online"
}
```

当暂时还没有收到任何传感器或继电器消息时，返回：

```json
{
  "error": "No data yet"
}
```

状态码一般为 `404`。

### `GET /api/status`

返回服务连接状态。

响应示例：

```json
{
  "mqttConnected": true,
  "subscribed": true,
  "lastMsgTimestamp": 1763520770189,
  "lastMessageTopic": "home/esp8266/sensor/temp",
  "lastError": null,
  "connectionState": "connected",
  "activeBroker": "mqtt://localhost:1883",
  "subscribedTopics": [
    "home/esp8266/sensor/temp",
    "home/esp8266/sensor/hum",
    "home/esp8266/relay/status",
    "home/relay/status",
    "home/relay/online"
  ],
  "deviceOnline": true
}
```

字段说明：

- `mqttConnected`：MQTT 是否已连接
- `subscribed`：主题是否订阅成功
- `lastMsgTimestamp`：最近一条消息的时间戳
- `lastMessageTopic`：最近收到的主题
- `lastError`：最近一次错误信息
- `connectionState`：连接状态，例如 `connecting`、`connected`、`offline`
- `activeBroker`：当前连接的 Broker 地址
- `subscribedTopics`：当前订阅的主题列表
- `deviceOnline`：是否在设定阈值内收到过消息

### `GET /api/info`

返回最新数据和连接状态的组合信息，适合前端做统一轮询。

响应示例：

```json
{
  "temp": 24.8,
  "hum": 26,
  "timestamp": 1763520770189,
  "relayStatus": "ON",
  "relay2Status": "OFF",
  "esp01sOnline": "online",
  "mqttConnected": true,
  "subscribed": true,
  "lastMsgTimestamp": 1763520770189,
  "lastMessageTopic": "home/esp8266/sensor/temp",
  "lastError": null,
  "connectionState": "connected",
  "activeBroker": "mqtt://localhost:1883",
  "subscribedTopics": [
    "home/esp8266/sensor/temp",
    "home/esp8266/sensor/hum",
    "home/esp8266/relay/status",
    "home/relay/status",
    "home/relay/online"
  ],
  "deviceOnline": true
}
```

### `GET /api/health`

健康检查接口。

响应示例：

```json
{
  "ok": true,
  "uptime": 123.456,
  "timestamp": 1763520770189
}
```

### `WebSocket /ws`

实时推送接口。连接成功后返回一次完整快照，后续收到 MQTT 消息或连接状态变化时继续推送。

消息示例：

```json
{
  "type": "message",
  "timestamp": 1763520770189,
  "data": {
    "temp": 24.8,
    "hum": 58,
    "messagesReceived": 12,
    "topicStats": {}
  }
}
```

## 3. 配置接口

启用登录鉴权后，本节中的配置、重连和元信息接口需要先登录。

### `GET /api/auth/status`

返回当前鉴权状态。

响应示例：

```json
{
  "enabled": true,
  "authenticated": false,
  "username": null
}
```

### `POST /api/auth/login`

登录管理页面。

请求体示例：

```json
{
  "username": "admin",
  "password": "your-password"
}
```

响应成功后服务端会写入 `HttpOnly` Cookie。

说明：Docker 环境里的 `AUTH_*` 变量主要用于首次生成配置文件。已有 `data/config.json` 时，以配置文件中的 `auth` 配置为准。

### `POST /api/auth/logout`

退出登录并清除会话 Cookie。

### `GET /api/config`

返回当前保存的配置。

### `GET /api/config/defaults`

返回默认配置。

### `PUT /api/config`

保存配置。

请求体示例：

```json
{
  "mqtt": {
    "url": "mqtt://localhost:1883",
    "username": "",
    "password": "",
    "clientId": "node_api_client",
    "clean": true,
    "qos": 0,
    "reconnectPeriod": 1000,
    "connectTimeout": 30000,
    "topics": {
      "temp": "home/esp8266/sensor/temp",
      "hum": "home/esp8266/sensor/hum",
      "relayStatus": "home/esp8266/relay/status",
      "relay2Status": "home/relay/status",
      "relayOnline": "home/relay/online"
    }
  },
  "api": {
    "deviceOnlineThreshold": 60000
  },
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "your-password",
    "sessionSecret": "replace-with-a-random-secret",
    "sessionTtlHours": 24
  },
  "dashboard": {
    "refreshInterval": 5000
  }
}
```

响应示例：

```json
{
  "message": "配置已保存。",
  "restartRequired": false,
  "config": {
    "mqtt": {},
    "api": {},
    "dashboard": {}
  }
}
```

说明：

- MQTT 相关配置保存后会自动触发 MQTT 重连
- 如果将来接口允许修改 `api.port`，会返回 `restartRequired: true`

### `POST /api/config/reset`

恢复默认配置，并自动重连 MQTT。

响应示例：

```json
{
  "message": "已恢复默认配置。",
  "config": {
    "mqtt": {},
    "api": {},
    "dashboard": {}
  }
}
```

### `POST /api/reconnect`

手动触发 MQTT 重连。

响应示例：

```json
{
  "message": "MQTT 已重新连接。"
}
```

### `GET /api/meta`

返回服务元信息。

响应示例：

```json
{
  "serviceName": "MQTT 监控面板",
  "configPath": "/app/data/config.json",
  "dataDirectory": "/app/data",
  "apiPort": 4066,
  "auth": {
    "enabled": true
  },
  "dashboard": {
    "refreshInterval": 5000
  }
}
```

## 4. 页面接入建议

如果你自己写前端、小程序或大屏，推荐这样用：

1. 页面初始化时先调用 `GET /api/info`
2. 每隔 5 到 10 秒轮询一次 `GET /api/info`
3. 配置中心调用 `GET /api/config` 与 `PUT /api/config`
4. 如果需要检测服务存活，可定时调用 `GET /api/health`

## 5. 常见状态码

- `200`：请求成功
- `400`：请求参数不合法
- `401`：未登录或登录失效
- `404`：暂无数据
- `500`：服务内部错误

## 6. 部署提醒

- Docker 部署时请挂载 `./data:/app/data`
- 如果服务暴露到公网，建议额外加鉴权和反向代理
- 如果启用登录鉴权，请务必设置强密码和随机 `sessionSecret`
