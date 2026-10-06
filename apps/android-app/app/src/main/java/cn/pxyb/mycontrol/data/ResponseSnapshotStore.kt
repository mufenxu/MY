package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

import android.content.Context
import android.os.SystemClock
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
    private var lastCleanupElapsedMs = 0L

    fun setAccount(username: String?) {
        accountScope = accountStorageScope(username)
    }

    fun read(path: String, scope: String? = accountScope): ResponseSnapshot? = synchronized(cacheLock) {
        val key = scopedPathKey(path, scope) ?: return null
        val savedAt = preferences.getLong("${key}_saved_at", 0L)
        if (!isSnapshotFresh(savedAt, System.currentTimeMillis(), snapshotTtlMillis(path))) {
            preferences.edit().remove("${key}_body").remove("${key}_saved_at").apply()
            return null
        }
        val body = codec.read("${key}_body")?.takeIf(String::isNotBlank) ?: return null
        return ResponseSnapshot(body = body, savedAtMillis = savedAt)
    }

    fun write(path: String, body: String, savedAtMillis: Long = System.currentTimeMillis(), scope: String? = accountScope): Unit = synchronized(cacheLock) {
        if (body.isBlank()) return
        val key = scopedPathKey(path, scope) ?: return
        if (body.toByteArray(Charsets.UTF_8).size > MAX_ENTRY_BYTES) {
            preferences.edit().remove("${key}_body").remove("${key}_saved_at").apply()
            return
        }
        val previousSize = preferences.getString("${key}_body", null)?.length ?: 0
        codec.write("${key}_body", body)
        preferences.edit().putLong("${key}_saved_at", savedAtMillis).apply()
        val newSize = preferences.getString("${key}_body", null)?.length ?: 0
        val elapsed = SystemClock.elapsedRealtime()
        // 只有新增、增大或到达清理周期时扫描；缩小和等长刷新不会突破容量上限。
        if (newSize > previousSize || elapsed - lastCleanupElapsedMs >= CLEANUP_INTERVAL_MS) {
            evictExpiredSnapshots(scope)
            lastCleanupElapsedMs = elapsed
        }
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

    fun clear(scope: String? = accountScope): Unit = synchronized(cacheLock) {
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
        val prefix = "account_${scope}_"
        val entries = preferences.all
        val retained = entries.keys.filter { it.startsWith(prefix) && it.endsWith("_body") }
            .map { it.removeSuffix("_body") }.sortedBy { entries["${it}_saved_at"] as? Long ?: 0L }.toMutableList()
        val expiredKeys = retained.filter { key ->
            val path = runCatching {
                String(Base64.decode(key.removePrefix(prefix), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8)
            }.getOrDefault("")
            !isSnapshotFresh(entries["${key}_saved_at"] as? Long ?: 0L, now, snapshotTtlMillis(path))
        }.toMutableSet()
        retained.removeAll(expiredKeys)
        fun entryBytes(key: String) = (entries["${key}_body"] as? String)?.toByteArray(Charsets.UTF_8)?.size?.toLong() ?: 0L
        var bytes = retained.sumOf(::entryBytes)
        while (retained.size > MAX_ENTRIES || bytes > MAX_CACHE_BYTES) {
            val oldest = retained.removeAt(0)
            bytes -= entryBytes(oldest)
            expiredKeys += oldest
        }
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
        const val MAX_ENTRY_BYTES = 512 * 1024
        const val MAX_CACHE_BYTES = 8L * 1024 * 1024
        const val MAX_ENTRIES = 128
        const val CLEANUP_INTERVAL_MS = 5 * 60_000L
        val cacheLock = Any()
    }
}

internal fun snapshotTtlMillis(path: String): Long = when {
    path.startsWith(CAMPUS_LIBRARY_SEAT_TIMELINE_PATH) || path.startsWith(CAMPUS_LIBRARY_SEAT_SEATS_PATH) ||
        path.startsWith(CAMPUS_LIBRARY_SEAT_AREAS_PATH) || path.startsWith(CAMPUS_LIBRARY_SEAT_CURRENT_USE_PATH) -> 60_000L
    path == CAMPUS_TIMETABLE_PATH || path == "/apps/core/api/todos" ||
        path.startsWith(CAMPUS_LIBRARY_SEAT_RESERVATIONS_HISTORY_PATH) -> 7L * 24 * 60 * 60_000
    path.startsWith("/api/operations/") || path.startsWith("/api/incidents") || path.startsWith("/api/tasks") ||
        path.startsWith("/apps/iot/api/status") || path.startsWith("/apps/iot/api/devices") ||
        path.startsWith(CAMPUS_LIBRARY_SEAT_RESERVATIONS_PATH) || path.startsWith(CAMPUS_LIBRARY_SEAT_WAITLISTS_PATH) -> 5 * 60_000L
    else -> 24L * 60 * 60_000
}

internal fun isSnapshotFresh(savedAtMillis: Long, nowMillis: Long, ttlMillis: Long = 7L * 24 * 60 * 60 * 1000): Boolean =
    savedAtMillis > 0L && savedAtMillis <= nowMillis && nowMillis - savedAtMillis < ttlMillis
