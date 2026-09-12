package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Security
import androidx.compose.runtime.key
import androidx.compose.ui.graphics.vector.ImageVector
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.NotificationKind
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.data.isHighPriority
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.data.kind
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale

/** 通知中心筛选维度：与 [NotificationKind] 的 id 保持一致，便于按分类直接匹配。 */
internal enum class NotificationFilter(val id: String, val label: String) {
    All("all", "全部"),
    Unread("unread", "未读"),
    Alert("alert", "告警"),
    Task("task", "任务"),
    Schedule("schedule", "日程"),
    Device("device", "设备"),
    Security("security", "安全"),
    Snoozed("snoozed", "稍后"),
}

internal data class NotificationStats(val unread: Int, val today: Int, val urgent: Int)

internal data class NotificationDaySection(val key: String, val label: String, val alerts: List<AppAlertRecord>)

internal fun notificationSubtitle(unreadCount: Int): String =
    if (unreadCount > 0) "$unreadCount 条未读消息" else "系统告警、任务与日程消息"

internal fun notificationEmptyIcon(filterId: String, query: String): ImageVector = when {
    query.isNotBlank() -> Icons.Outlined.SearchOff
    filterId == NotificationFilter.Unread.id -> Icons.Outlined.DoneAll
    filterId == NotificationFilter.Snoozed.id -> Icons.Outlined.AccessTime
    else -> Icons.Outlined.Notifications
}

internal fun notificationStats(alerts: List<AppAlertRecord>, now: Long): NotificationStats {
    val zone = ZoneId.systemDefault()
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    return NotificationStats(
        unread = alerts.activeUnreadCount(now),
        today = alerts.count { Instant.ofEpochMilli(it.createdAt).atZone(zone).toLocalDate() == today },
        urgent = alerts.count { !it.read && it.isHighPriority() && !it.isSnoozedAt(now) },
    )
}

internal fun notificationFilterCounts(alerts: List<AppAlertRecord>, now: Long): Map<NotificationFilter, Int> =
    NotificationFilter.entries.associateWith { filter ->
        alerts.count { alert -> alertMatchesFilter(alert, filter, now) }
    }

private fun alertMatchesFilter(alert: AppAlertRecord, filter: NotificationFilter, now: Long): Boolean {
    val snoozed = alert.isSnoozedAt(now)
    return when (filter) {
        NotificationFilter.All -> true
        NotificationFilter.Snoozed -> snoozed
        NotificationFilter.Unread -> !alert.read && !snoozed
        else -> !snoozed && alert.kind().id == filter.id
    }
}

internal fun filterNotifications(
    alerts: List<AppAlertRecord>,
    filterId: String,
    query: String,
    now: Long,
): List<AppAlertRecord> {
    val filter = NotificationFilter.entries.firstOrNull { it.id == filterId } ?: NotificationFilter.All
    val keyword = query.trim()
    return alerts.filter { alert ->
        alertMatchesFilter(alert, filter, now) && (
            keyword.isEmpty() ||
                alert.title.contains(keyword, ignoreCase = true) ||
                alert.body.contains(keyword, ignoreCase = true)
            )
    }
}

internal fun notificationDaySections(
    alerts: List<AppAlertRecord>,
    now: Long = System.currentTimeMillis(),
): List<NotificationDaySection> {
    val zone = ZoneId.systemDefault()
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    return alerts
        .groupBy { Instant.ofEpochMilli(it.createdAt).atZone(zone).toLocalDate() }
        .entries
        .sortedByDescending { it.key }
        .map { (date, items) -> NotificationDaySection(date.toString(), notificationDayLabel(date, today), items) }
}

private fun notificationDayLabel(date: LocalDate, today: LocalDate): String = when {
    date == today -> "今天"
    date == today.minusDays(1) -> "昨天"
    date.isAfter(today.minusDays(7)) -> date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.SIMPLIFIED_CHINESE)
    date.year == today.year -> "${date.monthValue} 月 ${date.dayOfMonth} 日"
    else -> "${date.year} 年 ${date.monthValue} 月 ${date.dayOfMonth} 日"
}

internal fun notificationItemKey(alert: AppAlertRecord): String = alert.id
