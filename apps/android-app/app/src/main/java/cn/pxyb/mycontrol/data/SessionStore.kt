package cn.pxyb.mycontrol.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.UserNotAuthenticatedException
import android.util.Base64
import android.os.Build
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("secure_platform_session", Context.MODE_PRIVATE)
    private val keyAlias = "my_control_session_key_v2"
    private val unlockedKeyAlias = "my_control_session_unlocked_key_v1"
    @Volatile private var activeCookie: String? = null

    init {
        val storedVersion = preferences.getInt(KEY_STORAGE_VERSION, 0)
        if (storedVersion == LEGACY_STORAGE_VERSION) {
            migrateLegacyUnlockedCookie()
        } else if (preferences.contains(KEY_COOKIE) && storedVersion != STORAGE_VERSION) {
            clearSessionData()
        }
    }

    fun readCookie(): String? {
        if (!hasSession()) return null
        activeCookie?.let { return it }
        if (!isLockEnabled()) {
            return decryptStoredCookie(KEY_UNLOCKED_COOKIE, unlockedKeyAlias)?.also { activeCookie = it }
        }
        return null
    }

    fun unlock(): Boolean {
        if (!hasSession()) return false
        if (!isLockEnabled()) {
            val cookie = decryptStoredCookie(KEY_UNLOCKED_COOKIE, unlockedKeyAlias)
            if (!cookie.isNullOrBlank()) {
                activeCookie = cookie
                return true
            }
        }
        return runCatching {
            activeCookie = requireNotNull(decryptStoredCookie(KEY_COOKIE, keyAlias))
            true
        }.getOrElse { error ->
            if (error is UserNotAuthenticatedException) throw error
            deleteKey()
            clear()
            false
        }
    }

    fun prepareProtection() {
        val key = getOrCreateKey(keyAlias, userAuthenticationRequired = true)
        runCatching {
            Cipher.getInstance(TRANSFORMATION).init(Cipher.ENCRYPT_MODE, key)
        }.onFailure { error ->
            if (error !is UserNotAuthenticatedException) {
                deleteKey()
                getOrCreateKey(keyAlias, userAuthenticationRequired = true)
            }
        }
    }

    fun writeCookie(cookie: String, expiresAtMillis: Long, idleTimeoutMinutes: Int) {
        require(cookie.isNotBlank())
        require(expiresAtMillis > System.currentTimeMillis())
        val now = System.currentTimeMillis()
        val edit = preferences.edit()
            .putInt(KEY_STORAGE_VERSION, STORAGE_VERSION)
            .putString(KEY_COOKIE, encryptCookie(cookie, keyAlias, userAuthenticationRequired = true))
            .putLong(KEY_EXPIRES_AT, expiresAtMillis)
            .putLong(KEY_LAST_USED_AT, now)
            .putLong(KEY_IDLE_TIMEOUT, idleTimeoutMinutes.coerceAtLeast(1) * 60_000L)
        if (!isLockEnabled()) {
            edit.putString(
                KEY_UNLOCKED_COOKIE,
                encryptCookie(cookie, unlockedKeyAlias, userAuthenticationRequired = false),
            )
        }
        edit.remove(KEY_PLAIN_COOKIE)
        edit.apply()
        activeCookie = cookie
    }

    fun readLastUsername(): String = preferences.getString("last_username", "").orEmpty()

    fun writeLastUsername(username: String) {
        preferences.edit().putString("last_username", username.trim()).apply()
    }

    fun clear() {
        activeCookie = null
        clearSessionData()
    }

    private fun clearSessionData() {
        preferences.edit()
            .remove(KEY_COOKIE)
            .remove(KEY_PLAIN_COOKIE)
            .remove(KEY_UNLOCKED_COOKIE)
            .remove(KEY_STORAGE_VERSION)
            .remove(KEY_EXPIRES_AT)
            .remove(KEY_LAST_USED_AT)
            .remove(KEY_IDLE_TIMEOUT)
            .apply()
    }

    fun lock() {
        activeCookie = null
    }

    fun markUsed(now: Long = System.currentTimeMillis()) {
        if (now - preferences.getLong(KEY_LAST_USED_AT, 0L) >= LAST_USED_WRITE_INTERVAL_MS) {
            preferences.edit().putLong(KEY_LAST_USED_AT, now).apply()
        }
    }

    fun hasSession(now: Long = System.currentTimeMillis()): Boolean {
        val validStorage = preferences.getInt(KEY_STORAGE_VERSION, 0) == STORAGE_VERSION
        val payloadPresent = !preferences.getString(KEY_COOKIE, null).isNullOrBlank()
        val unlockedPayloadPresent = !preferences.getString(KEY_UNLOCKED_COOKIE, null).isNullOrBlank()
        val expiresAt = preferences.getLong(KEY_EXPIRES_AT, 0L)
        val lastUsedAt = preferences.getLong(KEY_LAST_USED_AT, 0L)
        val idleTimeout = preferences.getLong(KEY_IDLE_TIMEOUT, 0L)
        val metadataValid = validStorage && expiresAt > now && lastUsedAt > 0L && idleTimeout > 0L
            && lastUsedAt + idleTimeout > now
        val sessionPresent = metadataValid && if (isLockEnabled()) payloadPresent else unlockedPayloadPresent
        if (!sessionPresent && (payloadPresent || unlockedPayloadPresent)) clear()
        return sessionPresent
    }

    fun isLockEnabled(): Boolean = preferences.getBoolean(KEY_LOCK_ENABLED, true)

    fun setLockEnabled(enabled: Boolean) {
        val cookie = if (enabled) null else activeCookie ?: readCookie()
        preferences.edit()
            .putBoolean(KEY_LOCK_ENABLED, enabled)
            .apply()
        if (enabled) {
            preferences.edit().remove(KEY_UNLOCKED_COOKIE).remove(KEY_PLAIN_COOKIE).apply()
        } else if (!cookie.isNullOrBlank()) {
            preferences.edit()
                .putString(
                    KEY_UNLOCKED_COOKIE,
                    encryptCookie(cookie, unlockedKeyAlias, userAuthenticationRequired = false),
                )
                .remove(KEY_PLAIN_COOKIE)
                .apply()
        }
    }

    private fun encryptCookie(cookie: String, alias: String, userAuthenticationRequired: Boolean): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(alias, userAuthenticationRequired))
        val encrypted = cipher.doFinal(cookie.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    }

    private fun decryptStoredCookie(preferenceKey: String, alias: String): String? {
        val payload = preferences.getString(preferenceKey, null) ?: return null
        val bytes = Base64.decode(payload, Base64.NO_WRAP)
        require(bytes.size > IV_SIZE)
        val iv = bytes.copyOfRange(0, IV_SIZE)
        val encrypted = bytes.copyOfRange(IV_SIZE, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(alias, userAuthenticationRequired = alias == keyAlias),
            GCMParameterSpec(128, iv),
        )
        return String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
    }

    private fun migrateLegacyUnlockedCookie() {
        val plainCookie = preferences.getString(KEY_PLAIN_COOKIE, null)
        val edit = preferences.edit().putInt(KEY_STORAGE_VERSION, STORAGE_VERSION)
        if (!plainCookie.isNullOrBlank() && !isLockEnabled()) {
            runCatching {
                encryptCookie(plainCookie, unlockedKeyAlias, userAuthenticationRequired = false)
            }.onSuccess { edit.putString(KEY_UNLOCKED_COOKIE, it) }
        }
        edit.remove(KEY_PLAIN_COOKIE).apply()
    }

    private fun getOrCreateKey(alias: String, userAuthenticationRequired: Boolean): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            val builder = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(userAuthenticationRequired)
            if (userAuthenticationRequired) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    builder.setUserAuthenticationParameters(
                        AUTH_VALIDITY_SECONDS,
                        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
                    )
                } else {
                    @Suppress("DEPRECATION")
                    builder.setUserAuthenticationValidityDurationSeconds(AUTH_VALIDITY_SECONDS)
                }
            }
            init(builder.build())
            generateKey()
        }
    }

    private fun deleteKey() {
        runCatching {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(keyAlias)
        }
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
        const val LEGACY_STORAGE_VERSION = 2
        const val STORAGE_VERSION = 3
        const val AUTH_VALIDITY_SECONDS = 15
        const val LAST_USED_WRITE_INTERVAL_MS = 60_000L
        const val KEY_COOKIE = "cookie"
        const val KEY_PLAIN_COOKIE = "plain_cookie"
        const val KEY_UNLOCKED_COOKIE = "unlocked_cookie"
        const val KEY_LOCK_ENABLED = "lock_enabled"
        const val KEY_STORAGE_VERSION = "storage_version"
        const val KEY_EXPIRES_AT = "expires_at"
        const val KEY_LAST_USED_AT = "last_used_at"
        const val KEY_IDLE_TIMEOUT = "idle_timeout"
    }
}
