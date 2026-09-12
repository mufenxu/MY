package cn.pxyb.mycontrol.data

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class AuthenticatorEntry(
    val id: String,
    val issuer: String,
    val account: String,
    val secret: ByteArray,
    val algorithm: String,
    val digits: Int,
    val periodSeconds: Int,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as AuthenticatorEntry
        return id == other.id && issuer == other.issuer && account == other.account &&
            secret.contentEquals(other.secret) && algorithm == other.algorithm &&
            digits == other.digits && periodSeconds == other.periodSeconds
    }

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + issuer.hashCode()
        result = 31 * result + account.hashCode()
        result = 31 * result + secret.contentHashCode()
        result = 31 * result + algorithm.hashCode()
        result = 31 * result + digits
        result = 31 * result + periodSeconds
        return result
    }
}

class AuthenticatorParseException(message: String) : Exception(message)

object Authenticator {
    const val ALGORITHM_SHA1 = "HmacSHA1"
    const val ALGORITHM_SHA256 = "HmacSHA256"
    const val ALGORITHM_SHA512 = "HmacSHA512"

    fun parseOtpAuthUri(value: String): AuthenticatorEntry {
        val uri = runCatching { URI(value.trim()) }
            .getOrElse { throw AuthenticatorParseException("二维码不是有效的 otpauth 地址。") }
        if (uri.scheme?.lowercase() != "otpauth") {
            throw AuthenticatorParseException("二维码不是有效的 otpauth 地址。")
        }
        if (uri.host?.lowercase() != "totp") {
            throw AuthenticatorParseException("当前仅支持 TOTP 动态验证。")
        }

        val parameters = parseQuery(uri.rawQuery)
        val secret = decodeBase32(
            parameters["secret"]?.takeIf(String::isNotBlank)
                ?: throw AuthenticatorParseException("二维码缺少密钥。"),
        )
        // 标签只解码一次，路径中的加号属于账号本身。
        val label = decodeUriPart(uri.rawPath.orEmpty().removePrefix("/").replace("+", "%2B"))
        if (label.isBlank()) throw AuthenticatorParseException("二维码缺少账号名称。")
        val labelIssuer = label.takeIf { it.contains(':') }?.substringBefore(':')?.trim().orEmpty()
        val queryIssuer = parameters["issuer"]?.trim().orEmpty()
        val issuer = queryIssuer.ifBlank { labelIssuer }.ifBlank { "未命名服务" }
        val account = label.substringAfter(':', label).trim()
        if (account.isBlank()) throw AuthenticatorParseException("二维码缺少账号名称。")

        return createEntry(
            id = newId(),
            issuer = issuer,
            account = account,
            secret = secret,
            algorithm = parameters["algorithm"] ?: "SHA1",
            digits = parameters["digits"]?.let {
                it.trim().toIntOrNull() ?: throw AuthenticatorParseException("验证码位数必须为整数。")
            } ?: 6,
            periodSeconds = parameters["period"]?.let {
                it.trim().toIntOrNull() ?: throw AuthenticatorParseException("刷新周期必须为正整数秒。")
            } ?: 30,
        )
    }

    fun createEntry(
        id: String = newId(),
        issuer: String,
        account: String,
        secret: ByteArray,
        algorithm: String = "SHA1",
        digits: Int = 6,
        periodSeconds: Int = 30,
    ): AuthenticatorEntry {
        require(issuer.isNotBlank()) { "请输入服务名称。" }
        require(account.isNotBlank()) { "请输入账号名称。" }
        require(secret.isNotEmpty()) { "密钥不能为空。" }
        val normalizedAlgorithm = when (algorithm.trim().uppercase().replace("-", "")) {
            "SHA1" -> ALGORITHM_SHA1
            "SHA256" -> ALGORITHM_SHA256
            "SHA512" -> ALGORITHM_SHA512
            else -> throw AuthenticatorParseException("不支持的哈希算法，请使用 SHA1、SHA256 或 SHA512。")
        }
        require(digits in 6..8) { "验证码位数只支持 6 至 8 位。" }
        require(periodSeconds > 0) { "刷新周期必须为正整数秒。" }
        return AuthenticatorEntry(
            id = id,
            issuer = issuer.trim(),
            account = account.trim(),
            secret = secret,
            algorithm = normalizedAlgorithm,
            digits = digits,
            periodSeconds = periodSeconds,
        )
    }

