# GitHub 自动登录（SSH）

本仓库提供通过 GitHub Actions 进行 SSH 自动登录与批量登录能力（支持代理与出口 IP 去重）。

> 注意：请确保遵守目标系统的使用条款，合理合法使用自动化登录。

## 一、准备工作

在 GitHub 仓库中，依次打开 Settings → Secrets and variables → Actions。

### 1. SSH 所需 Secrets（支持密码或私钥；支持代理/多账号）

- `SSH_HOST`：服务器地址或域名（必填）
- `SSH_USER`：SSH 用户名（单账号时必填）
- `SSH_PASSWORD`：密码登录（推荐与本仓库方案搭配）
- `SSH_PRIVATE_KEY`：私钥登录（OpenSSH 格式，可选）
- `SSH_PORT`：端口，可选，默认 22
- `SSH_PASSPHRASE`：如果私钥有口令，填此项，可选
- `PROXY_LIST`：可选，多行代理（如 `socks5://user:pass@ip:port`），将随机轮换
- `ACCOUNTS_JSON`：可选，多账号 JSON（见下）
- `USERS_LIST`：可选，仅用户名列表（见下），其余 `SSH_HOST/SSH_PASSWORD/SSH_PORT` 复用

> `SSH_PRIVATE_KEY` 需要粘贴完整的 OpenSSH 私钥内容，包括标准的起始行和结束行；不要把真实私钥写入仓库文件。

### 2. 网页面板所需 Secrets / Variables

Secrets（敏感信息）：

- `PANEL_URL`：登录页地址（必填）
- `PANEL_USERNAME`：用户名（必填）
- `PANEL_PASSWORD`：密码（必填）

Variables（可选，便于自定义选择器）：

- `LOGIN_USERNAME_SELECTOR`：用户名输入框 CSS 选择器（可多个用英文逗号分隔）
- `LOGIN_PASSWORD_SELECTOR`：密码输入框 CSS 选择器（可多个用英文逗号分隔）
- `LOGIN_SUBMIT_SELECTOR`：提交按钮 CSS 选择器（可多个用英文逗号分隔）
- `SUCCESS_SELECTOR`：登录成功后的页面元素选择器（可选）

> 若不提供自定义选择器，脚本会尝试通用选择器（如 `input[name="username"]`、`input[name="password"]`、`button[type="submit"]` 等）。

## 二、如何使用

### 1) 运行 SSH 登录

- 打开 Actions → 选择 `SSH Login` → `Run workflow`
- 可在输入框自定义登录后执行的命令，默认 `uname -a`

工作流文件：`.github/workflows/ssh-login.yml`

#### 1.1 单账号登录（最简单）

在 Secrets 配置 `SSH_HOST`、`SSH_USER`、`SSH_PASSWORD`（或 `SSH_PRIVATE_KEY`），然后运行 `SSH Login`。

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

（已移除网页端登录相关内容，仓库仅保留 SSH 方案）

## 三、常见问题

- 选择器不匹配：请在仓库 Variables 中配置自定义选择器。
- 二步验证/验证码：当前脚本未内置处理，需要按站点机制扩展。
- 证书/受信任主机：SSH 工作流会自动 `ssh-keyscan` 添加到 `known_hosts`。
 - Tor 指定国家：可行但不稳定，建议使用指定国家的代理池或跳板机。
 - 出口 IP 去重：通过访问 `https://api.ipify.org` 检测当前出口 IP；Tor/代理偶尔重复时会自动重试，超过 10 次给出警告继续。

## 四、附注

- Tor 指定国家：可行但不稳定，建议使用指定国家的代理池或跳板机。
- 出口 IP 去重：通过访问 `https://api.ipify.org` 检测当前出口 IP；Tor/代理偶尔重复时会自动重试，超过 10 次给出警告继续。
