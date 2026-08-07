package cn.pxyb.mycontrol.data

import android.content.Context
import android.util.Base64

data class ResponseSnapshot(
    val body: String,
    val savedAtMillis: Long,
)

class ResponseSnapshotStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(path: String): ResponseSnapshot? {
        val key = pathKey(path)
        val body = preferences.getString("${key}_body", null)?.takeIf(String::isNotBlank) ?: return null
        val savedAt = preferences.getLong("${key}_saved_at", 0L).takeIf { it > 0L } ?: return null
        return ResponseSnapshot(body = body, savedAtMillis = savedAt)
    }

    fun write(path: String, body: String, savedAtMillis: Long = System.currentTimeMillis()) {
        if (body.isBlank()) return
        val key = pathKey(path)
        preferences.edit()
            .putString("${key}_body", body)
            .putLong("${key}_saved_at", savedAtMillis)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun pathKey(path: String): String = Base64.encodeToString(
        path.toByteArray(Charsets.UTF_8),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )

    private companion object {
        const val PREFERENCES_NAME = "operational_response_snapshots"
    }
}
