package cn.pxyb.mycontrol.data

import android.content.Context
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

    fun read(): List<AuthenticatorEntry> {
        val payload = preferences.getString(KEY_PAYLOAD, null) ?: return emptyList()
        val root = runCatching { JSONObject(decrypt(payload)) }
            .getOrElse { throw StorageException() }
        if (root.optInt(KEY_VERSION, 0) != STORAGE_VERSION) {
            throw StorageException()
        }
        val entries = root.optJSONArray(KEY_ENTRIES) ?: return emptyList()
        return buildList {
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
            .putString(KEY_PAYLOAD, encrypt(root.toString()))
            .commit()
        if (!committed) throw StorageException()
    }

    fun clear() {
        if (!preferences.edit().remove(KEY_PAYLOAD).commit()) throw StorageException()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(payload: String): String {
        val bytes = Base64.decode(payload, Base64.NO_WRAP)
        require(bytes.size > IV_SIZE)
        val iv = bytes.copyOfRange(0, IV_SIZE)
        val encrypted = bytes.copyOfRange(IV_SIZE, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    class StorageException : Exception("本地验证器数据读取失败，请重新添加。")

    private companion object {
        const val PREFERENCES_NAME = "secure_authenticator_store"
        const val KEY_PAYLOAD = "payload"
        const val KEY_VERSION = "version"
        const val KEY_ENTRIES = "entries"
        const val STORAGE_VERSION = 1
        const val KEY_ALIAS = "my_control_authenticator_key_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
    }
}
