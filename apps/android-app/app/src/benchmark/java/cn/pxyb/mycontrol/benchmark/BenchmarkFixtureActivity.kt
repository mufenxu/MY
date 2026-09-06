package cn.pxyb.mycontrol.benchmark

import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppPreferences
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.data.Authenticator
import cn.pxyb.mycontrol.data.AuthenticatorEntry
import cn.pxyb.mycontrol.data.AuthenticatorStore
import cn.pxyb.mycontrol.data.CAMPUS_TIMETABLE_PATH
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.data.toJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

// 仅编入独立的性能采集包；采集前准备数据，避免将准备开销混入启动测量。
class BenchmarkFixtureActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val status = TextView(this).apply { text = "正在准备基准数据" }
        setContentView(status)
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { seedFixtures() }
            status.text = "基准数据已准备"
        }
    }

    private fun seedFixtures() {
        val now = System.currentTimeMillis()
        val username = "benchmark-fixture"
        SessionStore(this).apply {
            setLockEnabled(false)
            writeCookie("benchmark_fixture=offline", now + 86_400_000L, 1440, username)
        }
        AppPreferences(this).apply {
            completeInitialSetup()
            setThemePreference(AppThemePreference.Light)
        }
        AuthenticatorStore(this).write(List(8) { index ->
            AuthenticatorEntry("fixture-otp-$index", "示例验证器 ${index + 1}", "benchmark@example.invalid",
                ByteArray(20) { it.toByte() }, Authenticator.ALGORITHM_SHA1, 6, 30)
        })
        val snapshots = ResponseSnapshotStore(this).apply { setAccount(username) }
        fun snapshot(path: String, json: Any) = snapshots.write(path, json.toString())
        snapshot("/api/auth/status", JSONObject().put("authenticated", true).put("user",
            JSONObject().put("username", username).put("displayName", "性能采集账号").put("role", "admin")))
        snapshot("/api/operations/overview", JSONObject().put("services", JSONArray().apply {
            listOf("core", "campus", "iot", "notify").forEach { id ->
                put(JSONObject().put("id", id).put("name", "示例服务 $id").put("state", "healthy"))
            }
        }).put("incidents", JSONArray()).put("audit", JSONArray()))
        snapshot("/api/incidents?limit=100", JSONObject().put("incidents", JSONArray()))
        snapshot("/api/tasks?limit=100", JSONObject().put("tasks", JSONArray()))
        snapshot("/api/external-apps", JSONObject().put("applications", JSONArray()))
        snapshot("/apps/core/api/resources/expiry-summary", JSONObject().put("resources", JSONArray()))
        val tasks = List(40) { index ->
            TodoTask(id = "fixture-todo-$index", title = "示例待办 ${index + 1}", dueAt = now + (index + 1) * 3_600_000L)
        }
        snapshot("/apps/core/api/todos", JSONObject().put("tasks", JSONArray(tasks.map { it.toJson() })).put("revision", 1))
        snapshot(CAMPUS_TIMETABLE_PATH, JSONObject().put("termText", "示例学期").put("courses", JSONArray().apply {
            repeat(12) { index ->
                put(JSONObject().put("id", "course-$index").put("courseCode", "CODE-$index")
                    .put("courseName", "示例课程 ${index + 1}").put("teacher", "示例教师")
                    .put("day", index % 5 + 1).put("dayName", "星期${index % 5 + 1}")
                    .put("startSection", index % 4 * 2 + 1).put("endSection", index % 4 * 2 + 2)
                    .put("weeks", JSONArray((1..20).toList())).put("weekText", "1-20 周")
                    .put("sectionText", "第 1-2 节").put("timeRange", "08:00-09:40").put("location", "示例教室"))
            }
        }))
        snapshot("/apps/iot/api/status", JSONObject().put("mqttConnected", true).put("deviceOnline", true).put("connectionState", "connected"))
        snapshot("/apps/iot/api/devices", JSONObject().apply {
            listOf("esp8266_living", "relay_balcony").forEachIndexed { index, id ->
                put(id, JSONObject().put("name", "示例设备 ${index + 1}").put("online", true)
                    .put("temperature", 24.5 + index).put("humidity", 48.0 + index)
                    .put("relays", JSONObject().put("relay1", "OFF").put("relay2", "OFF")))
                snapshot("/apps/iot/api/devices/$id/insights?range=24h", JSONObject())
            }
        })
        snapshot("/apps/iot/api/automations/scenes", JSONArray())
        snapshot("/apps/iot/api/automations/rules", JSONArray())
        snapshot("/apps/iot/api/automations/runs?limit=20", JSONArray())
        PersonalWorkspaceStore(this).apply {
            setAccount(username)
            writeTodoSnapshot(TodoSnapshot(tasks = tasks, revision = 1))
            writeAlerts(List(40) { index ->
                AppAlertRecord("fixture-alert-$index", "system", "fixture", "示例通知 ${index + 1}",
                    "用于采集通知列表滚动与页面返回路径。", now - index * 60_000L)
            })
        }
    }
}
