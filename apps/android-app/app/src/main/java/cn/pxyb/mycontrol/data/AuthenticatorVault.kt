package cn.pxyb.mycontrol.data

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray
import org.json.JSONObject

internal object AuthenticatorVault {
  private val random = SecureRandom()
  fun randomKey() = ByteArray(32).also(random::nextBytes)
  fun encode(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
  fun decode(value: String): ByteArray = Base64.getDecoder().decode(value)
  fun recoveryCode(key: ByteArray): String {
    val checksum = MessageDigest.getInstance("SHA-256").digest(key).take(4).toByteArray()
    return (key + checksum).joinToString("") { "%02X".format(it) }.chunked(8).joinToString("-")
  }
  fun recoveryKey(code: String): ByteArray {
    val clean = code.replace("-", "").filterNot(Char::isWhitespace).uppercase()
    require(clean.length == 72 && clean.all { it in "0123456789ABCDEF" }) { "恢复密钥格式不正确。" }
    val bytes = clean.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    val key = bytes.copyOfRange(0, 32)
    val valid = MessageDigest.isEqual(bytes.copyOfRange(32, 36), MessageDigest.getInstance("SHA-256").digest(key).copyOf(4))
    bytes.fill(0)
    if (!valid) key.fill(0)
    require(valid) { "恢复密钥校验失败，请检查输入。" }
    return key
  }
  private fun wrapKey(recovery: ByteArray, owner: String, vaultId: String): ByteArray {
    // RFC 5869 HKDF-SHA256: context-specific extract salt and a single expand block.
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec("MY/authenticator/v1/$owner/$vaultId".toByteArray(), "HmacSHA256"))
    val prk = mac.doFinal(recovery)
    return try {
      mac.init(SecretKeySpec(prk, "HmacSHA256"))
      mac.doFinal("recovery-wrap".toByteArray() + byteArrayOf(1))
    } finally { prk.fill(0) }
  }
  private fun aad(owner: String, vaultId: String, version: Int, purpose: String) =
    JSONArray().put("MY-authenticator").put(1).put(owner).put(vaultId).put(version).put(purpose).toString().toByteArray()
  fun seal(key: ByteArray, plain: ByteArray, aad: ByteArray): String {
    val nonce = ByteArray(12).also(random::nextBytes)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
    cipher.updateAAD(aad)
    return encode(nonce + cipher.doFinal(plain))
  }
  fun open(key: ByteArray, sealed: String, aad: ByteArray): ByteArray {
    require(sealed.length <= 96000) { "保险库数据超出限制。" }
    val bytes = decode(sealed)
    require(bytes.size >= 29)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, bytes.copyOf(12)))
    cipher.updateAAD(aad)
    return cipher.doFinal(bytes, 12, bytes.size - 12)
  }
  fun wrap(master: ByteArray, recovery: ByteArray, owner: String, id: String, version: Int): String {
    val key = wrapKey(recovery, owner, id)
    return try { seal(key, master, aad(owner, id, version, "key")) } finally { key.fill(0) }
  }
  fun unwrap(recovery: ByteArray, owner: String, remote: JSONObject): ByteArray {
    require(remote.getInt("version") == 1)
    val key = wrapKey(recovery, owner, remote.getString("vaultId"))
    return try { open(key, remote.getString("wrappedKey"), aad(owner, remote.getString("vaultId"), remote.getInt("keyVersion"), "key"))
      .also { require(it.size == 32) } } finally { key.fill(0) }
  }
  fun entryJson(entry: AuthenticatorEntry) = JSONObject().put("id", entry.id).put("issuer", entry.issuer)
    .put("account", entry.account).put("secret", encode(entry.secret)).put("algorithm", entry.algorithm)
    .put("digits", entry.digits).put("periodSeconds", entry.periodSeconds)
  fun entriesJson(entries: List<AuthenticatorEntry>) = JSONArray().apply { entries.forEach { put(entryJson(it)) } }
  fun entries(json: JSONArray): List<AuthenticatorEntry> {
    require(json.length() <= 500) { "验证器条目最多支持 500 个。" }
    val result = mutableListOf<AuthenticatorEntry>()
    try {
      for (i in 0 until json.length()) {
        val item = json.getJSONObject(i)
        val secret = decode(item.getString("secret"))
        val entry = Authenticator.createEntry(issuer = item.getString("issuer"), account = item.getString("account"), secret = secret,
          algorithm = item.getString("algorithm").removePrefix("Hmac"), digits = item.getInt("digits"), periodSeconds = item.getInt("periodSeconds"))
          .copy(id = UUID.fromString(item.getString("id")).toString())
        result.add(entry)
      }
      require(result.map { it.id }.distinct().size == result.size) { "保险库包含重复条目。" }
      return result
    } catch (error: Exception) { result.forEach { it.secret.fill(0) }; throw error }
  }
  fun payload(entries: List<AuthenticatorEntry>, deleted: Set<String>): JSONObject {
    require(entries.size <= 500) { "云端保险库最多支持 500 个条目。" }
    require(deleted.size <= 2000) { "删除记录已达上限，请轮换保险库密钥。" }
    return JSONObject().put("entries", entriesJson(entries)).put("deleted", JSONArray(deleted.toList()))
  }
  fun deleted(payload: JSONObject): Set<String> {
    val values = payload.getJSONArray("deleted")
    require(values.length() <= 2000) { "删除记录已达上限，请轮换保险库密钥。" }
    return (0 until values.length()).map { UUID.fromString(values.getString(it)).toString() }.toSet()
  }
  fun encrypt(master: ByteArray, owner: String, local: JSONObject, payload: JSONObject, revision: Int): String {
    val plain = payload.toString().toByteArray()
    return try {
      seal(master, plain, aad(owner, local.getString("vaultId"), local.getInt("keyVersion"), "data/$revision"))
        .also { require(it.length <= 96000) { "保险库数据超出容量限制，请减少条目。" } }
    } finally { plain.fill(0) }
  }
  fun decrypt(master: ByteArray, owner: String, remote: JSONObject): JSONObject {
    require(remote.getInt("version") == 1)
    val bytes = open(master, remote.getString("ciphertext"), aad(owner, remote.getString("vaultId"), remote.getInt("keyVersion"), "data/${remote.getInt("revision")}"))
    return try { JSONObject(String(bytes, Charsets.UTF_8)) } finally { bytes.fill(0) }
  }
}
