# 单域名与统一登录部署

## 目标地址

当前统一域名为 `https://pxyb.cn`：

```text
https://pxyb.cn/                         统一登录与总览
https://pxyb.cn/apps/core/               综合后台
https://pxyb.cn/apps/exam/               考试后台
https://pxyb.cn/apps/campus/             校园后台
https://pxyb.cn/apps/iot/                IoT 后台
https://pxyb.cn/api/core/                综合小程序 API
https://pxyb.cn/api/exam/client/         考试小程序 API
https://pxyb.cn/api/campus/              校园服务 API
https://pxyb.cn/api/iot/                 IoT 服务 API
https://pxyb.cn/api/notify               企业微信通知发送 API
```

后台之间切换不会离开主域名，也不需要再次输入密码。

## 环境变量

1. 将 `.env.example` 复制为 `.env`。
2. 将 `PLATFORM_PUBLIC_ORIGIN` 设置为统一域名：`https://pxyb.cn`。
3. 生成内部认证 Ed25519 密钥对：

```bash
npm run keys:internal
```

4. 把输出的私钥和公钥两行原样填入 `.env`。私钥只注入统一网关，下游容器只持有公钥，无法反向伪造管理员身份。
5. 确认以下映射值对应各业务系统中已经存在的管理员账号：

```dotenv
PLATFORM_SSO_CORE_USERNAME=admin
PLATFORM_SSO_EXAM_USERNAME=admin
PLATFORM_SSO_CAMPUS_USERNAME=admin
```

如果页面提示“统一账号尚未完成映射”，应修正映射值，不要关闭业务服务鉴权。

目标业务库完全没有管理员时，首次通过统一网关进入会创建一个 SSO 专用管理员；该账号使用不可回显的随机密码，不能用于旧登录页。只要库中已经存在管理员，系统就不会自动创建或提升账号，映射值仍必须对应现有管理员。

## Nginx

以 `infra/nginx/my-platform.conf.example` 为模板，只需让主域名的 `/` 全部代理到 `127.0.0.1:22100`。不要在 Nginx 中分别代理 `/apps/campus`、`/apps/iot`、`/api/campus` 和 `/api/iot`，路径改写、WebSocket 和内部身份签发均由平台网关负责。

上线前确认 DNS 中根域 `pxyb.cn` 已经添加 A 或 CNAME 记录并指向部署服务器。当前旧业务子域可以继续保留到回归完成后再下线。

主模板只包含统一域名，可以直接加载。旧域名或新增独立域名的示例位于 `infra/nginx/additional-domains.conf.example.disabled`；不需要时不要改名或加载，因此不会因为示例证书不存在而影响 `nginx -t`。

不要把 `pxyb.cn` 填入 `.env` 的 `CORE_HOSTS`、`EXAM_HOSTS`、`NOTIFY_HOSTS`、`CAMPUS_HOSTS` 或 `MQTT_HOSTS`；这些变量只用于旧域名或额外独立域名的 Host 分流。统一域名必须走默认路径分发，否则 `/`、`/apps/*` 和 `/api/*` 会被错误路由到单个业务模块。

需要独立域名时：

1. 修改示例文件中的域名和证书路径，再改名为 `.conf` 后加载。
2. 所有独立域名都代理到 `127.0.0.1:22100`，分别加入 `CORE_HOSTS`、`EXAM_HOSTS`、`NOTIFY_HOSTS`、`CAMPUS_HOSTS` 或 `MQTT_HOSTS`。
3. Campus 和 IoT 的 HTTP、静态资源与 WebSocket 都由网关转发；生产 Compose 不发布 `22101/22102`。
4. 小程序尚未迁移请求域名时，可以继续保留原业务域名，不影响统一管理入口。

## 更新容器

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate
docker compose --env-file .env -f infra/docker/compose.yml ps
```

只有本机排障确实需要直连 Campus/IoT 时，才临时叠加调试文件：

```bash
docker compose --env-file .env -f infra/docker/compose.yml -f infra/docker/compose.debug.yml up -d campus-service iot-service
```

如果同步修改了 Nginx 配置，必须先检查配置，再平滑重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

只有 `nginx -t` 成功后才能执行重载。普通 HTTP 请求应复用上游连接，WebSocket 请求仍通过 `Connection: upgrade` 升级。

## 验收顺序

1. 打开主域名，确认只出现一次统一登录。
2. 依次进入综合、考试、校园、IoT 后台，确认没有第二次登录。
3. 刷新每个后台的二级页面，确认页面和静态资源正常。
4. 在 IoT 后台确认 WebSocket 状态为在线。
5. 执行一项低风险写操作，确认保存成功且审计账号正确。
6. 验证两个小程序只请求 `https://pxyb.cn`，并确认微信公众平台的 request 合法域名已包含 `https://pxyb.cn`。
7. 等待至少两个监控周期，确认历史趋势产生真实样本，异常服务能生成并恢复事件。
8. 运行一次系统诊断，确认 MongoDB、备份执行器和已配置的通知/发布集成状态正确；未配置项应显示“已跳过”。
9. 创建测试会话并从安全中心撤销，确认被撤销会话立即失效。
10. 检查灾备质量页的 RPO、异地状态和恢复演练时间；在启用发布写操作前保持发布中心只读。

## 安全边界

生产环境只有 `22100` 和 MongoDB `27017` 绑定 `127.0.0.1`；Campus/IoT 没有宿主机端口。公网只开放 Nginx 的 `80/443`，服务间调用使用 Docker DNS 和内部鉴权。
