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
data class UnicomAllowance(val id: String, val title: String, val remaining: String?, val used: String?, val unit: String)
data class UnicomDetails(val nickname: String?, val packageName: String?, val groups: List<UnicomAllowance>, val queriedAt: Long)
data class UnicomPrize(val id: String, val prizeName: String, val drawnAt: Long?)
data class UnicomActivities(val eligible: Boolean, val title: String, val records: List<UnicomPrize>, val queriedAt: Long)

data class UnicomCoupon(val id: String, val name: String, val description: String?, val status: String)

data class UnicomCoupons(val items: List<UnicomCoupon>, val page: Int, val hasMore: Boolean, val queriedAt: Long)

data class UnicomCouponDetail(val id: String, val name: String, val status: String, val validUntil: String?, val code: String?)

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

    suspend fun details(): UnicomDetails {
        val data = request("/details")
        val groups = data.getJSONArray("groups")
        return UnicomDetails(data.optionalText("nickname"), data.optionalText("packageName"), List(groups.length()) { index ->
            val group = groups.getJSONObject(index)
            UnicomAllowance(group.getString("id"), group.getString("title"), group.optionalText("remaining"), group.optionalText("used"), group.getString("unit"))
        }, data.getLong("queriedAt"))
    }

    suspend fun xinjiangActivities(): UnicomActivities {
        val data = request("/xinjiang/activities", timeoutSeconds = 85)
        val records = data.getJSONArray("records")
        return UnicomActivities(data.getBoolean("eligible"), data.getString("title"), List(records.length()) { index ->
            val record = records.getJSONObject(index)
            UnicomPrize(record.getString("id"), record.getString("prizeName"), record.optLong("drawnAt").takeIf { it > 0 })
        }, data.getLong("queriedAt"))
    }

    suspend fun coupons(page: Int = 1): UnicomCoupons {
        val data = request("/coupons?page=$page", timeoutSeconds = 85)
        val items = data.getJSONArray("items")
        val pagination = data.getJSONObject("page")
        return UnicomCoupons(List(items.length()) { index ->
            val item = items.getJSONObject(index)
            UnicomCoupon(item.getString("id"), item.getString("name"), item.optionalText("description"), item.getString("status"))
        }, pagination.getInt("page"), pagination.getBoolean("hasMore"), data.getLong("queriedAt"))
    }

    suspend fun couponDetail(id: String): UnicomCouponDetail {
        val data = request("/coupons/$id", timeoutSeconds = 85)
        return UnicomCouponDetail(data.getString("id"), data.getString("name"), data.getString("status"), data.optionalText("validUntil"), data.optionalText("code"))
    }

    private suspend fun request(path: String, method: String = "GET", body: JSONObject? = null, timeoutSeconds: Long = 55): JSONObject = withContext(Dispatchers.IO) {
        http.execute("/apps/core/api/v1/unicom$path", method, body, timeoutSeconds = timeoutSeconds).json.getJSONObject("data")
    }
}

private fun JSONObject.optionalText(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

private fun JSONObject.toUnicomSession() = UnicomSession(
    connected = optBoolean("connected"), maskedPhone = optString("maskedPhone"),
    loginId = optString("loginId").takeUnless { it.isBlank() || it == "null" },
    loginPhone = optString("loginPhone"), stage = optString("stage", "ready"),
    sentAt = optLong("sentAt"), retryAt = optLong("retryAt"),
)
