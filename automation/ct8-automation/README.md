# GitHub 自动登录（SSH）

本仓库提供通过 GitHub Actions 进行 SSH 自动登录与批量登录能力（支持代理与出口 IP 去重）。

> 注意：请确保遵守目标系统的使用条款，合理合法使用自动化登录。

## 一、准备工作

在 GitHub 仓库中，依次打开 Settings → Secrets and variables → Actions。

### 1. SSH 所需 Secrets（支持密码登录；支持代理/多账号）

- `SSH_HOST`：服务器地址或域名（必填）
- `SSH_USER`：SSH 用户名（单账号时必填）
- `SSH_PASSWORD`：密码登录（**当前唯一支持的登录方式**，workflow 通过 `sshpass` 使用）
- `SSH_PORT`：端口，可选，默认 22
- `PROXY_LIST`：可选，多行代理（如 `socks5://user:pass@ip:port`），将随机轮换
- `ACCOUNTS_JSON`：可选，多账号 JSON（见下）
- `USERS_LIST`：可选，仅用户名列表（见下），其余 `SSH_HOST/SSH_PASSWORD/SSH_PORT` 复用

> 私钥登录（`SSH_PRIVATE_KEY`/`SSH_PASSPHRASE`）**已移除**，配置它们不会生效。请勿把真实密码或私钥写入仓库文件。

### 2. 参数总览（与 `ssh-login.yml` 一致）

**Secrets**（本 workflow 实际读取的全部变量；未列出的一律不生效）：

| Secret | 必填 | 用途 |
| --- | --- | --- |
| `SSH_HOST` | 是 | 目标主机 |
| `SSH_USER` | 单账号时是 | SSH 用户名 |
| `SSH_PASSWORD` | 是 | SSH 密码（当前仅支持密码登录，使用 `sshpass`） |
| `SSH_PORT` | 否 | 端口，默认 22 |
| `PROXY_LIST` | 否 | 多行代理池，随机轮换 |
| `USERS_LIST` | 否 | 仅用户名不同的多账号列表 |
| `ACCOUNTS_JSON` | 否 | 完整账号 JSON（主机/端口/用户/密码可各不同） |
| `RESULT_CALLBACK_URL` | 否 | 结果回调地址 |
| `RESULT_CALLBACK_AUTH` | 否 | 回调鉴权头取值 |
| `EMAS_SPACE_SECRET` | 否 | 阿里云 EMAS 空间密钥 |
| `EMAS_SPACE_SECRET_HEADER` | 否 | EMAS 密钥所在请求头名 |

**Variables**：本 workflow **不读取任何 `vars.*`**。

> 早期版本曾支持网页端（`PANEL_*` 与 `*_SELECTOR`）登录与私钥登录（`SSH_PRIVATE_KEY`/`SSH_PASSPHRASE`），这些能力**已移除**。配置它们不会产生任何效果。

## 二、如何使用

### 1) 运行 SSH 登录

- 打开 Actions → 选择 `SSH Login` → `Run workflow`
- 可在输入框自定义登录后执行的命令，默认 `uname -a`

工作流文件位于本子项目内：`automation/ct8-automation/.github/workflows/ssh-login.yml`。
注意它**不在仓库根的 `.github/workflows/` 下**，因此无法从本仓库的 Actions 页面直接 dispatch；如需运行，请按 GitHub 对工作流目录的要求部署，或把该文件复制到根 `.github/workflows/`（复制前请确认根仓库的权限与 secrets 配置）。

#### 1.1 单账号登录（最简单）

在 Secrets 配置 `SSH_HOST`、`SSH_USER`、`SSH_PASSWORD`，然后运行 `SSH Login`。

#### 1.2 多账号（两种方式）

- 方式 A：`USERS_LIST` 仅用户不同

  - 适用于多个账号用户名不同，其余信息相同（同一目标主机与密码）。
  - 设置：
    - `SSH_HOST`、`SSH_PASSWORD`（可选 `SSH_PORT`）
    - `USERS_LIST`：逗号或换行分隔，例如：
      ```
      alice,bob,charlie
      ```
  - 工作流会逐个用户名登录，并确保每次使用的出口 IP 不重复（优先 Tor，其次代理池 PROXY_LIST）。

- 方式 B：`ACCOUNTS_JSON` 完整账号列表

  - 适用于每个账号的主机、端口、用户名、密码都可能不同：
    ```json
    [
      {"host":"1.2.3.4","user":"alice","password":"p1","port":22},
      {"host":"1.2.3.4","user":"bob","password":"p1"},
      {"host":"a.example.com","user":"c","password":"p3","port":2222}
    ]
    ```
  - 会逐个账号登录，并保证出口 IP 不与前面重复（最多重试 10 次）。

#### 1.3 免费换 IP（Tor）与代理池（可选）

- 已集成 Tor：每次运行会启动本地 Tor SOCKS5 并请求 NEWNYM，优先作为出口。如果目标屏蔽 Tor，可在 Secrets 配置 `PROXY_LIST` 使用你自有代理池。
- 代理池示例（`PROXY_LIST` 多行）：
  ```
  socks5://user:pass@1.2.3.4:1080
  socks5://5.6.7.8:1080
  http://9.9.9.9:8080
  ```
  若未设置 `PROXY_LIST`，则仅用 Tor；二者都不用时，直连。

## 三、常见问题

- 选择器不匹配：**已不适用**，网页端登录能力已移除。
- 二步验证/验证码：当前脚本未内置处理，需要按站点机制扩展。
- 证书/受信任主机：SSH 工作流会自动 `ssh-keyscan` 添加到 `known_hosts`。
 - Tor 指定国家：可行但不稳定，建议使用指定国家的代理池或跳板机。
 - 出口 IP 去重：通过访问 `https://api.ipify.org` 检测当前出口 IP；Tor/代理偶尔重复时会自动重试，超过 10 次给出警告继续。

## 四、附注

- Tor 指定国家：可行但不稳定，建议使用指定国家的代理池或跳板机。
- 出口 IP 去重：通过访问 `https://api.ipify.org` 检测当前出口 IP；Tor/代理偶尔重复时会自动重试，超过 10 次给出警告继续。
