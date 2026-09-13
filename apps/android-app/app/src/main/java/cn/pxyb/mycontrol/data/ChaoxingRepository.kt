package cn.pxyb.mycontrol.data

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class ChaoxingSession(val connected: Boolean = false, val name: String = "", val school: String = "", val signProviderConnected: Boolean = false)

data class ChaoxingCourse(val courseId: String, val classId: String, val name: String, val teacher: String, val className: String) {
    val key: String get() = "$courseId:$classId"
}

data class ChaoxingActivity(
    val id: String,
    val courseId: String,
    val classId: String,
    val name: String,
    val type: String,
    val typeText: String,
    val active: Boolean,
    val startTime: Long,
    val endTime: Long,
    val recordStatus: Int,
    val recordText: String,
    val signed: Boolean,
    val canSign: Boolean = false,
    val requiresOfficial: Boolean = false,
    val requiresCaptcha: Boolean = false,
    val requirements: List<String> = emptyList(),
    val locationText: String = "",
    val locationRange: Int = 0,
)

data class ChaoxingLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val timestamp: Long,
    val address: String,
    val isMock: Boolean,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("latitude", latitude).put("longitude", longitude).put("accuracy", accuracy)
        .put("timestamp", timestamp).put("address", address).put("isMock", isMock)
        .put("coordinateSystem", "bd09ll")
}

data class ChaoxingSignResult(
    val confirmed: Boolean,
    val pending: Boolean,
    val requiresOfficial: Boolean,
    val requiresCaptcha: Boolean,
    val message: String,
    val activity: ChaoxingActivity,
)

data class ChaoxingAutoSignLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val address: String,
    val isMock: Boolean,
)

data class ChaoxingAutoSignResult(
    val status: String,
    val message: String,
    val courseName: String,
    val activityName: String,
) {
    val failed: Boolean get() = status == "failed"
}

data class ChaoxingAutoSignCourse(val courseId: String, val classId: String, val name: String) {
    val key: String get() = "$courseId:$classId"
}

data class ChaoxingAutoSign(
    val enabled: Boolean = false,
    val times: List<String> = emptyList(),
    val course: ChaoxingAutoSignCourse? = null,
    val location: ChaoxingAutoSignLocation? = null,
    val lastResult: ChaoxingAutoSignResult? = null,
    val lastRunAt: String? = null,
    val notifyConfigured: Boolean = false,
    val signProviderConnected: Boolean = false,
)

class ChaoxingRepository internal constructor(private val http: PlatformHttpClient) {
    suspend fun session(): ChaoxingSession = withContext(Dispatchers.IO) {
        http.execute("$PATH/session").json.getJSONObject("data").toSession()
    }

    suspend fun connect(cookieEnvelope: String): ChaoxingSession = withContext(Dispatchers.IO) {
        http.execute("$PATH/session", "POST", JSONObject(cookieEnvelope)).json.getJSONObject("data").toSession()
    }

    suspend fun disconnect() = withContext(Dispatchers.IO) {
        http.execute("$PATH/disconnect", "POST", JSONObject())
        Unit
    }

    suspend fun connectSignProvider(phone: String, password: String): ChaoxingSession = withContext(Dispatchers.IO) {
        http.execute("$PATH/sign-provider", "POST", JSONObject().put("phone", phone).put("password", password))
            .json.getJSONObject("data").toSession()
    }

    suspend fun disconnectSignProvider(): ChaoxingSession = withContext(Dispatchers.IO) {
        http.execute("$PATH/sign-provider/disconnect", "POST", JSONObject()).json.getJSONObject("data").toSession()
    }

    suspend fun courses(): List<ChaoxingCourse> = withContext(Dispatchers.IO) {
        http.execute("$PATH/courses").json.optJSONArray("data").platformObjects().map {
            ChaoxingCourse(it.getString("courseId"), it.getString("classId"), it.optString("name"), it.optString("teacher"), it.optString("className"))
        }
    }

    suspend fun activities(course: ChaoxingCourse): List<ChaoxingActivity> = withContext(Dispatchers.IO) {
        http.execute("$PATH/activities?${query(course.courseId, course.classId)}").json.optJSONArray("data").platformObjects().map(JSONObject::toActivity)
    }

    suspend fun detail(activity: ChaoxingActivity): ChaoxingActivity = withContext(Dispatchers.IO) {
        http.execute("$PATH/activity?${query(activity.courseId, activity.classId)}&activeId=${Uri.encode(activity.id)}", timeoutSeconds = 60)
            .json.getJSONObject("data").toActivity()
    }

