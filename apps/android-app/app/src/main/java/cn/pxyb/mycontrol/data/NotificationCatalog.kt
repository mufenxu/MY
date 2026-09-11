package cn.pxyb.mycontrol.data

/**
 * 通知分类归一化。
 *
 * 服务端 `category` 采用命名空间写法（`todo.reminder`、`resource.expiry`、`campus.course.reminder`），
 * 本地提醒采用短类型（`todo`、`course`、`resource`、`incident`）。两者在此统一映射到同一套分类，
 * 避免筛选标签与卡片样式只识别其中一种写法而长期为空。
 */
enum class NotificationKind(val id: String, val label: String) {
    Alert("alert", "告警"),
    Task("task", "任务"),
    Schedule("schedule", "日程"),
    Device("device", "设备"),
    Security("security", "安全"),
    System("system", "通知"),
    ;

    companion object {
        fun fromId(id: String?): NotificationKind? = entries.firstOrNull { it.id == id }
    }
}

private val ALERT_HEADS = setOf("incident", "alert", "alarm", "outage")
private val TASK_HEADS = setOf("todo", "task", "backup", "release", "build", "deploy", "change", "rollback", "config")
private val SCHEDULE_HEADS = setOf("campus", "course", "resource", "schedule", "reminder", "daily", "brief", "calendar")
private val DEVICE_HEADS = setOf("iot", "device", "sensor", "valve", "water")
private val SECURITY_HEADS = setOf("security", "auth", "passkey", "session", "credential", "login")

/** 依据通知类型命名空间解析分类；未知类型统一归入「通知」。 */
fun notificationKindOf(type: String): NotificationKind {
    val head = type.trim().lowercase().substringBefore('.')
    return when (head) {
        in ALERT_HEADS -> NotificationKind.Alert
        in TASK_HEADS -> NotificationKind.Task
        in SCHEDULE_HEADS -> NotificationKind.Schedule
        in DEVICE_HEADS -> NotificationKind.Device
        in SECURITY_HEADS -> NotificationKind.Security
        else -> NotificationKind.System
    }
}

/** 服务端已接管的提醒命名空间：这些提醒到达后本地不再重复生成同类提醒。 */
internal val REMOTE_OWNED_REMINDER_PREFIXES = listOf("todo.", "resource.", "campus.")

fun AppAlertRecord.kind(): NotificationKind = notificationKindOf(type)

/** 高优先级/紧急标记：服务端使用 high/critical，本地历史记录使用 urgent/high。 */
fun AppAlertRecord.isHighPriority(): Boolean =
    priority.lowercase() in setOf("urgent", "critical", "high")

fun AppAlertRecord.isSnoozedAt(now: Long = System.currentTimeMillis()): Boolean =
    snoozedUntil?.let { it > now } == true

/** 未读口径：已稍后的提醒被主动推迟，不再计入未读角标，避免角标与列表不一致。 */
fun List<AppAlertRecord>.activeUnreadCount(now: Long = System.currentTimeMillis()): Int =
    count { !it.read && !it.isSnoozedAt(now) }
