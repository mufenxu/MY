package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

@Immutable
data class AppNotificationBlock(
    val type: String,
    val text: String = "",
    val markdown: String = "",
    val items: List<AppNotificationKeyValue> = emptyList(),
    val listItems: List<AppNotificationListItem> = emptyList(),
    val url: String = "",
    val alt: String = "",
    val value: Int? = null,
    val label: String = "",
    val fileName: String = "",
    val mediaType: String = "",
)

@Immutable
data class AppNotificationKeyValue(val key: String, val value: String)

@Immutable
data class AppNotificationListItem(val title: String, val description: String = "")

@Immutable
data class AppNotificationAction(
    val id: String,
    val label: String,
    val deepLink: String,
)

internal fun mergeHydratedAlerts(
    stored: List<AppAlertRecord>,
    current: List<AppAlertRecord>,
): List<AppAlertRecord> {
    val currentRemote = current.filter { it.origin == "remote" }
    val remote = currentRemote.ifEmpty { stored.filter { it.origin == "remote" } }
    val rawList = (current.filterNot { it.origin == "remote" } + stored.filterNot { it.origin == "remote" } + remote)
        .distinctBy(AppAlertRecord::id)
        .sortedByDescending(AppAlertRecord::createdAt)
        .take(200)
    return groupDuplicateAlerts(rawList)
}

internal fun mergeRemoteAlerts(
    existing: List<AppAlertRecord>,
    remote: List<AppAlertRecord>,
): List<AppAlertRecord> {
    val existingById = existing.associateBy(AppAlertRecord::id)
    val reconciledRemote = remote.map { current ->
        val local = existingById[current.id]
        current.copy(
            read = current.read || local?.read == true,
            snoozedUntil = current.snoozedUntil ?: local?.snoozedUntil,
        )
    }
    val rawList = (existing.filterNot { it.origin == "remote" } + reconciledRemote)
        .distinctBy(AppAlertRecord::id)
        .sortedByDescending(AppAlertRecord::createdAt)
        .take(200)
    return groupDuplicateAlerts(rawList)
}

/**
 * 智能告警频控与重复合并算法
 * 对短时间内相同 sourceId/title 的告警进行频控去重与记录合并。
 */
internal fun groupDuplicateAlerts(
    alerts: List<AppAlertRecord>,
    windowMs: Long = 5 * 60_000L,
): List<AppAlertRecord> {
    if (alerts.size <= 1) return alerts

    val result = mutableListOf<AppAlertRecord>()
    val grouped = alerts.groupBy { "${it.sourceId}_${it.title}" }

    for ((_, records) in grouped) {
        if (records.size <= 1) {
            result.addAll(records)
            continue
        }

        val sorted = records.sortedByDescending { it.createdAt }
        val latest = sorted.first()
        val oldestTime = sorted.last().createdAt

        if (latest.createdAt - oldestTime <= windowMs) {
            val aggregatedBody = "【连续告警 ${records.size} 次】${latest.body}"
            val extraBlock = AppNotificationBlock(
                type = "list",
                listItems = sorted.map { item ->
                    AppNotificationListItem(
                        title = "触发事件 (${item.id.takeLast(6)})",
                        description = item.body.ifBlank { "无详细描述" }
                    )
                }
            )

            result.add(
                latest.copy(
                    body = aggregatedBody,
                    contentBlocks = latest.contentBlocks + extraBlock
                )
            )
        } else {
            result.addAll(sorted)
        }
    }

    return result.sortedByDescending { it.createdAt }
}