    suspend fun sign(activity: ChaoxingActivity, location: ChaoxingLocation?, validate: String = ""): ChaoxingSignResult = withContext(Dispatchers.IO) {
        val body = JSONObject().put("courseId", activity.courseId).put("classId", activity.classId).put("activeId", activity.id)
        location?.let { body.put("location", it.toJson()) }
        if (validate.isNotBlank()) body.put("validate", validate)
        val data = http.execute("$PATH/sign", "POST", body, timeoutSeconds = 150).json.getJSONObject("data")
        ChaoxingSignResult(data.optBoolean("confirmed"), data.optBoolean("pending"), data.optBoolean("requiresOfficial"), data.optBoolean("requiresCaptcha"), data.optString("message"), data.getJSONObject("activity").toActivity())
    }

    suspend fun autoSign(): ChaoxingAutoSign = withContext(Dispatchers.IO) {
        http.execute("$PATH/auto-sign").json.getJSONObject("data").toAutoSign()
    }

    suspend fun saveAutoSign(enabled: Boolean, times: List<String>, location: ChaoxingAutoSignLocation?, course: ChaoxingAutoSignCourse?): ChaoxingAutoSign = withContext(Dispatchers.IO) {
        val body = JSONObject().put("enabled", enabled).put("times", JSONArray(times))
        body.put("course", course?.let { JSONObject().put("courseId", it.courseId).put("classId", it.classId).put("name", it.name) } ?: JSONObject.NULL)
        location?.let { current ->
            body.put("location", JSONObject().put("latitude", current.latitude).put("longitude", current.longitude)
                .put("accuracy", current.accuracy).put("address", current.address).put("isMock", current.isMock))
        }
        http.execute("$PATH/auto-sign", "PUT", body).json.getJSONObject("data").toAutoSign()
    }

    suspend fun runAutoSign(): ChaoxingAutoSignResult = withContext(Dispatchers.IO) {
        http.execute("$PATH/auto-sign/run", "POST", JSONObject(), timeoutSeconds = 150).json.getJSONObject("data").toAutoSignResult()
    }

    private fun query(courseId: String, classId: String) = "courseId=${Uri.encode(courseId)}&classId=${Uri.encode(classId)}"

    companion object {
        private const val PATH = "/apps/campus/api/chaoxing"
        val cookieOrigins = listOf("https://passport2.chaoxing.com/", "https://sso.chaoxing.com/", "https://mooc1-api.chaoxing.com/", "https://mobilelearn.chaoxing.com/")
    }
}

private fun JSONObject.toSession() = ChaoxingSession(optBoolean("connected"), optString("name"), optString("school"), optBoolean("signProviderConnected"))

private fun JSONObject.toActivity() = ChaoxingActivity(
    id = getString("id"), courseId = getString("courseId"), classId = getString("classId"), name = optString("name"),
    type = optString("type"), typeText = optString("typeText"), active = optBoolean("active"), startTime = optLong("startTime"), endTime = optLong("endTime"),
    recordStatus = optInt("recordStatus", -1), recordText = optString("recordText", "待查询"), signed = optBoolean("signed"),
    canSign = optBoolean("canSign"), requiresOfficial = optBoolean("requiresOfficial"), requiresCaptcha = optBoolean("requiresCaptcha"),
    requirements = (optJSONArray("requirements") ?: JSONArray()).let { array -> List(array.length()) { array.optString(it) } },
    locationText = optString("locationText"), locationRange = optInt("locationRange"),
)

private fun JSONObject.toAutoSignResult() = ChaoxingAutoSignResult(
    status = optString("status"), message = optString("message"),
    courseName = optString("courseName"), activityName = optString("activityName"),
)

private fun JSONObject.toAutoSign() = ChaoxingAutoSign(
    enabled = optBoolean("enabled"),
    times = (optJSONArray("times") ?: JSONArray()).let { array -> List(array.length()) { array.optString(it) } }.filter { it.isNotBlank() },
    course = optJSONObject("course")?.takeIf { it.optString("courseId").isNotBlank() && it.optString("classId").isNotBlank() }
        ?.let { ChaoxingAutoSignCourse(it.optString("courseId"), it.optString("classId"), it.optString("name")) },
    location = optJSONObject("location")?.let { current ->
        ChaoxingAutoSignLocation(current.optDouble("latitude"), current.optDouble("longitude"), current.optDouble("accuracy").toFloat(), current.optString("address"), current.optBoolean("isMock"))
    },
    lastResult = optJSONObject("lastResult")?.toAutoSignResult(),
    lastRunAt = optString("lastRunAt").takeIf { it.isNotBlank() && it != "null" },
    notifyConfigured = optBoolean("notifyConfigured"),
    signProviderConnected = optBoolean("signProviderConnected"),
)
