package cn.pxyb.mycontrol.ui.feature.search

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.CampusWaterValve
import cn.pxyb.mycontrol.data.DailyNews
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.navigation.AppRoute
import cn.pxyb.mycontrol.ui.sectionError

enum class SearchDestination { Overview, Operations, Notifications, Tools, GoogleAccounts, Today, Timetable, Todos, Scenes }

@Immutable
data class GlobalSearchItem(
    val id: String,
    val title: String,
    val detail: String,
    val category: String,
    val destination: SearchDestination,
    val focusId: String? = null,
    val featureRoute: String? = null,
)

@Immutable
data class GlobalSearchUiState(
    val refreshing: Boolean,
    val error: String?,
    val items: List<GlobalSearchItem>,
)

internal val featureSearchItems = listOf(
    GlobalSearchItem("feature:today", "今日安排", "今日课程、个人待办与到期提醒", "日常安排", SearchDestination.Today, featureRoute = AppRoute.Today),
    GlobalSearchItem("feature:timetable", "本学期课表", "课程、上课地点与校历", "校园服务", SearchDestination.Timetable, featureRoute = AppRoute.Timetable),
    GlobalSearchItem("feature:todos", "个人待办", "添加任务、截止时间、优先级与重复提醒", "日常安排", SearchDestination.Todos, featureRoute = AppRoute.Todos),
    GlobalSearchItem("feature:campus", "校园服务", "一卡通余额、宿舍能耗、绩点与校园工具", "校园服务", SearchDestination.Today, featureRoute = AppRoute.Campus),
    GlobalSearchItem("feature:reservation", "研讨间预约", "图书馆研讨间、预约记录与自动预约", "校园服务", SearchDestination.Today, featureRoute = AppRoute.Reservation),
    GlobalSearchItem("feature:seat", "座位预约", "图书馆自习座位与我的预约", "校园服务", SearchDestination.Today, featureRoute = AppRoute.LibrarySeatReservation),
    GlobalSearchItem("feature:classrooms", "空闲教室", "查找可以自习的空教室", "校园服务", SearchDestination.Today, featureRoute = AppRoute.FreeClassrooms),
    GlobalSearchItem("feature:water", "饮水机", "校园饮水、开关与用水账单", "校园服务", SearchDestination.Today, featureRoute = AppRoute.CampusWaterValve),
    GlobalSearchItem("feature:news", "每日新闻", "新闻简报与资讯", "日常安排", SearchDestination.Overview, featureRoute = AppRoute.DailyNews),
    GlobalSearchItem("feature:devices", "设备控制", "灯光、插座、环境温湿度与 IoT 状态", "设备与自动化", SearchDestination.Tools, featureRoute = AppRoute.Tools),
    GlobalSearchItem("feature:scenes", "场景与自动化", "智能场景、条件规则、NFC 与执行记录", "设备与自动化", SearchDestination.Scenes, featureRoute = AppRoute.Scenes),
    GlobalSearchItem("feature:status", "系统状态", "服务监控、巡检、备份与资源续期", "系统维护", SearchDestination.Operations, featureRoute = AppRoute.Operations),
    GlobalSearchItem("feature:projects", "项目与发布", "GitHub、Android 发布、CT8 任务与容器镜像", "项目与发布", SearchDestination.Operations, featureRoute = AppRoute.Projects),
    GlobalSearchItem("feature:github", "GitHub 项目", "仓库公开性与 Release 管理", "项目与发布", SearchDestination.Operations, featureRoute = AppRoute.GitHubProjects),
    GlobalSearchItem("feature:android", "Android 发布管理", "版本构建、发布配置与历史安装包", "项目与发布", SearchDestination.Operations, featureRoute = AppRoute.AndroidReleases),
    GlobalSearchItem("feature:registry", "容器镜像管理", "阿里云 ACR 历史镜像清理", "项目与发布", SearchDestination.Operations, featureRoute = AppRoute.RegistryImages),
    GlobalSearchItem("feature:authenticator", "本地验证器", "第三方网站 TOTP 动态验证码、离线验证", "账号工具", SearchDestination.Overview, featureRoute = AppRoute.Authenticator),
    GlobalSearchItem("feature:google", "Google 邮箱台账", "邮箱、别名、账号与 OpenAI 使用状态", "账号工具", SearchDestination.GoogleAccounts, featureRoute = AppRoute.GoogleAccounts),
    GlobalSearchItem("feature:account", "账号与安全", "修改密码、MFA、Passkey、恢复码与应用锁", "账号与安全", SearchDestination.Overview, featureRoute = AppRoute.Account),
    GlobalSearchItem("feature:sessions", "登录设备与会话", "撤销登录、退出其他设备与电脑端免密登录", "账号与安全", SearchDestination.Overview, featureRoute = AppRoute.LoginSessions),
    GlobalSearchItem("feature:notifications", "通知中心", "未读消息、任务提醒与稍后提醒", "通知与偏好", SearchDestination.Notifications, featureRoute = AppRoute.Notifications),
    GlobalSearchItem("feature:notification-settings", "通知设置", "免打扰、安静时段、业务订阅、每日简报与上课专注", "通知与偏好", SearchDestination.Overview, featureRoute = AppRoute.NotificationSettings),
    GlobalSearchItem("feature:assistant", "AI 小助手", "个人助手、安排与快捷操作", "日常安排", SearchDestination.Overview, featureRoute = AppRoute.Assistant),
)

