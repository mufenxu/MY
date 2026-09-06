package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

import android.content.Context
import cn.pxyb.mycontrol.core.security.EncryptedPreferenceCodec
import android.util.Base64

@Immutable
data class ResponseSnapshot(
    val body: String,
    val savedAtMillis: Long,
)

class ResponseSnapshotStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val codec = EncryptedPreferenceCodec(preferences, KEY_ALIAS)
    @Volatile private var accountScope: String? = null

    fun setAccount(username: String?) {
        accountScope = accountStorageScope(username)
    }

    fun read(path: String, scope: String? = accountScope): ResponseSnapshot? {
        val key = scopedPathKey(path, scope) ?: return null
        val savedAt = preferences.getLong("${key}_saved_at", 0L)
        if (!isSnapshotFresh(savedAt, System.currentTimeMillis())) {
            preferences.edit().remove("${key}_body").remove("${key}_saved_at").apply()
            return null
        }
        val body = codec.read("${key}_body")?.takeIf(String::isNotBlank) ?: return null
        return ResponseSnapshot(body = body, savedAtMillis = savedAt)
    }

    fun write(path: String, body: String, savedAtMillis: Long = System.currentTimeMillis(), scope: String? = accountScope) {
        if (body.isBlank()) return
        val key = scopedPathKey(path, scope) ?: return
        codec.write("${key}_body", body)
        preferences.edit().putLong("${key}_saved_at", savedAtMillis).apply()
        evictExpiredSnapshots(scope)
    }

    fun sizeInBytes(): Long {
        val scope = accountScope ?: return 0L
        val prefix = "account_${scope}_"
        return preferences.all.entries
            .filter { it.key.startsWith(prefix) }
            .sumOf { (_, value) ->
                when (value) {
                    is String -> value.toByteArray(Charsets.UTF_8).size.toLong()
                    is Long -> 8L
                    is Int -> 4L
                    else -> 16L
                }
            }
    }

    fun clear(scope: String? = accountScope) {
        if (scope == null) return
        val prefix = "account_${scope}_"
        preferences.edit().apply {
            preferences.all.keys.filter { it.startsWith(prefix) }.forEach(::remove)
        }.apply()
    }

    private fun scopedPathKey(path: String, scope: String?): String? = scope?.let {
        "account_${scope}_" + Base64.encodeToString(
        path.toByteArray(Charsets.UTF_8),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
    }

    private fun evictExpiredSnapshots(scope: String?) {
        if (scope == null) return
        val now = System.currentTimeMillis()
        val expiredKeys = preferences.all.entries
            .filter { (key, _) -> key.startsWith("account_${scope}_") && key.endsWith("_saved_at") }
            .filter { (_, value) ->
                val savedAt = (value as? Long) ?: return@filter false
                !isSnapshotFresh(savedAt, now)
            }
            .map { (key, _) -> key.removeSuffix("_saved_at") }
        if (expiredKeys.isEmpty()) return
        preferences.edit().apply {
            expiredKeys.forEach { key ->
                remove("${key}_body")
                remove("${key}_saved_at")
            }
        }.apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "operational_response_snapshots"
        const val KEY_ALIAS = "my_control_response_snapshots_v1"
    }
}

internal fun isSnapshotFresh(savedAtMillis: Long, nowMillis: Long): Boolean =
    savedAtMillis > 0L && savedAtMillis <= nowMillis && nowMillis - savedAtMillis < 7L * 24 * 60 * 60 * 1000
