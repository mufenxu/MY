package cn.pxyb.mycontrol.ui.feature.envreference

import androidx.compose.runtime.Immutable

/**
 * 根目录 `.env.example` 的中文对照表：变量名、中文含义、具体用途。
 *
 * 只收录「变量是什么」，**不含任何服务器上的真实取值**；[EnvVariable.example] 仅填写
 * 模板里公开的默认值（端口、超时、开关），密钥类一律留空。
 *
 * 变量清单必须与 `.env.example` 一一对应：新增、删除或改名时同步改这里，
 * 否则根目录 `npm run check:env-reference` 会失败并指出缺失或多余的变量名。
 * 该检查按 `required(` / `keep(` / `optional(` 后的第一个字符串字面量提取变量名，
 * 新增条目请沿用这三个函数，不要直接构造 [EnvVariable]。
 */
internal enum class EnvFill(val label: String) {
    /** 部署前必须替换成自己的值。 */
    Required("必填"),

    /** 模板默认值已可用，一般不需要改。 */
    Keep("保持默认"),

    /** 用到对应功能才需要填写，留空即停用。 */
    Optional("按需填写"),
}

@Immutable
internal data class EnvVariable(
    val key: String,
    val title: String,
    val purpose: String,
    val fill: EnvFill,
    val sensitive: Boolean,
    val example: String?,
)

@Immutable
internal data class EnvGroup(
    val id: String,
    val title: String,
    val summary: String,
    val variables: List<EnvVariable>,
)

internal enum class EnvKindFilter(val label: String) {
    All("全部"),
    Required("必填"),
    Sensitive("敏感"),
}

private fun required(key: String, title: String, purpose: String, secret: Boolean = false, example: String? = null) =
    EnvVariable(key, title, purpose, EnvFill.Required, secret, example)

private fun keep(key: String, title: String, purpose: String, secret: Boolean = false, example: String? = null) =
    EnvVariable(key, title, purpose, EnvFill.Keep, secret, example)

private fun optional(key: String, title: String, purpose: String, secret: Boolean = false, example: String? = null) =
    EnvVariable(key, title, purpose, EnvFill.Optional, secret, example)

