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

class GoogleAccountStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): List<GoogleAccountRecord> {
        val payload = preferences.getString(KEY_PAYLOAD, null) ?: return emptyList()
        val root = JSONObject(decrypt(payload))
        return root.optJSONArray(KEY_ACCOUNTS).toGoogleAccounts()
    }

    fun write(accounts: List<GoogleAccountRecord>) {
        val root = JSONObject().apply {
            put(KEY_VERSION, STORAGE_VERSION)
            put(KEY_ACCOUNTS, JSONArray().apply { accounts.forEach { put(it.toJson()) } })
        }
        preferences.edit()
            .putString(KEY_PAYLOAD, encrypt(root.toString()))
            .apply()
    }

    fun clear() {
        preferences.edit().remove(KEY_PAYLOAD).apply()
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

    private companion object {
        const val PREFERENCES_NAME = "secure_google_account_ledger"
        const val KEY_PAYLOAD = "payload"
        const val KEY_VERSION = "version"
        const val KEY_ACCOUNTS = "accounts"
        const val STORAGE_VERSION = 1
        const val KEY_ALIAS = "my_control_google_accounts_key_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
    }
}

private fun GoogleAccountRecord.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("primaryEmail", primaryEmail)
    put("displayName", displayName)
    put("emailStatus", emailStatus)
    put("note", note)
    putNullable("lastCheckedAt", lastCheckedAt)
    put("aliases", JSONArray().apply { aliases.forEach { put(it.toJson()) } })
}

private fun GoogleAliasRecord.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("address", address)
    put("aliasType", aliasType)
    put("aliasStatus", aliasStatus)
    put("openAiStatus", openAiStatus)
    putNullable("registeredAt", registeredAt)
    putNullable("lastVerifiedAt", lastVerifiedAt)
    put("note", note)
}

private fun JSONArray?.toGoogleAccounts(): List<GoogleAccountRecord> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optJSONObject(index)?.let { add(it.toGoogleAccount()) }
        }
    }
}

private fun JSONObject.toGoogleAccount(): GoogleAccountRecord = GoogleAccountRecord(
    id = optString("id"),
    primaryEmail = optString("primaryEmail"),
    displayName = optString("displayName"),
    emailStatus = optString("emailStatus", "unknown"),
    note = optString("note"),
    lastCheckedAt = optNullableLong("lastCheckedAt"),
    aliases = optJSONArray("aliases").toGoogleAliases(),
)

private fun JSONArray?.toGoogleAliases(): List<GoogleAliasRecord> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optJSONObject(index)?.let { add(it.toGoogleAlias()) }
        }
    }
}

private fun JSONObject.toGoogleAlias(): GoogleAliasRecord = GoogleAliasRecord(
    id = optString("id"),
    address = optString("address"),
    aliasType = optString("aliasType", "plus"),
    aliasStatus = optString("aliasStatus", "candidate"),
    openAiStatus = optString("openAiStatus", "unregistered"),
    registeredAt = optNullableLong("registeredAt"),
    lastVerifiedAt = optNullableLong("lastVerifiedAt"),
    note = optString("note"),
)

private fun JSONObject.putNullable(key: String, value: Long?) {
    put(key, value ?: JSONObject.NULL)
}

private fun JSONObject.optNullableLong(key: String): Long? =
    if (isNull(key)) null else optLong(key).takeIf { it > 0L }
