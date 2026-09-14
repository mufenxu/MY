package cn.pxyb.mycontrol.data

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.UserNotAuthenticatedException
import android.util.Base64
import cn.pxyb.mycontrol.core.network.HttpClientProvider
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

internal class SessionCredentials(
    val cookie: String,
    val refreshToken: String,
    val accessExpiresAtMillis: Long,
    val deviceKeyAlias: String,
) {
    fun encode(): ByteArray = JSONObject().put("cookie", cookie).put("refreshToken", refreshToken)
        .put("accessExpiresAt", accessExpiresAtMillis).put("deviceKeyAlias", deviceKeyAlias)
        .toString().toByteArray(Charsets.UTF_8)

    companion object {
        fun decode(bytes: ByteArray): SessionCredentials {
            val value = JSONObject(String(bytes, Charsets.UTF_8))
            return SessionCredentials(value.getString("cookie"), value.getString("refreshToken"),
                value.getLong("accessExpiresAt"), value.getString("deviceKeyAlias"))
        }
    }
}

internal class SessionRequest(val generation: Long, val username: String?, internal val credentials: SessionCredentials?) {
    internal val cookie get() = credentials?.cookie
    val accountScope = accountStorageScope(username)
}

class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("secure_platform_session", Context.MODE_PRIVATE)
    private val keyAlias = "my_control_session_key_v2"
    private val unlockedKeyAlias = "my_control_session_unlocked_key_v1"

    init {
        synchronized(sessionLock) {
            // Preserve an explicit existing lock choice; old bearer sessions must log in again to bind a device key.
            if (!preferences.contains(KEY_LOCK_ENABLED) && preferences.contains(KEY_STORAGE_VERSION)) {
                preferences.edit().putBoolean(KEY_LOCK_ENABLED,
                    !preferences.getString(KEY_COOKIE, null).isNullOrBlank()).commit()
            }
            if (preferences.getInt(KEY_STORAGE_VERSION, 0) != STORAGE_VERSION) clearSessionData()
        }
    }

    internal fun captureRequestSession(): SessionRequest = synchronized(sessionLock) {
        readCookie()
        SessionRequest(generation, readActiveUsername(), activeCredentials)
    }

    internal fun <T> withRequestSession(
        session: SessionRequest?,
        endedGeneration: Long? = null,
        block: () -> T,
    ): T = synchronized(sessionLock) {
        val endedHere = endedGeneration == generation && readActiveUsername() == null
        if (session != null && !endedHere && (session.generation != generation || session.username != readActiveUsername())) {
            throw CancellationException("账号会话已切换")
        }
        block()
    }

    internal fun clearRequestSession(session: SessionRequest): Long = withRequestSession(session) {
        clear()
        generation
    }

    fun isLocked(): Boolean = synchronized(sessionLock) { isLockEnabled() && activeCredentials == null && hasSession() }

    fun readCookie(): String? = synchronized(sessionLock) {
        if (!hasSession()) return@synchronized null
        if (activeCredentials == null && !isLockEnabled()) unlock()
        activeCredentials?.cookie
    }

    fun unlock(): Boolean = synchronized(sessionLock) {
        if (!hasSession()) return@synchronized false
        try {
            val alias = if (isLockEnabled()) keyAlias else unlockedKeyAlias
            val dek = decrypt(requireNotNull(preferences.getString(KEY_WRAPPED_KEY, null)), existingKey(alias), aad())
            try {
                require(dek.size == 32)
                val plaintext = decrypt(requireNotNull(preferences.getString(KEY_PAYLOAD, null)), SecretKeySpec(dek, "AES"), aad())
                val credentials = try { SessionCredentials.decode(plaintext) } finally { plaintext.fill(0) }
                require(credentials.deviceKeyAlias == preferences.getString(KEY_DEVICE_KEY_ALIAS, null))
                clearMemory()
                activeDataKey = dek.copyOf()
                activeCredentials = credentials
            } finally { dek.fill(0) }
            true
        } catch (error: Exception) {
            if (error is UserNotAuthenticatedException) throw error
            clear()
            false
        }
    }

    fun prepareProtection() {
        val key = getOrCreateKey(keyAlias, userAuthenticationRequired = true)
        runCatching { Cipher.getInstance(TRANSFORMATION).init(Cipher.ENCRYPT_MODE, key) }
            .onFailure { error ->
                if (error !is UserNotAuthenticatedException) {
                    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(keyAlias)
                    getOrCreateKey(keyAlias, userAuthenticationRequired = true)
                }
            }
    }

    fun writeLogin(result: LoginResult) = synchronized(sessionLock) {
        require(result.sessionCookie.isNotBlank() && result.refreshToken.isNotBlank() && result.deviceKeyAlias.isNotBlank())
        require(result.sessionExpiresAtMillis > System.currentTimeMillis())
        val username = result.user.username.trim()
        val credentials = SessionCredentials(result.sessionCookie, result.refreshToken, result.accessExpiresAtMillis, result.deviceKeyAlias)
        val dek = ByteArray(32).also { SecureRandom().nextBytes(it) }
        try {
            val associatedData = aad(username)
            val wrappingAlias = if (isLockEnabled()) keyAlias else unlockedKeyAlias
            val wrappedKey = encrypt(dek, getOrCreateKey(wrappingAlias, isLockEnabled()), associatedData)
            val plaintext = credentials.encode()
            val payload = try { encrypt(plaintext, SecretKeySpec(dek, "AES"), associatedData) } finally { plaintext.fill(0) }
            val previousAlias = preferences.getString(KEY_DEVICE_KEY_ALIAS, null)
            check(preferences.edit()
                .putInt(KEY_STORAGE_VERSION, STORAGE_VERSION)
                .putString(KEY_ACTIVE_USERNAME, username).putString("last_username", username)
                .putLong(KEY_EXPIRES_AT, result.sessionExpiresAtMillis)
                .putLong(KEY_LAST_USED_AT, System.currentTimeMillis())
                .putLong(KEY_IDLE_TIMEOUT, result.sessionIdleMinutes.coerceAtLeast(1) * 60_000L)
                .putString(KEY_WRAPPED_KEY, wrappedKey).putString(KEY_PAYLOAD, payload)
                .putString(KEY_DEVICE_KEY_ALIAS, credentials.deviceKeyAlias)
                .remove(KEY_COOKIE).remove(KEY_PLAIN_COOKIE).remove(KEY_UNLOCKED_COOKIE).commit()) { "无法安全保存登录会话。" }
            clearMemory()
            advanceGeneration()
            activeDataKey = dek.copyOf()
            activeCredentials = credentials
            if (previousAlias != credentials.deviceKeyAlias) DeviceProof.delete(previousAlias)
            WebSessionStore.clear()
        } finally { dek.fill(0) }
    }

    internal fun rotateCredentials(session: SessionRequest, credentials: SessionCredentials) = withRequestSession(session) {
        check(activeCredentials?.refreshToken == session.credentials?.refreshToken) { "登录会话已更新，请重新操作。" }
        require(credentials.deviceKeyAlias == activeCredentials?.deviceKeyAlias)
        val plaintext = credentials.encode()
        val payload = try {
            encrypt(plaintext, SecretKeySpec(requireNotNull(activeDataKey), "AES"), aad())
        } finally { plaintext.fill(0) }
        check(preferences.edit().putString(KEY_PAYLOAD, payload).commit()) { "无法安全保存更新后的会话。" }
        // Rotation keeps the account generation so concurrent requests are not mistaken for an account switch.
        activeCredentials = credentials
    }

    fun readLastUsername(): String = preferences.getString("last_username", "").orEmpty()

    fun writeLastUsername(username: String) {
        preferences.edit().putString("last_username", username.trim()).apply()
    }

    fun readActiveUsername(): String? = preferences.getString(KEY_ACTIVE_USERNAME, null)?.trim()?.takeIf(String::isNotBlank)

    fun readOrCreateDeviceId(): String = synchronized(sessionLock) {
        preferences.getString(KEY_DEVICE_ID, null)?.trim()?.takeIf(String::isNotBlank)?.let { return@synchronized it }
        val deviceId = UUID.randomUUID().toString()
        preferences.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        deviceId
    }

    fun clear(deleteDeviceKey: Boolean = true) = synchronized(sessionLock) {
        if (deleteDeviceKey) DeviceProof.delete(preferences.getString(KEY_DEVICE_KEY_ALIAS, null))
        clearMemory()
        advanceGeneration()
        clearSessionData()
        WebSessionStore.clear()
    }

    private fun clearSessionData() {
        preferences.edit().remove(KEY_COOKIE).remove(KEY_PLAIN_COOKIE).remove(KEY_UNLOCKED_COOKIE)
            .remove(KEY_PAYLOAD).remove(KEY_WRAPPED_KEY).remove(KEY_DEVICE_KEY_ALIAS)
            .remove(KEY_STORAGE_VERSION).remove(KEY_EXPIRES_AT).remove(KEY_LAST_USED_AT)
            .remove(KEY_IDLE_TIMEOUT).remove(KEY_ACTIVE_USERNAME).commit()
    }

    fun lock() = synchronized(sessionLock) {
        clearMemory()
        advanceGeneration()
    }

    private fun clearMemory() {
        activeCredentials = null
        activeDataKey?.fill(0)
        activeDataKey = null
    }

    fun markUsed(now: Long = System.currentTimeMillis()) = synchronized(sessionLock) {
        if (now - preferences.getLong(KEY_LAST_USED_AT, 0L) >= LAST_USED_WRITE_INTERVAL_MS) {
            preferences.edit().putLong(KEY_LAST_USED_AT, now).apply()
        }
    }

    fun hasSession(now: Long = System.currentTimeMillis()): Boolean = synchronized(sessionLock) {
        val payloadPresent = !preferences.getString(KEY_PAYLOAD, null).isNullOrBlank()
        val lastUsedAt = preferences.getLong(KEY_LAST_USED_AT, 0L)
        val idleTimeout = preferences.getLong(KEY_IDLE_TIMEOUT, 0L)
        val valid = preferences.getInt(KEY_STORAGE_VERSION, 0) == STORAGE_VERSION &&
            payloadPresent && !preferences.getString(KEY_WRAPPED_KEY, null).isNullOrBlank() &&
            preferences.getLong(KEY_EXPIRES_AT, 0L) > now &&
            lastUsedAt > 0L && idleTimeout > 0L && lastUsedAt + idleTimeout > now
        if (!valid && payloadPresent) clear()
        valid
    }

    fun isLockEnabled(): Boolean = preferences.getBoolean(KEY_LOCK_ENABLED, true)

    fun setLockEnabled(enabled: Boolean) = synchronized(sessionLock) {
        if (hasSession()) {
            readCookie()
            val dek = requireNotNull(activeDataKey) { "请先解锁当前会话。" }
            val alias = if (enabled) keyAlias else unlockedKeyAlias
            val wrapped = encrypt(dek, getOrCreateKey(alias, enabled), aad())
            check(preferences.edit().putString(KEY_WRAPPED_KEY, wrapped).putBoolean(KEY_LOCK_ENABLED, enabled).commit())
        } else {
            check(preferences.edit().putBoolean(KEY_LOCK_ENABLED, enabled).commit())
        }
    }

    private fun aad(username: String = readActiveUsername().orEmpty()) =
        "my-platform-session:$STORAGE_VERSION:$username".toByteArray(Charsets.UTF_8)

    private fun encrypt(bytes: ByteArray, key: SecretKey, aad: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(aad)
        return Base64.encodeToString(cipher.iv + cipher.doFinal(bytes), Base64.NO_WRAP)
    }

    private fun decrypt(payload: String, key: SecretKey, aad: ByteArray): ByteArray {
        val bytes = Base64.decode(payload, Base64.NO_WRAP)
        require(bytes.size > IV_SIZE + 16)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(0, IV_SIZE)))
        cipher.updateAAD(aad)
        return cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE)
    }

    private fun existingKey(alias: String): SecretKey =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias, null) as SecretKey

    private fun getOrCreateKey(alias: String, userAuthenticationRequired: Boolean): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).setUserAuthenticationRequired(userAuthenticationRequired)
            if (userAuthenticationRequired) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    builder.setUserAuthenticationParameters(AUTH_VALIDITY_SECONDS,
                        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL)
                } else {
                    @Suppress("DEPRECATION")
                    builder.setUserAuthenticationValidityDurationSeconds(AUTH_VALIDITY_SECONDS)
                }
            }
            init(builder.build())
            generateKey()
        }
    }

    private fun advanceGeneration() {
        generation += 1
        val dispatcher = HttpClientProvider.client.dispatcher
        (dispatcher.queuedCalls() + dispatcher.runningCalls()).forEach { call ->
            if (call.request().tag(SessionRequest::class.java) != null) call.cancel()
        }
    }

    private companion object {
        val sessionLock = Any()
        @Volatile var generation = 0L
        var activeCredentials: SessionCredentials? = null
        var activeDataKey: ByteArray? = null
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
        const val STORAGE_VERSION = 4
        const val AUTH_VALIDITY_SECONDS = 15
        const val LAST_USED_WRITE_INTERVAL_MS = 60_000L
        const val KEY_COOKIE = "cookie"
        const val KEY_PLAIN_COOKIE = "plain_cookie"
        const val KEY_UNLOCKED_COOKIE = "unlocked_cookie"
        const val KEY_PAYLOAD = "credentials"
        const val KEY_WRAPPED_KEY = "wrapped_key"
        const val KEY_DEVICE_KEY_ALIAS = "device_key_alias"
        const val KEY_LOCK_ENABLED = "lock_enabled"
        const val KEY_STORAGE_VERSION = "storage_version"
        const val KEY_EXPIRES_AT = "expires_at"
        const val KEY_LAST_USED_AT = "last_used_at"
        const val KEY_IDLE_TIMEOUT = "idle_timeout"
        const val KEY_ACTIVE_USERNAME = "active_username"
        const val KEY_DEVICE_ID = "device_id"
    }
}
