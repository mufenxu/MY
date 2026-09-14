package cn.pxyb.mycontrol.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.UUID
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject

internal data class DeviceRegistration(val alias: String, val body: JSONObject)

internal object DeviceProof {
    private const val PREFIX = "my_control_device_proof_"
    private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING

    fun createRegistration(challenge: JSONObject): DeviceRegistration {
        val alias = PREFIX + UUID.randomUUID()
        val attest = challenge.optBoolean("attestationConfigured")
        val challengeBytes = Base64.decode(challenge.getString("challenge"), BASE64_FLAGS)
        require(challengeBytes.size == 32)
        fun generate(strongBox: Boolean) {
            val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setIsStrongBoxBacked(strongBox)
            if (attest) builder.setAttestationChallenge(challengeBytes)
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
                initialize(builder.build())
            }.generateKeyPair()
        }
        try {
            try { generate(strongBox = true) } catch (_: java.security.GeneralSecurityException) {
                delete(alias)
                generate(strongBox = false)
            } catch (_: android.security.keystore.StrongBoxUnavailableException) {
                delete(alias)
                generate(strongBox = false)
            }
            val chain = JSONArray()
            if (attest) keyStore().getCertificateChain(alias).forEach {
                chain.put(Base64.encodeToString(it.encoded, Base64.NO_WRAP))
            }
            return DeviceRegistration(alias, JSONObject()
                .put("challengeId", challenge.getString("challengeId"))
                .put("certificateChain", chain))
        } catch (error: Exception) {
            delete(alias)
            throw ApiException("无法建立设备安全密钥，请检查系统安全设置后重试。", 403, "DEVICE_KEY_UNAVAILABLE")
        }
    }

    fun sign(alias: String, method: String, url: HttpUrl, body: ByteArray, cookie: String?): String {
        require(alias.startsWith(PREFIX))
        val store = keyStore()
        val privateKey = store.getKey(alias, null) as? PrivateKey
            ?: throw ApiException("设备安全密钥已失效，请重新登录。", 401, "DEVICE_KEY_UNAVAILABLE")
        val publicKey = store.getCertificate(alias).publicKey as ECPublicKey
        val header = JSONObject().put("typ", "dpop+jwt").put("alg", "ES256")
            .put("jwk", JSONObject().put("kty", "EC").put("crv", "P-256")
                .put("x", encode(coordinate(publicKey.w.affineX)))
                .put("y", encode(coordinate(publicKey.w.affineY))))
        val claims = JSONObject()
            .put("jti", UUID.randomUUID().toString().replace("-", ""))
            .put("iat", System.currentTimeMillis() / 1000)
            .put("htm", method)
            .put("htu", url.newBuilder().query(null).fragment(null).build().toString())
            .put("qsh", digest(url.encodedQuery?.takeIf { it.isNotEmpty() }?.let { "?$it" }.orEmpty().toByteArray(Charsets.UTF_8)))
            .put("bht", digest(body))
        cookie?.takeIf { it.isNotBlank() }?.let {
            claims.put("ath", digest(it.substringAfter('=').toByteArray(Charsets.UTF_8)))
        }
        val input = "${encode(header.toString().toByteArray(Charsets.UTF_8))}.${encode(claims.toString().toByteArray(Charsets.UTF_8))}"
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey)
            update(input.toByteArray(Charsets.US_ASCII))
            sign()
        }
        return "$input.${encode(ecdsaDerToJose(signature))}"
    }

    fun delete(alias: String?) {
        if (alias?.startsWith(PREFIX) == true) runCatching { keyStore().deleteEntry(alias) }
    }

    private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, BASE64_FLAGS)
    private fun digest(bytes: ByteArray) = encode(MessageDigest.getInstance("SHA-256").digest(bytes))
    private fun coordinate(value: BigInteger): ByteArray = value.toByteArray().let {
        val bytes = if (it.size == 33 && it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it
        require(bytes.size <= 32)
        ByteArray(32 - bytes.size) + bytes
    }
}

internal fun ecdsaDerToJose(der: ByteArray): ByteArray {
    require(der.size in 8..72 && der[0] == 0x30.toByte() && der[1].toInt() == der.size - 2)
    var offset = 2
    val result = ByteArray(64)
    repeat(2) { index ->
        require(offset + 2 <= der.size && der[offset++] == 0x02.toByte())
        val size = der[offset++].toInt() and 0xff
        require(size in 1..33 && offset + size <= der.size && der[offset].toInt() >= 0)
        val leadingZero = size > 1 && der[offset] == 0.toByte()
        val count = size - if (leadingZero) 1 else 0
        require(count <= 32)
        der.copyInto(result, index * 32 + 32 - count, offset + if (leadingZero) 1 else 0, offset + size)
        offset += size
    }
    require(offset == der.size)
    return result
}
