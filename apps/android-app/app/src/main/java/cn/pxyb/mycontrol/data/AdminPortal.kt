package cn.pxyb.mycontrol.data

enum class AdminPortalCategory {
    Console,
    Module,
}

data class AdminPortal(
    val id: String,
    val title: String,
    val description: String,
    val path: String,
    val category: AdminPortalCategory,
) {
    fun url(baseUrl: String): String = joinUrl(baseUrl, path)
}

data class AdminPortalLink(
    val id: String,
    val title: String,
    val description: String,
    val url: String,
    val category: AdminPortalCategory,
)

fun adminPortals(baseUrl: String): List<AdminPortalLink> = AdminPortalRegistry
    .map { portal ->
        AdminPortalLink(
            id = portal.id,
            title = portal.title,
            description = portal.description,
            url = portal.url(baseUrl),
            category = portal.category,
        )
    }

private val AdminPortalRegistry = listOf(
    AdminPortal(
        id = "admin-console",
        title = "统一服务控制台",
        description = "服务、部署、备份和环境诊断",
        path = "/console",
        category = AdminPortalCategory.Console,
    ),
    AdminPortal(
        id = "core-admin",
        title = "综合平台后台",
        description = "用户、资源、应用与平台配置",
        path = "/apps/core/",
        category = AdminPortalCategory.Module,
    ),
    AdminPortal(
        id = "exam-admin",
        title = "考试平台后台",
        description = "考试、题库、成绩与阅卷管理",
        path = "/apps/exam/",
        category = AdminPortalCategory.Module,
    ),
    AdminPortal(
        id = "campus-admin",
        title = "校园服务后台",
        description = "课表、校园卡、空教室与校园数据",
        path = "/apps/campus/",
        category = AdminPortalCategory.Module,
    ),
    AdminPortal(
        id = "iot-admin",
        title = "IoT 设备后台",
        description = "设备、继电器、MQTT 与自动化",
        path = "/apps/iot/",
        category = AdminPortalCategory.Module,
    ),
)

private fun joinUrl(baseUrl: String, path: String): String {
    val normalizedBase = baseUrl.trim().trimEnd('/')
    val normalizedPath = path.trim().let { value ->
        when {
            value.isBlank() -> "/"
            value.startsWith("/") -> value
            else -> "/$value"
        }
    }
    return normalizedBase + normalizedPath
}
