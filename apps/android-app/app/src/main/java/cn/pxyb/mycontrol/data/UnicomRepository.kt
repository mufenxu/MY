package cn.pxyb.mycontrol.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class UnicomSession(
    val connected: Boolean = false,
    val maskedPhone: String = "",
    val loginId: String? = null,
    val loginPhone: String = "",
    val stage: String = "ready",
    val sentAt: Long = 0,
    val retryAt: Long = 0,
)

data class UnicomMetric(val id: String, val title: String, val available: Boolean, val value: String?, val unit: String)
data class UnicomOverview(val session: UnicomSession, val metrics: List<UnicomMetric>, val queriedAt: Long)

class UnicomRepository internal constructor(private val http: PlatformHttpClient) {
    suspend fun session(): UnicomSession = request("/session").toUnicomSession()

    suspend fun startLogin(phone: String): UnicomSession = request("/login-sessions", "POST", JSONObject().put("phone", phone)).toUnicomSession()

    suspend fun verifyCaptcha(id: String, ticket: String, randStr: String): UnicomSession = request(
        "/login-sessions/$id/captcha-verifications", "POST", JSONObject().put("ticket", ticket).put("randStr", randStr),
    ).toUnicomSession()

    suspend fun login(id: String, code: String): UnicomSession = request(
        "/login-sessions/$id/verifications", "POST", JSONObject().put("code", code),
    ).toUnicomSession()

    suspend fun disconnect(): UnicomSession = request("/session", "DELETE", JSONObject()).toUnicomSession()

    suspend fun overview(): UnicomOverview {
        val data = request("/overview")
        val array = data.getJSONArray("metrics")
        return UnicomOverview(data.toUnicomSession(), List(array.length()) { index ->
            val metric = array.getJSONObject(index)
            UnicomMetric(metric.getString("id"), metric.getString("title"), metric.optBoolean("available"),
                metric.optString("value").takeIf { metric.optBoolean("available") }, metric.optString("unit"))
        }, data.getLong("queriedAt"))
    }

    private suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        http.execute("/apps/core/api/v1/unicom$path", method, body, timeoutSeconds = 55).json.getJSONObject("data")
    }
}

private fun JSONObject.toUnicomSession() = UnicomSession(
    connected = optBoolean("connected"), maskedPhone = optString("maskedPhone"),
    loginId = optString("loginId").takeUnless { it.isBlank() || it == "null" },
    loginPhone = optString("loginPhone"), stage = optString("stage", "ready"),
    sentAt = optLong("sentAt"), retryAt = optLong("retryAt"),
)