    fun generate(entry: AuthenticatorEntry, currentMillis: Long = System.currentTimeMillis()): String {
        val counter = (currentMillis / MILLIS_PER_SECOND) / entry.periodSeconds
        val message = byteArrayOf(
            (counter ushr 56).toByte(),
            (counter ushr 48).toByte(),
            (counter ushr 40).toByte(),
            (counter ushr 32).toByte(),
            (counter ushr 24).toByte(),
            (counter ushr 16).toByte(),
            (counter ushr 8).toByte(),
            counter.toByte(),
        )
        val digest = Mac.getInstance(entry.algorithm).apply {
            init(SecretKeySpec(entry.secret, entry.algorithm))
        }.doFinal(message)
        val offset = digest.last().toInt() and 0x0F
        val binary = ((digest[offset].toInt() and 0x7F) shl 24) or
            ((digest[offset + 1].toInt() and 0xFF) shl 16) or
            ((digest[offset + 2].toInt() and 0xFF) shl 8) or
            (digest[offset + 3].toInt() and 0xFF)
        return binary.toString().padStart(entry.digits, '0').takeLast(entry.digits)
    }

    fun remainingSeconds(entry: AuthenticatorEntry, currentMillis: Long = System.currentTimeMillis()): Int {
        val elapsedSeconds = currentMillis / MILLIS_PER_SECOND
        return (entry.periodSeconds - (elapsedSeconds % entry.periodSeconds)).toInt()
    }

    fun newId(): String = java.util.UUID.randomUUID().toString()

    fun decodeBase32(value: String): ByteArray {
        val normalized = value.uppercase().filterNot { it.isWhitespace() || it == '-' }
        if (normalized.isEmpty()) throw AuthenticatorParseException("请输入 Base32 密钥。")
        val dataEnd = normalized.indexOf('=')
        if (dataEnd >= 0 && normalized.drop(dataEnd).any { it != '=' }) {
            throw AuthenticatorParseException("密钥的填充格式无效。")
        }
        val data = if (dataEnd >= 0) normalized.substring(0, dataEnd) else normalized
        if (data.isEmpty() || data.any { it !in BASE32_ALPHABET }) {
            throw AuthenticatorParseException("密钥必须为有效的 Base32 字符。")
        }
        val paddingLength = when (data.length % 8) {
            0 -> 0
            2 -> 6
            4 -> 4
            5 -> 3
            7 -> 1
            else -> throw AuthenticatorParseException("密钥长度无效。")
        }
        if (dataEnd >= 0 && normalized.length - dataEnd != paddingLength) {
            throw AuthenticatorParseException("密钥的填充格式无效。")
        }
        val bits = data.length * 5
        var buffer = 0
        var bitsInBuffer = 0
        return ByteArray(bits / BYTE_BITS).apply {
            var index = 0
            data.forEach { character ->
                buffer = (buffer shl 5) or BASE32_ALPHABET.indexOf(character)
                bitsInBuffer += 5
                if (bitsInBuffer >= BYTE_BITS) {
                    bitsInBuffer -= BYTE_BITS
                    this[index++] = ((buffer shr bitsInBuffer) and 0xFF).toByte()
                }
            }
            if (bitsInBuffer > 0 && (buffer and ((1 shl bitsInBuffer) - 1)) != 0) {
                throw AuthenticatorParseException("密钥末尾的填充位无效。")
            }
        }
    }

    private fun parseQuery(rawQuery: String?): Map<String, String> {
        if (rawQuery.isNullOrBlank()) return emptyMap()
        return rawQuery.split('&').mapNotNull { pair ->
            val key = pair.substringBefore('=')
            if (key.isBlank()) return@mapNotNull null
            key to decodeUriPart(pair.substringAfter('=', ""))
        }.toMap()
    }

    private fun decodeUriPart(value: String): String =
        runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8.name()) }
            .getOrElse { throw AuthenticatorParseException("二维码参数编码无效。") }

    private const val BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    private const val BYTE_BITS = 8
    private const val MILLIS_PER_SECOND = 1000L
}
