package cn.pxyb.mycontrol.data

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class AuthenticatorStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun prepareProtection() { getOrCreateKey() }

    fun read(): List<AuthenticatorEntry> {
        // The hardware authentication gate also applies to an empty store and to legacy-key migration.
        Cipher.getInstance(TRANSFORMATION).init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val protectedPayload = preferences.getString(KEY_PROTECTED_PAYLOAD, null)
        val legacy = protectedPayload == null
        val payload = protectedPayload ?: preferences.getString(KEY_PAYLOAD, null) ?: return emptyList()
        val root = JSONObject(decrypt(payload, if (legacy) LEGACY_KEY_ALIAS else KEY_ALIAS))
        if (root.optInt(KEY_VERSION, 0) != if (legacy) 1 else STORAGE_VERSION) {
            throw StorageException()
        }
        val entries = root.optJSONArray(KEY_ENTRIES) ?: return emptyList()
        val result = buildList {
            for (index in 0 until entries.length()) {
                entries.optJSONObject(index)?.let { entry ->
                    add(
                        AuthenticatorEntry(
                            id = entry.getString("id"),
                            issuer = entry.getString("issuer"),
                            account = entry.getString("account"),
                            secret = Base64.decode(entry.getString("secret"), Base64.NO_WRAP),
                            algorithm = entry.getString("algorithm"),
                            digits = entry.getInt("digits"),
                            periodSeconds = entry.getInt("periodSeconds"),
                        ),
                    )
                }
            }
        }
        if (legacy) write(result)
        return result
    }

    fun write(entries: List<AuthenticatorEntry>) {
        val root = JSONObject().apply {
            put(KEY_VERSION, STORAGE_VERSION)
            put(
                KEY_ENTRIES,
                JSONArray().apply {
                    entries.forEach { entry ->
                        put(
                            JSONObject().apply {
                                put("id", entry.id)
                                put("issuer", entry.issuer)
                                put("account", entry.account)
                                put("secret", Base64.encodeToString(entry.secret, Base64.NO_WRAP))
                                put("algorithm", entry.algorithm)
                                put("digits", entry.digits)
                                put("periodSeconds", entry.periodSeconds)
                            },
                        )
                    }
                },
            )
        }
        val committed = preferences.edit()
            .putString(KEY_PROTECTED_PAYLOAD, encrypt(root.toString()))
            .remove(KEY_PAYLOAD)
            .commit()
        if (!committed) throw StorageException()
        // Never delete the old key before the authenticated replacement has been durably stored.
        runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(LEGACY_KEY_ALIAS) }
    }

    fun clear() {
        Cipher.getInstance(TRANSFORMATION).init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        if (!preferences.edit().remove(KEY_PAYLOAD).remove(KEY_PROTECTED_PAYLOAD).commit()) throw StorageException()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(KEY_ALIAS.toByteArray(StandardCharsets.UTF_8))
        val encrypted = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(payload: String, alias: String): String {
        val bytes = Base64.decode(payload, Base64.NO_WRAP)
        require(bytes.size > IV_SIZE)
        val iv = bytes.copyOfRange(0, IV_SIZE)
        val encrypted = bytes.copyOfRange(IV_SIZE, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val key = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias, null) as SecretKey
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        if (alias == KEY_ALIAS) cipher.updateAAD(KEY_ALIAS.toByteArray(StandardCharsets.UTF_8))
        return String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            val builder = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(30,
                    KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL)
            } else {
                @Suppress("DEPRECATION")
                builder.setUserAuthenticationValidityDurationSeconds(30)
            }
            init(builder.build())
            generateKey()
        }
    }

    class StorageException : Exception("无法安全读写本地验证器数据，请解锁后重试。")

    private companion object {
        const val PREFERENCES_NAME = "secure_authenticator_store"
        const val KEY_PAYLOAD = "payload"
        const val KEY_PROTECTED_PAYLOAD = "authenticated_payload"
        const val KEY_VERSION = "version"
        const val KEY_ENTRIES = "entries"
        const val STORAGE_VERSION = 2
        const val KEY_ALIAS = "my_control_authenticator_key_v2"
        const val LEGACY_KEY_ALIAS = "my_control_authenticator_key_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
    }
}
