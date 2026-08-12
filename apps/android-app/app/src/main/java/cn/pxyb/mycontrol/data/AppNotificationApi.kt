package cn.pxyb.mycontrol.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class AppNotificationPage(
    val items: List<AppAlertRecord>,
    val total: Int,
    val unread: Int,
    val nextCursor: String?,
)

data class AppNotificationPreference(
    val enabled: Boolean = true,
    val quietHoursEnabled: Boolean = false,
    val quietStartHour: Int = 22,
    val quietEndHour: Int = 7,
    val timezoneOffsetMinutes: Int = 480,
)

internal fun JSONObject.toAppNotificationPage(): AppNotificationPage = AppNotificationPage(
    items = optJSONArray("items").jsonObjects().mapNotNull { it.toAppAlertRecord() },
    total = optInt("total"),
    unread = optInt("unread"),
    nextCursor = if (has("nextCursor") && !isNull("nextCursor")) optString("nextCursor").takeIf(String::isNotBlank) else null,
)

internal fun JSONObject.toAppAlertRecord(): AppAlertRecord {
    val content = optJSONObject("content") ?: JSONObject()
    val source = optJSONObject("source") ?: JSONObject()
    val blocks = content.optJSONArray("blocks").jsonObjects().mapNotNull { it.toAppNotificationBlock() }
    val actions = optJSONArray("actions").jsonObjects().mapNotNull { it.toAppNotificationAction() }
    val summary = optString("summary", content.optString("summary"))
    return AppAlertRecord(
        id = optString("id"),
        type = optString("category", "system"),
        sourceId = source.optString("entityId").takeUnless { it == "null" }.orEmpty(),
        title = optString("title", "通知").takeUnless { it == "null" }.orEmpty().ifBlank { "通知" },
        body = summary,
        createdAt = optString("createdAt").toEpochMillis(),
        read = has("readAt") && !isNull("readAt") && optString("readAt").isNotBlank(),
        snoozedUntil = if (has("snoozedUntil") && !isNull("snoozedUntil")) {
            optString("snoozedUntil").toEpochMillis().takeIf { it > 0L }
        } else {
            null
        },
        origin = "remote",
        priority = optString("priority", "normal"),
        contentKind = content.optString("kind", "text"),
        contentBlocks = blocks,
        actions = actions,
    )
}

internal fun JSONObject.toAppNotificationPreference(): AppNotificationPreference {
    val quietHours = optJSONObject("quietHours") ?: JSONObject()
    return AppNotificationPreference(
        enabled = optBoolean("enabled", true),
        quietHoursEnabled = quietHours.optBoolean("enabled"),
        quietStartHour = quietHours.optInt("startHour", 22),
        quietEndHour = quietHours.optInt("endHour", 7),
        timezoneOffsetMinutes = optInt("timezoneOffsetMinutes", 480),
    )
}

private fun JSONObject.toAppNotificationBlock(): AppNotificationBlock? {
    val type = optString("type").takeIf(String::isNotBlank) ?: return null
    val items = optJSONArray("items").jsonObjects().mapNotNull { item ->
        val key = item.optString("key", item.optString("label")).trim()
        key.takeIf(String::isNotBlank)?.let { AppNotificationKeyValue(it, item.optString("value")) }
    }
    val listItems = optJSONArray("items").jsonObjects().mapNotNull { item ->
        val title = item.optString("title", item.optString("label")).trim()
        title.takeIf(String::isNotBlank)?.let { AppNotificationListItem(it, item.optString("description")) }
    }
    return AppNotificationBlock(
        type = type,
        text = optString("text"),
        markdown = optString("markdown"),
        items = if (type == "keyValue") items else emptyList(),
        listItems = if (type == "list") listItems else emptyList(),
        url = optString("url"),
        alt = optString("alt"),
        value = if (has("value") && !isNull("value")) optInt("value") else null,
        label = optString("label"),
        fileName = optString("fileName"),
        mediaType = optString("mediaType"),
    )
}

private fun JSONObject.toAppNotificationAction(): AppNotificationAction? {
    val id = optString("id").trim()
    val label = optString("label").trim()
    val deepLink = optString("deepLink").trim()
    return if (id.isBlank() || label.isBlank() || deepLink.isBlank()) null else AppNotificationAction(id, label, deepLink)
}

private fun JSONArray?.jsonObjects(): List<JSONObject> = if (this == null) emptyList() else buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
}

private fun String.toEpochMillis(): Long = takeIf(String::isNotBlank)
    ?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
    ?: 0L
