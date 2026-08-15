# MY External SSO Express Example

这是一个最小但完整的服务端接入参考，使用 Express Session 保存 OAuth 临时状态和项目本地登录会话，使用 `jose` 从 MY JWKS 验证 EdDSA ID Token。

## 注册值

在 MY 控制台创建外部应用：

```text
启动地址: https://project.example.com/auth/my/start
回调地址: https://project.example.com/auth/my/callback
健康地址: https://project.example.com/health
```

## 环境变量

```text
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://project.example.com
MY_ISSUER=https://pxyb.cn
MY_CLIENT_ID=控制台显示的客户端 ID
MY_CLIENT_SECRET=创建或轮换后只显示一次的 Secret
MY_REDIRECT_URI=https://project.example.com/auth/my/callback
SESSION_SECRET=至少 32 字符的独立随机值
```

不要提交真实环境变量。生产环境应通过 VPS 密钥文件、容器 Secret 或密钥管理服务注入。

## 启动

```powershell
npm.cmd install
npm.cmd start
```

开发环境可以使用 loopback 地址，例如 `APP_ORIGIN=http://127.0.0.1:3000`，并在 MY 开发环境注册完全相同的回调地址。

示例使用 `express-session` 默认内存 Store，仅适合本地验证。生产环境和多实例部署必须改为 Redis 等共享 Store，并按业务要求设置会话空闲超时、绝对过期和权限检查。

完整协议、安全要求和排障说明见 `docs/external-project-sso.md`。
