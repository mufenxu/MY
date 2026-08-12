package cn.pxyb.mycontrol.data

import java.security.MessageDigest

internal fun accountStorageScope(username: String?): String? {
    val normalized = username?.trim()?.lowercase()?.takeIf(String::isNotEmpty) ?: return null
    val digest = MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(Charsets.UTF_8))
    return digest.take(16).joinToString(separator = "") { byte -> "%02x".format(byte) }
}

internal fun scopedStorageKey(username: String?, key: String): String? =
    accountStorageScope(username)?.let { scope -> "account_${scope}_$key" }