internal val envReferenceGroups: List<EnvGroup> = listOf(
    EnvGroup(
        id = "base",
        title = "基础与镜像",
        summary = "时区、阿里云镜像仓库与各服务镜像地址",
        variables = listOf(
            keep("TZ", "容器时区", "所有容器使用的时区，决定日志时间和定时任务（如每日备份）的触发时刻。国内服务器保持不变。", example = "Asia/Shanghai"),
            keep("ACR_REGISTRY", "镜像仓库域名", "阿里云容器镜像仓库的域名，仅用于记录和登录仓库，不参与运行时逻辑。"),
            optional("ACR_USERNAME", "镜像仓库用户名", "ACR 控制台「访问凭证」页显示的用户名，供手机端镜像管理使用。留空时手机端只能查看镜像列表，不能删除。必须与 ACR_PASSWORD 同时填写或同时留空。", secret = true),
            optional("ACR_PASSWORD", "镜像仓库固定密码", "ACR「访问凭证」页设置的固定密码，不是阿里云登录密码。只放在服务器上，用于手机端删除历史镜像。", secret = true),
            keep("MONGODB_IMAGE", "MongoDB 镜像地址", "MongoDB 7 数据库容器使用的镜像，已迁移到阿里云仓库。"),
            keep("PLATFORM_API_IMAGE", "主后端镜像地址", "统一管理中心、综合业务（Core）与考试业务（Exam）合并运行的主后端镜像。更新后端版本就是更新这个镜像。"),
            keep("CORE_API_IMAGE", "综合业务回退镜像", "仅在拆分回退部署（compose.split.yml）时使用，保留已验证的旧综合业务镜像。"),
            keep("EXAM_API_IMAGE", "考试业务回退镜像", "仅在拆分回退部署时使用，保留已验证的旧考试业务镜像。"),
            keep("NOTIFICATION_SERVICE_IMAGE", "通知服务镜像地址", "企业微信等通知通道所在的通知服务镜像。"),
            keep("BACKUP_RUNNER_IMAGE", "备份执行器镜像地址", "内部备份与恢复执行器的镜像，负责实际执行数据库备份和恢复命令。"),
            keep("CAMPUS_SERVICE_IMAGE", "校园服务镜像地址", "对接学校系统（课表、一卡通、图书馆等）的校园服务镜像。"),
            keep("IOT_SERVICE_IMAGE", "IoT 服务镜像地址", "MQTT 设备管理与遥测服务的镜像。"),
        ),
    ),
    EnvGroup(
        id = "network",
        title = "地址、端口与域名",
        summary = "监听地址、端口号和各服务对外域名",
        variables = listOf(
            keep("PLATFORM_BIND_ADDRESS", "主后端绑定地址", "统一后端监听的网卡地址。127.0.0.1 表示只允许服务器本机和反向代理访问，不直接暴露到公网。", example = "127.0.0.1"),
            keep("PLATFORM_API_PORT", "主后端端口", "统一后端对宿主机暴露的端口，反向代理把流量转发到这里。已按统一号段固定。", example = "22100"),
            required("PLATFORM_PUBLIC_ORIGIN", "管理中心公网地址", "统一管理中心的完整 HTTPS 网址（含 https://，末尾不带路径）。用于生成登录回调、Cookie 作用域和 Passkey 域名，生产环境必须是 https。"),
            required("CORE_ADMIN_ORIGINS", "综合后台允许来源", "允许读取综合后台 Cookie / CSRF 响应的前端完整来源。后台独立部署到其他域名时，用英文逗号追加。"),
            optional("HGU_PUBLIC_ORIGIN", "地大智览公网地址", "校园独立入口的公网 HTTPS 地址，用于在可信反向代理后把 HTTP 跳转修正为 HTTPS。"),
            required("CORE_HOSTS", "综合小程序域名", "综合小程序后端使用的域名，只写域名，不含协议和路径。网关按这个域名把请求分给综合业务。"),
            required("EXAM_HOSTS", "考试小程序域名", "考试学习后端使用的域名，只写域名。网关按这个域名把请求分给考试业务。"),
            required("NOTIFY_HOSTS", "通知接口域名", "企业微信通知接口使用的域名，只写域名。"),
            optional("CAMPUS_HOSTS", "校园服务域名", "校园服务的可选独立域名，流量仍然经过统一网关转发。"),
            optional("MQTT_HOSTS", "IoT 服务域名", "IoT 服务的可选独立域名，HTTP 与 WebSocket 都经过统一网关。"),
            keep("CORE_TRUST_PROXY", "综合后端信任代理层数", "综合后端信任前面几层反向代理来获取真实客户端 IP。位于平台反向代理之后保持 1；直接暴露到公网时改 0。", example = "1"),
            keep("EXAM_TRUST_PROXY", "考试后端信任代理层数", "含义同上，作用于考试后端。影响限流和日志里记录的客户端 IP 是否准确。", example = "1"),
            keep("CAMPUS_BIND_ADDRESS", "校园服务调试绑定地址", "只在调试编排（compose.debug.yml）里使用，决定校园服务端口绑定到哪个网卡。", example = "127.0.0.1"),
            keep("CAMPUS_PORT", "校园服务端口", "校园服务的端口号，已按统一号段固定。", example = "22101"),
            keep("IOT_BIND_ADDRESS", "IoT 服务调试绑定地址", "只在调试编排里使用，决定 IoT 服务端口绑定到哪个网卡。", example = "127.0.0.1"),
            keep("IOT_PORT", "IoT 服务端口", "IoT 服务的端口号，已按统一号段固定。", example = "22102"),
            required("IOT_PUBLIC_ORIGIN", "IoT 管理页允许来源", "允许访问 IoT 管理页面的公网来源。单域名部署填管理中心地址，有独立域名时用英文逗号追加。"),
        ),
    ),
    EnvGroup(
        id = "mongo",
        title = "MongoDB 数据库",
        summary = "超级管理员、副本集密钥与各服务独立账号",
        variables = listOf(
            keep("MONGO_ROOT_USERNAME", "数据库超级管理员用户名", "MongoDB 的 root 账号名，用于初始化数据库和创建各服务账号，可以自行修改。", example = "platform_admin"),
            required("MONGO_ROOT_PASSWORD", "数据库超级管理员密码", "MongoDB root 账号的强密码。会被写进连接网址，只能用字母、数字、短横线、下划线等 URL 安全字符。务必妥善备份。", secret = true),
            keep("MONGODB_BIND_ADDRESS", "数据库绑定地址", "MongoDB 端口绑定到宿主机的哪个网卡。保持 127.0.0.1，数据库就不会暴露到公网。", example = "127.0.0.1"),
            keep("MONGODB_PORT", "数据库端口", "MongoDB 映射到宿主机的端口，本机运维工具通过它连接数据库。", example = "27017"),
            required("MONGO_REPLICA_SET_KEY", "副本集内部认证密钥", "MongoDB 副本集节点之间互相认证用的密钥，使用标准 Base64 随机值（48 字节）。", secret = true),
            keep("MONGO_PLATFORM_USERNAME", "平台库账号", "统一管理中心连接 platform_app 数据库的专用账号。每个服务一个独立账号，互相不能读对方的库。", example = "platform_app"),
            required("MONGO_PLATFORM_PASSWORD", "平台库密码", "平台库账号的密码，URL 安全随机值，不要复用 root 密码。", secret = true),
            keep("MONGO_CORE_USERNAME", "综合业务库账号", "综合业务连接 core_app 数据库的专用账号。", example = "core_app"),
            required("MONGO_CORE_PASSWORD", "综合业务库密码", "综合业务库账号的密码，URL 安全随机值。", secret = true),
            keep("MONGO_EXAM_USERNAME", "考试库账号", "考试业务连接 exam_app 数据库的专用账号。", example = "exam_app"),
            required("MONGO_EXAM_PASSWORD", "考试库密码", "考试库账号的密码，URL 安全随机值。", secret = true),
            keep("MONGO_CAMPUS_USERNAME", "校园库账号", "校园服务连接 campus_app 数据库的专用账号。", example = "campus_app"),
            required("MONGO_CAMPUS_PASSWORD", "校园库密码", "校园库账号的密码，URL 安全随机值。", secret = true),
            keep("MONGO_IOT_USERNAME", "IoT 库账号", "IoT 服务连接 iot_app 数据库的专用账号。", example = "iot_app"),
            required("MONGO_IOT_PASSWORD", "IoT 库密码", "IoT 库账号的密码，URL 安全随机值。", secret = true),
            keep("MONGO_NOTIFICATION_USERNAME", "通知库账号", "通知服务连接 notification_app 数据库的专用账号。", example = "notification_app"),
            required("MONGO_NOTIFICATION_PASSWORD", "通知库密码", "通知库账号的密码，URL 安全随机值。", secret = true),
            keep("MONGO_BACKUP_USERNAME", "备份专用账号", "备份执行器导出全部数据库时使用的专用账号，与业务账号分开。", example = "platform_backup"),
            required("MONGO_BACKUP_PASSWORD", "备份专用密码", "备份专用账号的密码，URL 安全随机值。", secret = true),
        ),
    ),
    EnvGroup(
        id = "auth",
        title = "管理中心登录与认证",
        summary = "管理员账号、会话、登录风控、Passkey 与单点登录",
        variables = listOf(
            keep("PLATFORM_ADMIN_USERNAME", "管理员用户名", "统一管理中心（网页和本 App）的登录用户名。", example = "admin"),
            required("PLATFORM_ADMIN_PASSWORD_HASH", "管理员密码哈希", "管理员密码的 scrypt 哈希，不是明文。用 npm run password -- \"你的密码\" 生成，完整粘贴并保留外层单引号。", secret = true),
            keep("PLATFORM_ADMIN_ROLE", "管理员角色", "环境变量管理员的权限等级：viewer 只读；operator 可处置事件与备份；super_admin 可执行恢复和发布。", example = "super_admin"),
            optional("PLATFORM_ADMIN_TOTP_SECRET", "旧部署 TOTP 密钥", "只用于首次迁移旧部署时带入已有的动态验证码密钥。新部署留空，登录后到安全中心绑定设备。", secret = true),
            required("PLATFORM_SESSION_SECRET", "会话签名密钥", "给管理中心登录 Cookie / 会话签名的随机密钥，至少 32 位。更换后所有人需要重新登录。", secret = true),
            required("PLATFORM_AUTH_ENCRYPTION_KEY", "认证材料加密密钥", "加密保存管理员 TOTP 等认证材料的独立密钥（32 字节 Base64URL）。丢失后已绑定的验证器将无法解密。", secret = true),
            required("PLATFORM_INTERNAL_AUTH_PRIVATE_KEY", "内部身份票据私钥", "网关签发内部身份票据（x-my-platform-sso）用的 Ed25519 私钥，只注入主后端。用 npm run keys:internal 生成一对。", secret = true),
            required("PLATFORM_INTERNAL_AUTH_PUBLIC_KEY", "内部身份票据公钥", "各下游服务用来验证内部身份票据的 Ed25519 公钥，必须与上面的私钥是同一对，否则服务间登录全部失败。"),
            required("PLATFORM_EXTERNAL_AUTH_PRIVATE_KEY", "外部登录签名私钥", "给外部项目提供单点登录（OIDC）时签发令牌的独立 Ed25519 私钥。用 npm run keys:external-auth 生成，禁止复用内部票据密钥。", secret = true),
            required("PLATFORM_EXTERNAL_AUTH_PUBLIC_KEY", "外部登录签名公钥", "外部项目验证令牌用的公钥，必须与上面的私钥是同一对。"),
            keep("PLATFORM_EXTERNAL_AUTH_KEY_ID", "外部登录密钥编号", "写进令牌头部的密钥标识。轮换外部登录密钥时改成新编号，方便外部项目区分新旧密钥。", example = "external-auth-v1"),
            keep("PLATFORM_EXTERNAL_AUTH_TOKEN_TTL_SECONDS", "外部登录令牌有效期", "签发给外部项目的登录令牌多少秒后过期，允许 60–3600。", example = "300"),
            keep("PLATFORM_EXTERNAL_AUTH_TOKEN_RATE_LIMIT_PER_MINUTE", "外部登录换令牌限流", "外部项目每分钟最多换取令牌的次数，允许 5–1000，防止被刷。", example = "60"),
            keep("PLATFORM_SESSION_TTL_HOURS", "网页会话最长有效期", "网页端登录后最长保持多少小时，到期必须重新登录，允许 1–168。", example = "12"),
            keep("PLATFORM_SESSION_IDLE_MINUTES", "网页会话空闲超时", "网页端多少分钟没有操作就自动失效，允许 5–240。", example = "30"),
            keep("PLATFORM_REQUIRE_MFA", "强制二次验证", "是否要求每个管理员都使用 TOTP 或 Passkey。生产环境默认开启，首次密码登录会引导绑定。", example = "true"),
            keep("PLATFORM_LOGIN_WINDOW_MINUTES", "登录失败统计窗口", "登录风控统计失败次数的时间窗口（分钟），允许 1–60。", example = "15"),
            keep("PLATFORM_LOGIN_MAX_ATTEMPTS", "窗口内最大失败次数", "同一账号或 IP 在统计窗口内失败达到该次数后被临时锁定，允许 3–100。", example = "10"),
            keep("PLATFORM_LOGIN_CHALLENGE_THRESHOLD", "触发人机验证的失败次数", "连续失败达到该次数后，登录页开始要求人机验证，允许 2–20。", example = "3"),
            keep("PLATFORM_LOGIN_BACKOFF_BASE_MS", "失败退避起始时长", "登录失败后强制等待的起始毫秒数，之后逐次加长，允许 250–10000。", example = "1000"),
            keep("PLATFORM_LOGIN_BACKOFF_MAX_MS", "失败退避最长时长", "登录失败退避等待的上限毫秒数，允许 10000–3600000。", example = "900000"),
            optional("PLATFORM_TURNSTILE_SITE_KEY", "人机验证站点密钥", "Cloudflare Turnstile 的站点密钥（前端使用）。必须与服务端密钥同时配置，只配一个会启动失败。"),
            optional("PLATFORM_TURNSTILE_SECRET_KEY", "人机验证服务端密钥", "Cloudflare Turnstile 的服务端校验密钥。连续登录失败后才会显示人机验证。", secret = true),
            keep("PLATFORM_WEBAUTHN_RP_NAME", "Passkey 显示名称", "注册和使用 Passkey 时系统弹窗里显示的站点名称。", example = "MY Platform"),
            required("PLATFORM_WEBAUTHN_RP_ID", "Passkey 绑定域名", "Passkey 绑定的域名，必须等于管理中心域名或其上级域名。留空时自动取管理中心公网地址的主机名。改动后已注册的 Passkey 会失效。"),
            keep("PLATFORM_SSO_CORE_USERNAME", "综合后台映射账号", "统一账号进入综合后台时，映射成综合后台里哪个已有管理员（userId）。", example = "admin"),
            keep("PLATFORM_SSO_EXAM_USERNAME", "考试后台映射账号", "统一账号进入考试后台时，映射成考试后台里哪个已有管理员用户名。", example = "admin"),
            keep("PLATFORM_SSO_CAMPUS_USERNAME", "校园后台映射账号", "统一账号进入校园后台时映射的校园管理员用户名，通常与 HGU_ADMIN_USERNAME 相同。", example = "admin"),
        ),
    ),
    EnvGroup(
        id = "android",
        title = "Android 客户端安全",
        summary = "本 App 的会话时长、设备证明与完整性校验",
        variables = listOf(
            keep("PLATFORM_ANDROID_SESSION_TTL_HOURS", "App 会话最长有效期", "本 App 登录后最长保持多少小时，允许 24–720。App 本地仍需系统身份验证才能解密会话。", example = "720"),
            keep("PLATFORM_ANDROID_SESSION_IDLE_MINUTES", "App 会话空闲超时", "本 App 多少分钟完全不使用后会话失效，允许 60–43200。", example = "1440"),
            keep("PLATFORM_ANDROID_APP_PACKAGE", "App 包名", "允许使用原生 Passkey 的 Android 应用包名，必须与正式安装包一致。", example = "cn.pxyb.mycontrol"),
            optional("PLATFORM_ANDROID_APP_CERT_SHA256", "App 签名证书指纹", "正式安装包签名证书的 SHA-256 指纹，多个证书用逗号分隔。配置后服务端才会信任本 App 的原生 Passkey 与设备证明。"),
            keep("PLATFORM_ANDROID_REQUIRE_DEVICE_PROOF", "要求设备证明", "是否要求 App 的每个请求都带上手机安全芯片（Keystore）签出的设备证明，防止会话被拷到别的设备使用。", example = "true"),
            keep("PLATFORM_ANDROID_ACCESS_TTL_SECONDS", "App 短期凭据有效期", "App 使用的短期访问凭据多少秒轮换一次，允许 60–900。越短越安全，但刷新更频繁。", example = "900"),
            keep("PLATFORM_ANDROID_REQUIRE_INTEGRITY", "强制硬件完整性校验", "开启后拒绝未通过硬件认证的设备登录。必须先配好可信根证书和 App 证书指纹再开，否则所有设备都会被拒绝。", example = "false"),
            optional("PLATFORM_ANDROID_ATTESTATION_ROOT_SHA256", "硬件认证可信根指纹", "硬件认证链的可信根证书 SHA-256 指纹。未配置时硬件认证一律视为未验证；绝不能使用客户端自己上报的根证书。"),
            keep("PLATFORM_ANDROID_MIN_VERSION_CODE", "最低允许的 App 版本号", "低于该版本号的 App 会被提示「当前版本不再受支持，请更新应用」并拒绝登录。0 表示不限制。", example = "0"),
            keep("PLATFORM_ANDROID_MAX_PATCH_AGE_DAYS", "系统安全补丁最长天数", "手机系统安全补丁超过该天数未更新时拒绝登录，允许 30–730。", example = "180"),
            keep("PLATFORM_ANDROID_ATTESTATION_MAX_AGE_HOURS", "硬件认证结果有效期", "一次硬件认证结果在多少小时内视为有效，过期需重新认证，允许 1–720。", example = "24"),
        ),
    ),
    EnvGroup(
        id = "monitor",
        title = "网关、监控与告警",
        summary = "转发超时、会话缓存、巡检频率和告警阈值",
        variables = listOf(
            keep("PLATFORM_PROXY_TIMEOUT_MS", "网关转发超时", "网关等待内部服务响应的最长毫秒数，超过就向客户端返回超时。", example = "15000"),
            keep("PLATFORM_SESSION_CACHE_TTL_MS", "会话缓存时长", "已登录会话在内存里短暂缓存的毫秒数，减少首屏并发请求重复查数据库。登出会主动清除缓存。", example = "5000"),
            keep("PLATFORM_SESSION_NEGATIVE_CACHE_TTL_MS", "无效会话缓存时长", "「会话不存在或已失效」这一结果的缓存毫秒数，避免无效令牌反复打到数据库。", example = "1000"),
            keep("PLATFORM_SESSION_CACHE_MAX_ENTRIES", "会话缓存容量", "会话缓存最多保存多少条，超出后淘汰旧条目，防止占用过多内存。", example = "2048"),
            required("PLATFORM_METRICS_TOKEN", "监控指标访问令牌", "抓取 Prometheus 指标端点时必须携带的 Bearer 令牌，至少 32 位随机值。", secret = true),
            optional("PLATFORM_BLACKBOX_INGEST_TOKEN", "外部探针上报令牌", "部署在其他机房的黑盒探针向平台上报探测结果时使用的令牌，至少 32 位。不使用外部探针时留空。", secret = true),
            keep("PLATFORM_CONFIG_TWO_PERSON_APPROVAL", "配置变更双人审批", "开启后，配置变更提案必须由另一位超级管理员审批才能生效；关闭时提案人可自行审批。", example = "false"),
            keep("PLATFORM_MONITOR_INTERVAL_MS", "服务巡检间隔", "服务端每隔多少毫秒检查一次各服务的健康状态，允许 10000–300000。", example = "30000"),
            keep("PLATFORM_STATUS_RETENTION_DAYS", "状态历史保留天数", "服务健康状态的历史记录保留多少天，允许 1–365。", example = "30"),
            keep("PLATFORM_AUDIT_RETENTION_DAYS", "审计日志保留天数", "操作审计日志保留多少天，允许 30–730。", example = "180"),
            keep("PLATFORM_INCIDENT_FAILURE_THRESHOLD", "连续失败几次算故障", "某个服务连续多少次巡检失败才创建故障事件，避免偶发抖动误报，允许 1–10。", example = "2"),
            keep("PLATFORM_INCIDENT_RECOVERY_THRESHOLD", "连续成功几次算恢复", "故障中的服务连续多少次巡检成功才自动标记为已恢复，允许 1–10。", example = "2"),
            keep("PLATFORM_SERVICE_LATENCY_THRESHOLD_MS", "服务响应慢的阈值", "健康检查响应超过该毫秒数即视为响应过慢并告警，允许 100–30000。", example = "2000"),
            keep("PLATFORM_PROXY_P95_THRESHOLD_MS", "网关 P95 延迟阈值", "网关转发请求的 P95 耗时超过该毫秒数时告警，允许 100–120000。", example = "3000"),
            keep("PLATFORM_PROXY_ERROR_RATE_PERCENT", "网关错误率阈值", "网关转发的错误率超过该百分比时告警，允许 1–100。", example = "1"),
            keep("PLATFORM_PROXY_ALERT_MINIMUM_REQUESTS", "网关告警最小请求量", "统计窗口内请求数达到该值才判断延迟和错误率，避免流量太小时误报，允许 5–10000。", example = "50"),
            keep("PLATFORM_DISK_USAGE_THRESHOLD_PERCENT", "磁盘占用告警阈值", "磁盘使用率超过该百分比时告警，允许 50–99。", example = "80"),
            keep("PLATFORM_INCIDENT_NOTIFICATIONS_ENABLED", "故障事件推送开关", "发生或恢复故障时是否通过通知服务推送提醒。", example = "true"),
        ),
    ),
    EnvGroup(
        id = "backup",
        title = "备份与恢复",
        summary = "备份执行器、定时备份、恢复开关与异地存储",
        variables = listOf(
            required("PLATFORM_BACKUP_RUNNER_TOKEN", "备份执行器令牌", "网关调用内部备份执行器时使用的独立随机令牌，至少 32 位。", secret = true),
            keep("PLATFORM_RESTORE_CONFIRM_TEXT", "恢复确认短语", "在网页上执行数据恢复时必须手动输入的确认文字，防止误操作。", example = "RESTORE ALL DATA"),
            keep("PLATFORM_BACKUP_COMMAND_TIMEOUT_MS", "备份/恢复命令超时", "单次备份或恢复命令最长运行的毫秒数，默认 30 分钟，允许 1 分钟–6 小时。", example = "1800000"),
            keep("PLATFORM_BACKUP_TRANSFER_TIMEOUT_MS", "备份包传输超时", "上传或下载备份包时的代理超时毫秒数，默认 10 分钟。", example = "600000"),
            keep("PLATFORM_BACKUP_UPLOAD_MAX_BYTES", "上传备份包体积上限", "上传的备份包解压后允许的最大字节数，默认 5GB。", example = "5368709120"),
            keep("PLATFORM_RESTORE_ENABLED", "网页恢复开关", "是否允许在网页上执行数据恢复。网页恢复无法自行停止全部写入服务，生产环境默认关闭，恢复请使用维护命令。", example = "false"),
            keep("PLATFORM_RESTORE_PRE_BACKUP", "恢复前自动备份", "执行恢复前是否先自动备份当前数据，恢复出问题时还能退回。正式环境保持开启。", example = "true"),
            keep("PLATFORM_BACKUP_RPO_HOURS", "备份新鲜度目标", "最近一次备份距今超过该小时数即判定「备份健康」异常并告警，允许 1–720。", example = "26"),
            keep("PLATFORM_BACKUP_SCHEDULE_ENABLED", "每日自动备份开关", "是否每天自动执行一次备份。", example = "false"),
            keep("PLATFORM_BACKUP_SCHEDULE_TIME", "每日自动备份时间", "每日自动备份的触发时间，24 小时制 HH:mm，按 TZ 指定的时区计算。", example = "02:30"),
            optional("PLATFORM_BACKUP_STORAGE_ENCRYPTION_KEY", "异地存储凭据加密密钥", "加密控制台里保存的 S3 / R2 凭据用的独立密钥（32 字节 Base64URL）。留空时无法配置异地存储。", secret = true),
            optional("PLATFORM_OFFSITE_BACKUP_STATUS_URL", "旧版异地状态地址", "旧版外部状态端点的兼容项。配置后会覆盖备份执行器上报的异地备份状态，新部署留空。"),
            optional("PLATFORM_OFFSITE_BACKUP_STATUS_TOKEN", "旧版异地状态令牌", "访问上面旧版异地状态端点时携带的令牌。", secret = true),
        ),
    ),
    EnvGroup(
        id = "release",
        title = "镜像构建与发布",
        summary = "发布中心触发 GitHub 构建与接收回调",
        variables = listOf(
            keep("PLATFORM_GITHUB_REPOSITORY", "构建仓库", "发布中心触发镜像构建的 GitHub 仓库，格式 owner/repo。"),
            keep("PLATFORM_GITHUB_WORKFLOW", "构建工作流文件", "发布中心触发的 GitHub Actions 工作流文件名。", example = "aliyun-acr.yml"),
            keep("PLATFORM_GITHUB_REF", "构建分支", "触发镜像构建时使用的分支或标签。", example = "main"),
            keep("PLATFORM_RELEASE_ACTIONS_ENABLED", "发布写操作开关", "是否允许在发布中心触发构建等写操作。默认只读；开启前必须配好 GH_TOKEN、构建回调令牌和允许的镜像仓库。", example = "false"),
            keep("PLATFORM_RELEASE_ENVIRONMENT", "发布环境名称", "发布记录里标注的环境名称，最长 32 个字符。", example = "production"),
            optional("PLATFORM_RELEASE_CALLBACK_TOKEN", "构建回调令牌", "GitHub Actions 构建完成后回调平台时携带的令牌，必须与 GitHub Actions Secret 里的一致，至少 32 位。", secret = true),
            keep("PLATFORM_RELEASE_ALLOWED_IMAGE_REPOSITORY", "允许回调的镜像仓库", "只接受这个镜像仓库的构建产物回调，防止伪造。不要带标签或结尾冒号。"),
        ),
    ),
    EnvGroup(
        id = "core",
        title = "综合小程序后端",
        summary = "登录令牌、微信凭据、CT8 自动化、下单与涂鸦",
        variables = listOf(
            required("CORE_JWT_SECRET", "综合小程序登录签名密钥", "给综合小程序用户登录令牌签名的随机密钥。更换后所有小程序用户需要重新登录。", secret = true),
            required("CORE_ENCRYPTION_KEY", "综合业务数据加密密钥", "加密综合业务里敏感数据的密钥，至少 32 位。轮换前必须先迁移已有密文，否则旧数据无法解密。", secret = true),
            required("CORE_WECHAT_APP_ID", "综合小程序 AppID", "综合小程序在微信公众平台后台的 AppID，用于微信登录。"),
            required("CORE_WECHAT_APP_SECRET", "综合小程序 AppSecret", "综合小程序的 AppSecret，从微信公众平台后台获取，用于换取用户身份。", secret = true),
            optional("GH_TOKEN", "GitHub 访问令牌", "GitHub Personal Access Token，需要目标仓库的 Actions / Secrets 读写权限。CT8 自动化和发布中心触发构建都靠它；都不用时可留空。", secret = true),
            keep("GH_OWNER", "CT8 仓库所有者", "CT8 自动化任务所在 GitHub 仓库的所有者。"),
            keep("GH_REPO", "CT8 仓库名", "CT8 自动化任务所在的独立仓库名。"),
            optional("GH_REPOSITORY", "CT8 仓库（合并写法）", "用 owner/repo 一次写完仓库位置，可代替 GH_OWNER 与 GH_REPO。"),
            keep("GH_WORKFLOW", "CT8 工作流文件", "CT8 任务要触发的 GitHub Actions 工作流文件名。", example = "ssh-login.yml"),
            keep("GH_REF", "CT8 分支", "触发 CT8 工作流时使用的分支。", example = "main"),
            optional("GH_WEBHOOK_SECRET", "GitHub Webhook 验签密钥", "校验 GitHub Webhook 请求确实来自 GitHub 的密钥。不使用 Webhook 时留空。", secret = true),
            keep("GH_WEBHOOK_ENABLED", "GitHub Webhook 开关", "是否接收并校验 GitHub Webhook 回调。", example = "true"),
            optional("MQTT_API_KEY", "调用 IoT 接口的密钥", "综合后端调用 IoT 服务接口时携带的密钥。IoT 接口未启用鉴权时可留空。", secret = true),
            keep("CORE_MQTT_API_TIMEOUT_MS", "调用 IoT 接口超时", "综合后端调用 IoT 接口的超时毫秒数，必须短于小程序 10 秒的请求预算。", example = "8000"),
            keep("CORE_EXTERNAL_HTTP_TIMEOUT_MS", "外部请求默认超时", "综合后端访问第三方 HTTP 接口的默认超时毫秒数。", example = "10000"),
            keep("CORE_SHUTDOWN_TIMEOUT_MS", "优雅停机等待时长", "收到停止信号后，等待进行中的请求处理完的最长毫秒数，超时强制退出。", example = "15000"),
            keep("ORDER_SUBMIT_CONCURRENCY", "下单并发数", "订单先入库再由后台任务异步提交给上游，这里是同时提交的订单数上限，允许 1–10。", example = "3"),
            keep("ORDER_SUBMIT_POLL_INTERVAL_MS", "下单任务轮询间隔", "后台任务每隔多少毫秒检查一次待提交订单，最小 1000。", example = "5000"),
            keep("MX_REQUEST_TIMEOUT_MS", "课程平台查询超时", "同步访问第三方课程平台（查询类）的超时毫秒数，代码强制限制在 14 秒以内。", example = "10000"),
            keep("MX_SUBMIT_TIMEOUT_MS", "课程平台下单超时", "后台异步向上游提交订单时的超时毫秒数，不受同步预算约束，限制在 5000–60000。", example = "20000"),
            keep("MX_CLIENT_TRADE_NO_FIELD", "上游订单号字段名", "把我方订单号传给上游时使用的参数名，用于防止重复下单。不同供应商按其接口文档覆盖。", example = "trade_no"),
            keep("JOKER_CLIENT_TRADE_NO_FIELD", "Joker 上游订单号字段名", "Joker 供应商接收我方订单号的参数名。", example = "client_order_no"),
            keep("TUYA_API_TIMEOUT_MS", "涂鸦云接口超时", "调用涂鸦云平台接口的超时毫秒数。", example = "10000"),
            keep("TUYA_MESSAGE_REGION", "涂鸦消息数据中心", "订阅涂鸦设备消息时连接的数据中心区域，可填 CN、US、EU、IN。", example = "CN"),
            keep("TUYA_MESSAGE_CHANNEL", "涂鸦消息通道", "订阅涂鸦设备消息的通道：event 为正式通道，event-test 为测试通道。生产环境禁止使用测试通道。", example = "event"),
        ),
    ),
    EnvGroup(
        id = "exam",
        title = "考试后端与 AI",
        summary = "考试小程序凭据、初始管理员、AI 接口与链接解析",
        variables = listOf(
            required("EXAM_JWT_SECRET", "考试小程序登录签名密钥", "给考试小程序用户登录令牌签名的随机密钥。更换后所有考试用户需要重新登录。", secret = true),
            required("EXAM_WECHAT_APP_ID", "考试小程序 AppID", "考试小程序在微信公众平台后台的 AppID。"),
            required("EXAM_WECHAT_APP_SECRET", "考试小程序 AppSecret", "考试小程序的 AppSecret，从对应的微信后台获取。", secret = true),
            required("EXAM_CORS_ORIGINS", "考试接口允许来源", "允许从浏览器调用考试接口的完整 HTTPS 网址，多个用英文逗号分隔。"),
            keep("EXAM_DEFAULT_ADMIN_USERNAME", "考试后台初始管理员", "首次初始化考试后台时创建的管理员用户名。", example = "admin"),
            keep("EXAM_DEFAULT_ADMIN_DISPLAY_NAME", "考试后台管理员显示名", "考试后台初始管理员的显示名称，可以用中文。", example = "Super Admin"),
            optional("EXAM_DEFAULT_ADMIN_PASSWORD", "考试后台初始密码", "只在首次创建默认管理员时使用的明文密码。已有管理员账号后留空，避免明文长期留在配置里。", secret = true),
            keep("EXAM_SEED_SAMPLE_DATA", "写入示例数据", "是否在初始化时写入考试示例数据。正式环境保持 false。", example = "false"),
            keep("EXAM_MONGODB_SERVER_SELECTION_TIMEOUT_MS", "考试库选主超时", "考试后端连接数据库时等待可用节点的最长毫秒数。", example = "5000"),
            keep("EXAM_MONGODB_SOCKET_TIMEOUT_MS", "考试库读写超时", "考试后端单次数据库读写的网络超时毫秒数。", example = "45000"),
            keep("EXAM_MONGODB_MAX_POOL_SIZE", "考试库连接池大小", "考试后端最多同时保持的数据库连接数。", example = "10"),
            optional("SUB2API_BASE_URL", "AI 接口地址", "可选 AI 接口的基础地址，供 AI 功能调用。不使用 AI 时留空。"),
            optional("SUB2API_API_KEY", "AI 接口密钥", "调用上面 AI 接口时使用的密钥。", secret = true),
            keep("SUB2API_MODEL", "AI 模型名称", "AI 功能使用的模型名称，只在配置了 AI 接口时生效。", example = "gpt-4o-mini"),
            keep("PLATFORM_AI_RATE_LIMIT_PER_MINUTE", "AI 助手限流", "本 App 的 AI 小助手每个用户每分钟最多请求的次数。", example = "12"),
            keep("AI_API_TIMEOUT_MS", "AI 助手请求超时", "本 App 的 AI 小助手等待上游 AI 回复的最长毫秒数，不影响考试模块。", example = "30000"),
            keep("PLATFORM_YTDLP_PATH", "yt-dlp 程序路径", "解析非抖音分享链接（媒体下载功能）时调用的 yt-dlp 可执行文件，默认从 PATH 查找。", example = "yt-dlp"),
            keep("PLATFORM_DOWNLOAD_TIMEOUT_MS", "分享链接解析超时", "单次解析分享链接的最长毫秒数，允许 5000–120000。", example = "20000"),
        ),
    ),
    EnvGroup(
        id = "notify",
        title = "通知服务",
        summary = "企业微信、移动新消息、WxPusher 与通知编排",
        variables = listOf(
            required("WECOM_CORP_ID", "企业微信企业 ID", "企业微信的企业 ID，从企业微信管理后台获取。"),
            required("WECOM_AGENT_ID", "企业微信应用 ID", "企业微信自建应用的 AgentId，通常是一串数字。通知从这个应用发出。"),
            required("WECOM_SECRET", "企业微信应用密钥", "企业微信自建应用的 Secret，用于获取发消息的访问令牌。", secret = true),
            required("NOTIFY_API_KEY", "通知接口调用密钥", "其他服务或外部项目调用通知接口时必须携带的密钥，使用随机值。", secret = true),
            required("NOTIFY_HISTORY_ENCRYPTION_KEY", "通知载荷加密密钥", "加密保存可重试消息内容的密钥（32 字节 Base64URL）。必须长期保留，并与数据库备份分开存放。", secret = true),
            keep("NOTIFY_HISTORY_RETENTION_DAYS", "发送记录保留天数", "通知发送台账保留多少天，允许 1–365。", example = "30"),
            keep("NOTIFY_ORCHESTRATION_INTERVAL_MS", "通知任务轮询间隔", "通知编排器每隔多少毫秒检查一次到期的定时通知任务。", example = "15000"),
            keep("NOTIFY_ORCHESTRATION_BATCH_SIZE", "单次处理任务数", "通知编排器每轮最多取出多少个到期任务处理，允许 1–100。", example = "20"),
            keep("NOTIFY_ORCHESTRATION_CONCURRENCY", "通知任务并发数", "通知编排器同时处理的任务数上限。", example = "4"),
            keep("NOTIFY_ORCHESTRATION_LEASE_MS", "任务租约时长", "一个通知任务被领取后独占处理的毫秒数，执行期间自动续租，防止被重复发送，允许 30000–900000。", example = "120000"),
            keep("NOTIFY_INTERNAL_CALLERS", "允许调用通知的内部服务", "允许用内部签名调用通知服务的服务标识，逗号分隔。校园提醒依赖其中的 campus-service。", example = "platform-api,core-api,campus-service"),
            keep("TOKEN_CACHE_MARGIN", "企业微信令牌提前刷新", "企业微信访问令牌在过期前多少秒提前刷新，避免发送时刚好过期。", example = "120"),
            optional("CMCC_API_KEY", "移动新消息密钥", "中国移动新消息（5G 消息）通道的 Channel API Key，格式 ak_xxx 或 app_xxx。必须与 CMCC_RECIPIENT 同时填写或同时留空，只填一个会启动失败。", secret = true),
            optional("CMCC_RECIPIENT", "新消息接收手机号", "接收移动新消息的 11 位手机号，消息固定投递给它。"),
            optional("CMCC_WS_URL", "新消息网关地址", "移动新消息网关的 WebSocket 地址。模板里默认注释掉，留空使用默认网关。"),
            optional("CMCC_UPLOAD_URL", "新消息富媒体上传地址", "移动新消息上传图片等富媒体的地址。模板里默认注释掉，留空使用默认网关。"),
            optional("CMCC_RECEIVE_ENABLED", "接收上行消息", "是否保持常驻连接来接收手机发回的消息。模板里默认注释掉，不写时默认开启。", example = "true"),
            optional("CMCC_REPLY_ENABLED", "短信指令自动回复", "是否对手机短信指令自动回复。模板里默认注释掉，不写时默认开启。", example = "true"),
            optional("WXPUSHER_APP_TOKEN", "WxPusher 应用令牌", "WxPusher 推送通道的 appToken，格式 AT_xxx。必须与 WXPUSHER_UIDS 同时填写或同时留空。", secret = true),
            optional("WXPUSHER_UIDS", "WxPusher 接收人", "接收 WxPusher 推送的 UID，多个用逗号分隔，格式 UID_xxx。"),
            optional("NOTIFY_DISABLED_CHANNELS", "停用的通知渠道", "全局停用某些投递渠道，逗号分隔，可填 wecom、cmcc、wxpusher。留空表示全部启用；只影响发送，App 收件箱照常。"),
        ),
    ),
    EnvGroup(
        id = "campus",
        title = "校园服务",
        summary = "校园后台账号、数据加密、学校域名出口与课程提醒",
        variables = listOf(
            keep("HGU_ADMIN_USERNAME", "校园后台管理员", "校园服务管理后台的登录用户名。", example = "admin"),
            required("HGU_ADMIN_PASSWORD", "校园后台管理员密码", "校园服务管理后台的强密码。", secret = true),
            required("HGU_APP_SESSION_SECRET", "校园会话签名密钥", "给校园服务登录会话签名的随机密钥。用 npm --prefix services/campus-service run secrets:generate 一次生成。", secret = true),
            required("HGU_DATA_ENCRYPTION_KEY", "校园数据加密密钥", "加密保存学校系统 Cookie / Token 的密钥（32 字节 Base64URL，通常 43 个字符）。必须长期备份，随意更换会导致已有校园登录数据无法解密。", secret = true),
            optional("HGU_EXTRA_ALLOWED_SCHOOL_HOSTS", "额外允许的学校域名", "除内置学校域名外，额外允许校园服务访问的域名，多个用英文逗号分隔。通常留空。"),
            optional("HGU_UPSTREAM_TLS_STRICT", "学校证书严格校验", "学校系统使用自签名证书时，默认对学校域名在证书校验失败后降级重试一次。设为 1 则强制严格校验。需同时在 compose.yml 的校园服务环境变量中透传才生效。"),
            optional("HGU_UPSTREAM_PROXY", "学校请求中转代理", "学校系统撤出公网后，云服务器直连会失败，可在校园网内架一个 HTTP 代理并把地址填在这里。留空表示直连。需同时在 compose.yml 中透传才生效。"),
            keep("CAMPUS_REMINDER_INTERVAL_MS", "课程提醒扫描间隔", "校园服务每隔多少毫秒扫描一次即将上课的课程并生成提醒。", example = "300000"),
            keep("CAMPUS_REMINDER_START_DELAY_MS", "课程提醒启动延迟", "校园服务启动后等待多少毫秒再开始第一次课程提醒扫描，避开启动高峰。", example = "45000"),
            keep("CAMPUS_REMINDER_HORIZON_HOURS", "课程提醒预读时长", "每次扫描向后查看多少小时内的课程，允许 1–168。", example = "24"),
            keep("CAMPUS_REMINDER_BATCH_SIZE", "课程提醒单批数量", "每次扫描一批最多处理多少条提醒。", example = "100"),
        ),
    ),
    EnvGroup(
        id = "iot",
        title = "IoT / MQTT 服务",
        summary = "MQTT 连接、IoT 管理页账号与遥测数据保留",
        variables = listOf(
            required("MQTT_URL", "MQTT 服务器地址", "MQTT Broker 的连接地址，格式 mqtt://主机:端口 或 mqtts://主机:端口。Linux 服务器用不了 host.docker.internal 时，改成实际内网 IP 或域名。"),
            optional("MQTT_USERNAME", "MQTT 用户名", "连接 MQTT Broker 的用户名。Broker 未启用认证时留空。"),
            optional("MQTT_PASSWORD", "MQTT 密码", "连接 MQTT Broker 的密码，非空时至少 16 位。轮换时必须同步更新 Broker 和所有设备，不能只改这里就重启。", secret = true),
            keep("MQTT_CLIENT_ID", "MQTT 客户端 ID", "本服务连接 Broker 时使用的客户端 ID，同一个 Broker 内必须唯一，否则会互相挤掉线。", example = "my-platform-iot-service"),
            keep("MQTT_PUBLISH_TIMEOUT_MS", "MQTT 下发等待上限", "向设备下发指令后等待 Broker 确认的最长毫秒数。超时只报告「结果未知」，不会谎称设备已执行成功。", example = "5000"),
            keep("IOT_ADMIN_USERNAME", "IoT 管理页用户名", "IoT 管理页面的登录用户名。", example = "admin"),
            required("IOT_ADMIN_PASSWORD", "IoT 管理页密码", "IoT 管理页面的强密码。", secret = true),
            required("IOT_SESSION_SECRET", "IoT 会话签名密钥", "给 IoT 管理页面登录会话签名的随机密钥。", secret = true),
            keep("IOT_LOG_HTTP_REQUESTS", "记录 HTTP 请求日志", "是否把每个 HTTP 请求写进 IoT 服务日志：1 开启，0 关闭。排查问题时有用，流量大时可关。", example = "1"),
            keep("DATA_RETENTION_DAYS", "遥测数据保留天数", "IoT 设备上报的遥测历史数据保留多少天，过期自动清理。", example = "30"),
        ),
    ),
    EnvGroup(
        id = "resources",
        title = "容器资源上限",
        summary = "各容器的内存、CPU 与进程数限制",
        variables = listOf(
            keep("MONGODB_MEMORY_LIMIT", "数据库内存上限", "MongoDB 容器最多可用的内存。小内存服务器可按实际容量调小。", example = "1g"),
            keep("MONGODB_CPU_LIMIT", "数据库 CPU 上限", "MongoDB 容器的 CPU 配额。0 表示不设硬限制，与其他容器共享宿主机 CPU；设正数时不能超过宿主机核数。", example = "0"),
            keep("PLATFORM_MEMORY_LIMIT", "主后端内存上限", "主后端容器（含管理中心、综合业务、考试业务）最多可用的内存。", example = "2g"),
            keep("PLATFORM_CPU_LIMIT", "主后端 CPU 上限", "主后端容器的 CPU 配额，0 表示不设硬限制。", example = "0"),
            keep("PLATFORM_PIDS_LIMIT", "主后端进程数上限", "主后端容器内最多允许的进程 / 线程数，防止异常时耗尽宿主机资源。", example = "1024"),
            keep("CAMPUS_MEMORY_LIMIT", "校园服务内存上限", "校园服务容器最多可用的内存。", example = "512m"),
            keep("CAMPUS_CPU_LIMIT", "校园服务 CPU 上限", "校园服务容器的 CPU 配额，0 表示不设硬限制。", example = "0"),
            keep("IOT_MEMORY_LIMIT", "IoT 服务内存上限", "IoT 服务容器最多可用的内存。", example = "512m"),
            keep("IOT_CPU_LIMIT", "IoT 服务 CPU 上限", "IoT 服务容器的 CPU 配额，0 表示不设硬限制。", example = "0"),
        ),
    ),
)

/**
 * 按分组、类型和关键字筛选对照表。
 *
 * 关键字不区分大小写，同时匹配变量名、中文名和用途说明；多个关键字以空格分隔，需全部命中。
 * 筛选后没有任何变量的分组会被去掉。
 */
internal fun filterEnvGroups(
    groups: List<EnvGroup>,
    query: String,
    groupId: String?,
    kind: EnvKindFilter,
): List<EnvGroup> {
    val terms = query.trim().lowercase().split(Regex("\\s+")).filter(String::isNotEmpty)
    return groups.mapNotNull { group ->
        if (groupId != null && group.id != groupId) return@mapNotNull null
        val matched = group.variables.filter { variable ->
            val kindMatches = when (kind) {
                EnvKindFilter.All -> true
                EnvKindFilter.Required -> variable.fill == EnvFill.Required
                EnvKindFilter.Sensitive -> variable.sensitive
            }
            kindMatches && terms.all { term ->
                variable.key.lowercase().contains(term) ||
                    variable.title.lowercase().contains(term) ||
                    variable.purpose.lowercase().contains(term)
            }
        }
        if (matched.isEmpty()) null else group.copy(variables = matched)
    }
}
