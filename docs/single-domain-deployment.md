# 单域名与统一登录部署

## 目标地址

假设统一域名为 `https://admin.example.com`：

```text
https://admin.example.com/               统一登录与总览
https://admin.example.com/apps/core/     综合后台
https://admin.example.com/apps/exam/     考试后台
https://admin.example.com/apps/campus/   校园后台
https://admin.example.com/apps/iot/      IoT 后台
```

后台之间切换不会离开主域名，也不需要再次输入密码。

## 环境变量

1. 将 `.env.example` 复制为 `.env`。
2. 将 `PLATFORM_PUBLIC_ORIGIN` 设置为统一域名，例如 `https://admin.example.com`。
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

以 `infra/nginx/my-platform.conf.example` 为模板，只需让主域名的 `/` 全部代理到 `127.0.0.1:22100`。不要在 Nginx 中分别代理 `/apps/campus` 和 `/apps/iot`，路径改写、WebSocket 和内部身份签发均由平台网关负责。

主模板只包含统一域名，可以直接加载。旧域名或新增独立域名的示例位于 `infra/nginx/additional-domains.conf.example.disabled`；不需要时不要改名或加载，因此不会因为示例证书不存在而影响 `nginx -t`。

需要独立域名时：

1. 修改示例文件中的域名和证书路径，再改名为 `.conf` 后加载。
2. `core`、`exam`、`notify` 仍经过 22100 网关，必须把新域名分别加入 `.env` 的 `CORE_HOSTS`、`EXAM_HOSTS`、`NOTIFY_HOSTS`，多个域名用英文逗号分隔。
3. `campus`、`iot` 示例直接代理 22101、22102；这两个端口仍应只监听 `127.0.0.1`。
4. 小程序尚未迁移请求域名时，可以继续保留原业务域名，不影响统一管理入口。

## 更新容器

```bash
docker compose --env-file .env -f infra/docker/compose.yml pull
docker compose --env-file .env -f infra/docker/compose.yml up -d --no-build --force-recreate
docker compose --env-file .env -f infra/docker/compose.yml ps
```

## 验收顺序

1. 打开主域名，确认只出现一次统一登录。
2. 依次进入综合、考试、校园、IoT 后台，确认没有第二次登录。
3. 刷新每个后台的二级页面，确认页面和静态资源正常。
4. 在 IoT 后台确认 WebSocket 状态为在线。
5. 执行一项低风险写操作，确认保存成功且审计账号正确。
6. 验证原小程序和旧业务域名仍可正常调用。

## 安全边界

`22100`、`22101`、`22102` 默认只绑定 `127.0.0.1`，公网只开放 Nginx 的 `80/443`。MongoDB 不发布宿主机端口。生产环境不得通过防火墙直接开放这些内部端口。
