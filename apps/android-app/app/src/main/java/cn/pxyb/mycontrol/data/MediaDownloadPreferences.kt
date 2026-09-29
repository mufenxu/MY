package cn.pxyb.mycontrol.data

import android.content.Context
import androidx.compose.runtime.Immutable
import org.json.JSONArray
import org.json.JSONObject

@Immutable
data class MediaDownloadHistoryEntry(
    val title: String,
    val platform: String,
    val shareText: String,
    val parsedAtMillis: Long,
)

internal const val MEDIA_DOWNLOAD_HISTORY_LIMIT = 12

internal fun encodeMediaDownloadHistory(entries: List<MediaDownloadHistoryEntry>): String {
    val array = JSONArray()
    entries.forEach { entry ->
        array.put(
            JSONObject()
                .put("title", entry.title)
                .put("platform", entry.platform)
                .put("shareText", entry.shareText)
                .put("parsedAt", entry.parsedAtMillis),
        )
    }
    return array.toString()
}

internal fun decodeMediaDownloadHistory(raw: String?): List<MediaDownloadHistoryEntry> {
    if (raw.isNullOrBlank()) return emptyList()
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val shareText = item.optString("shareText", "")
        if (shareText.isBlank()) return@mapNotNull null
        MediaDownloadHistoryEntry(
            title = item.optString("title", ""),
            platform = item.optString("platform", ""),
            shareText = shareText,
            parsedAtMillis = item.optLong("parsedAt", 0L),
        )
    }
}

// 同一链接只保留最近一次解析，新记录排在最前，超出上限的旧记录直接丢弃。
internal fun mergeMediaDownloadHistory(
    entries: List<MediaDownloadHistoryEntry>,
    entry: MediaDownloadHistoryEntry,
    limit: Int = MEDIA_DOWNLOAD_HISTORY_LIMIT,
): List<MediaDownloadHistoryEntry> =
    (listOf(entry) + entries.filterNot { it.shareText == entry.shareText }).take(limit)

// 解析历史按账号隔离；自动粘贴开关是设备级偏好，切换账号不重置。
class MediaDownloadPreferences(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun autoPasteEnabled(): Boolean = preferences.getBoolean(KEY_AUTO_PASTE, true)

    fun setAutoPasteEnabled(enabled: Boolean) {
        preferences.edit().putBoolean(KEY_AUTO_PASTE, enabled).apply()
    }

    fun history(username: String?): List<MediaDownloadHistoryEntry> {
        val key = scopedStorageKey(username, KEY_HISTORY) ?: return emptyList()
        return decodeMediaDownloadHistory(preferences.getString(key, null))
    }

    fun record(username: String?, entry: MediaDownloadHistoryEntry): List<MediaDownloadHistoryEntry> {
        val key = scopedStorageKey(username, KEY_HISTORY) ?: return emptyList()
        val merged = mergeMediaDownloadHistory(history(username), entry)
        preferences.edit().putString(key, encodeMediaDownloadHistory(merged)).apply()
        return merged
    }

    fun clearHistory(username: String?) {
        val key = scopedStorageKey(username, KEY_HISTORY) ?: return
        preferences.edit().remove(key).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "media_download_preferences"
        const val KEY_AUTO_PASTE = "auto_paste_enabled"
        const val KEY_HISTORY = "parse_history"
    }
}