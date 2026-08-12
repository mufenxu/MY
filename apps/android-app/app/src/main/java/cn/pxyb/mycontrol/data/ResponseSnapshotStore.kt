package cn.pxyb.mycontrol.data

import android.content.Context
import android.util.Base64

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

    fun read(path: String): ResponseSnapshot? {
        val key = scopedPathKey(path) ?: return null
        val body = codec.read("${key}_body")?.takeIf(String::isNotBlank) ?: return null
        val savedAt = preferences.getLong("${key}_saved_at", 0L).takeIf { it > 0L } ?: return null
        return ResponseSnapshot(body = body, savedAtMillis = savedAt)
    }

    fun write(path: String, body: String, savedAtMillis: Long = System.currentTimeMillis()) {
        if (body.isBlank()) return
        val key = scopedPathKey(path) ?: return
        codec.write("${key}_body", body)
        preferences.edit().putLong("${key}_saved_at", savedAtMillis).apply()
    }

    fun clear() {
        val scope = accountScope ?: return
        val prefix = "account_${scope}_"
        preferences.edit().apply {
            preferences.all.keys.filter { it.startsWith(prefix) }.forEach(::remove)
        }.apply()
    }

    private fun scopedPathKey(path: String): String? = accountScope?.let { scope ->
        "account_${scope}_" + Base64.encodeToString(
        path.toByteArray(Charsets.UTF_8),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
    }

    private companion object {
        const val PREFERENCES_NAME = "operational_response_snapshots"
        const val KEY_ALIAS = "my_control_response_snapshots_v1"
    }
}
