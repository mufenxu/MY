package cn.pxyb.mycontrol.data

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

data class AppNotificationKeyValue(val key: String, val value: String)

data class AppNotificationListItem(val title: String, val description: String = "")

data class AppNotificationAction(
    val id: String,
    val label: String,
    val deepLink: String,
)

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
    return (existing.filterNot { it.origin == "remote" } + reconciledRemote)
    .distinctBy(AppAlertRecord::id)
    .sortedByDescending(AppAlertRecord::createdAt)
    .take(200)
}
