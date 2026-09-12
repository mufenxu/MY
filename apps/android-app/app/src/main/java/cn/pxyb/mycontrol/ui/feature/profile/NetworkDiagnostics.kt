package cn.pxyb.mycontrol.ui.feature.profile

import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.PlatformApi
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.security.cert.X509Certificate
import java.time.temporal.ChronoUnit
import javax.net.ssl.HttpsURLConnection

internal class NetworkDiagnostics(private val api: PlatformApi) {
    suspend fun inspect(): NetworkHealth {
        val checks = mutableListOf<NetworkCheckResult>()
        val baseUrl = runCatching { URL(BuildConfig.PLATFORM_BASE_URL) }.getOrNull()
        val host = baseUrl?.host.orEmpty()
        val dnsStart = System.nanoTime()
        val dnsResult = runCatching { InetAddress.getByName(host) }
        val dnsMs = (System.nanoTime() - dnsStart) / 1_000_000L
        checks += NetworkCheckResult(
            label = "DNS 解析",
            ok = dnsResult.isSuccess,
            detail = if (dnsResult.isSuccess) "$host · ${dnsMs}ms" else "无法解析 $host",
        )

        val apiStart = System.nanoTime()
        val apiResult = runCatching { api.withRequestMetadata(allowCache = false) { api.auth.authStatus() } }
        val apiMs = (System.nanoTime() - apiStart) / 1_000_000L
        checks += NetworkCheckResult(
            label = "平台 API",
            ok = apiResult.isSuccess,
            detail = if (apiResult.isSuccess) "响应 ${apiMs}ms" else (apiResult.exceptionOrNull()?.message ?: "请求失败"),
        )

        val updateResult = checkHttpEndpoint(BuildConfig.APP_UPDATE_MANIFEST_URL)
        checks += NetworkCheckResult("更新源", updateResult.first, updateResult.second)
        val fallbackResult = checkHttpEndpoint(BuildConfig.APP_UPDATE_MANIFEST_FALLBACK_URL)
        checks += NetworkCheckResult("GitHub 备用源", fallbackResult.first, fallbackResult.second)

        val certificateDays = checkCertificateDays(baseUrl)
        checks += NetworkCheckResult(
            label = "HTTPS 证书",
            ok = certificateDays == null || certificateDays >= 14,
            detail = certificateDays?.let { "剩余约 ${it.coerceAtLeast(0)} 天" } ?: "未能读取证书有效期",
        )
        val apiOk = apiResult.isSuccess
        val dnsOk = dnsResult.isSuccess
        val hardFailure = !dnsOk || !apiOk
        val status = when {
            hardFailure -> "error"
            checks.any { !it.ok } -> "warning"
            apiMs < 150 -> "healthy"
            apiMs < 500 -> "warning"
            else -> "error"
        }
        val message = when (status) {
            "healthy" -> "手机到平台与更新源均可访问 · API ${apiMs}ms"
            "warning" -> checks.firstOrNull { !it.ok }?.let { "${it.label}需要关注：${it.detail}" }
                ?: "平台可访问，但响应偏慢 · API ${apiMs}ms"
            else -> checks.firstOrNull { !it.ok }?.let { "${it.label}失败：${it.detail}" } ?: "远程网关连接失败"
        }
        return NetworkHealth(
            latencyMs = apiMs,
            status = status,
            gatewayUrl = BuildConfig.PLATFORM_BASE_URL,
            checkedAtMillis = System.currentTimeMillis(),
            dnsOk = dnsOk,
            apiOk = apiOk,
            message = message,
            certificateDaysRemaining = certificateDays,
            checks = checks,
        )
    }

    private fun checkHttpEndpoint(rawUrl: String): Pair<Boolean, String> = runCatching {
        val connection = URL(rawUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        connection.requestMethod = "GET"
        connection.instanceFollowRedirects = true
        try {
            val code = connection.responseCode
            if (code in 200..399) true to "HTTP $code" else false to "HTTP $code"
        } finally {
            connection.disconnect()
        }
    }.getOrElse { false to (it.message ?: "请求失败") }

    private fun checkCertificateDays(url: URL?): Long? = runCatching {
        val connection = url?.openConnection() as? HttpsURLConnection ?: return null
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        try {
            connection.connect()
            val certificate = connection.serverCertificates.firstOrNull() as? X509Certificate ?: return null
            ChronoUnit.DAYS.between(java.time.Instant.now(), certificate.notAfter.toInstant())
        } finally {
            connection.disconnect()
        }
    }.getOrNull()
}