internal fun AppUiState.toGlobalSearchUiState() = GlobalSearchUiState(
    refreshing = isRefreshing(
        DataSection.Overview,
        DataSection.ExternalApplications,
        DataSection.Incidents,
        DataSection.Tasks,
        DataSection.Todos,
        DataSection.Campus,
        DataSection.Resources,
        DataSection.Iot,
        DataSection.Notifications,
    ),
    error = sectionError(
        DataSection.Overview,
        DataSection.ExternalApplications,
        DataSection.Incidents,
        DataSection.Tasks,
        DataSection.Todos,
        DataSection.Campus,
        DataSection.Resources,
        DataSection.Iot,
        DataSection.Notifications,
    ),
    items = buildList {
        addAll(featureSearchItems)
        externalApplications.filter(ExternalApplication::enabled).forEach { application ->
            add(
                GlobalSearchItem(
                    id = "application:${application.id}",
                    title = application.name,
                    detail = listOf(application.description, application.health.state)
                        .filter(String::isNotBlank)
                        .joinToString(" · "),
                    category = "接入应用",
                    destination = SearchDestination.Overview,
                    focusId = application.id,
                ),
            )
        }
        overview?.services.orEmpty().forEach { service ->
            add(
                GlobalSearchItem(
                    id = "service:${service.id}",
                    title = service.name,
                    detail = "${service.category} · ${service.state}",
                    category = "服务",
                    destination = SearchDestination.Operations,
                ),
            )
        }
        incidents.forEach { incident ->
            add(
                GlobalSearchItem(
                    id = "incident:${incident.id}",
                    title = incident.title,
                    detail = listOf(incident.source, incident.description).filter(String::isNotBlank).joinToString(" · "),
                    category = "系统通知",
                    destination = SearchDestination.Notifications,
                ),
            )
        }
        tasks.forEach { task ->
            add(
                GlobalSearchItem(
                    id = "platform-task:${task.id}",
                    title = task.title,
                    detail = listOf(task.source, task.status, task.detail).filter(String::isNotBlank).joinToString(" · "),
                    category = "平台任务",
                    destination = SearchDestination.Notifications,
                    focusId = task.id,
                ),
            )
        }
        alerts.filter { it.origin == "remote" }.forEach { alert ->
            add(
                GlobalSearchItem(
                    id = "notification:${alert.id}",
                    title = alert.title,
                    detail = listOf(alert.type, alert.body).filter(String::isNotBlank).joinToString(" · "),
                    category = "通知",
                    destination = SearchDestination.Notifications,
                    focusId = alert.id,
                ),
            )
        }
        todoSnapshot.tasks.forEach { task ->
            add(
                GlobalSearchItem(
                    id = "todo:${task.id}",
                    title = task.title,
                    detail = listOf(task.priority, task.courseRef?.name.orEmpty()).filter(String::isNotBlank).joinToString(" · "),
                    category = "个人待办",
                    destination = SearchDestination.Todos,
                    focusId = task.id,
                ),
            )
        }
        resourceExpiries.forEach { resource ->
            add(
                GlobalSearchItem(
                    id = "resource:${resource.id}",
                    title = resource.name,
                    detail = "${resource.type} · ${resource.expiresAt}",
                    category = "资源到期",
                    destination = SearchDestination.Today,
                    focusId = resource.id,
                ),
            )
        }
        campusTimetable?.courses.orEmpty().forEach { course ->
            add(
                GlobalSearchItem(
                    id = "course:${course.id}",
                    title = course.courseName,
                    detail = listOf(course.dayName, course.sectionText, course.location).filter(String::isNotBlank).joinToString(" · "),
                    category = "课程",
                    destination = SearchDestination.Timetable,
                ),
            )
        }
        iot?.devices.orEmpty().forEach { device ->
            add(
                GlobalSearchItem(
                    id = "device:${device.id}",
                    title = device.name,
                    detail = if (device.online) "设备在线" else "设备离线",
                    category = "设备",
                    destination = SearchDestination.Tools,
                ),
            )
        }
        iot?.scenes.orEmpty().forEach { scene ->
            add(
                GlobalSearchItem(
                    id = "scene:${scene.id}",
                    title = scene.name,
                    detail = "${scene.actionCount} 个设备动作",
                    category = "智能场景",
                    destination = SearchDestination.Scenes,
                ),
            )
        }
        googleAccounts.forEach { account ->
            add(
                GlobalSearchItem(
                    id = "google:${account.id}",
                    title = account.primaryEmail,
                    detail = listOf(account.displayName, account.tags.joinToString(" · ")).filter(String::isNotBlank).joinToString(" · "),
                    category = "邮箱",
                    destination = SearchDestination.GoogleAccounts,
                ),
            )
        }
    },
)
