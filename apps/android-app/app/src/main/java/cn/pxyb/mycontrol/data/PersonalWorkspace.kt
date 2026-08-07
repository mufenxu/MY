package cn.pxyb.mycontrol.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

data class TodoCourseRef(
    val id: String,
    val name: String,
)

data class TodoTask(
    val id: String,
    val title: String,
    val completed: Boolean = false,
    val dueAt: Long? = null,
    val priority: String = "normal",
    val recurrence: String = "none",
    val courseRef: TodoCourseRef? = null,
    val reminderAt: Long? = null,
    val reminderStatus: String = "pending",
    val remindedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
)

data class TodoSnapshot(
    val tasks: List<TodoTask> = emptyList(),
    val revision: Int = 0,
)

data class TodoMutation(
    val type: String,
    val task: TodoTask? = null,
    val id: String? = null,
)

data class CampusCourse(
    val id: String,
    val courseCode: String,
    val courseName: String,
    val teacher: String,
    val weekText: String,
    val weeks: List<Int>,
    val day: Int,
    val dayName: String,
    val sectionText: String,
    val startSection: Int,
    val endSection: Int,
    val timeRange: String,
    val location: String,
)

data class CampusTimetable(
    val currentCalendarText: String = "",
    val termText: String = "",
    val generatedAt: String? = null,
    val live: Boolean = false,
    val staleReason: String? = null,
    val courses: List<CampusCourse> = emptyList(),
)

data class ResourceExpiry(
    val id: String,
    val type: String,
    val name: String,
    val expiresAt: String,
    val advanceNoticeDays: Int,
)

data class AppAlertRecord(
    val id: String,
    val type: String,
    val sourceId: String,
    val title: String,
    val body: String,
    val createdAt: Long,
    val read: Boolean = false,
    val snoozedUntil: Long? = null,
)

data class AlertPreferences(
    val quietHoursEnabled: Boolean = false,
    val quietStartHour: Int = 22,
    val quietEndHour: Int = 7,
)

data class TrendSample(
    val day: String,
    val serviceTotal: Int,
    val healthyServices: Int,
    val activeIncidents: Int,
    val pendingTasks: Int,
    val deviceTotal: Int,
    val onlineDevices: Int,
)

class PersonalWorkspaceStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun readTodoSnapshot(): TodoSnapshot = preferences.getString(KEY_TODOS, null)
        ?.let(::parseObject)
        ?.toTodoSnapshot()
        ?: TodoSnapshot()

    fun writeTodoSnapshot(snapshot: TodoSnapshot) {
        preferences.edit().putString(KEY_TODOS, snapshot.toJson().toString()).apply()
    }

    fun readPendingTodoMutations(): List<TodoMutation> = preferences.getString(KEY_TODO_QUEUE, null)
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toTodoMutation)

    fun writePendingTodoMutations(mutations: List<TodoMutation>) {
        preferences.edit().putString(
            KEY_TODO_QUEUE,
            JSONArray().apply { mutations.takeLast(MAX_PENDING_MUTATIONS).forEach { put(it.toJson()) } }.toString(),
        ).apply()
    }

    fun readAlerts(): List<AppAlertRecord> = preferences.getString(KEY_ALERTS, null)
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toAlertRecord)
        .sortedByDescending(AppAlertRecord::createdAt)

    fun writeAlerts(alerts: List<AppAlertRecord>) {
        preferences.edit().putString(
            KEY_ALERTS,
            JSONArray().apply { alerts.sortedByDescending(AppAlertRecord::createdAt).take(MAX_ALERTS).forEach { put(it.toJson()) } }.toString(),
        ).apply()
    }

    fun appendAlerts(alerts: List<AppAlertRecord>) {
        if (alerts.isEmpty()) return
        val existing = readAlerts().associateBy(AppAlertRecord::id).toMutableMap()
        alerts.forEach { existing[it.id] = it }
        writeAlerts(existing.values.toList())
    }

    fun readAlertPreferences(): AlertPreferences = AlertPreferences(
        quietHoursEnabled = preferences.getBoolean(KEY_QUIET_ENABLED, false),
        quietStartHour = preferences.getInt(KEY_QUIET_START, 22).coerceIn(0, 23),
        quietEndHour = preferences.getInt(KEY_QUIET_END, 7).coerceIn(0, 23),
    )

    fun writeAlertPreferences(value: AlertPreferences) {
        preferences.edit()
            .putBoolean(KEY_QUIET_ENABLED, value.quietHoursEnabled)
            .putInt(KEY_QUIET_START, value.quietStartHour.coerceIn(0, 23))
            .putInt(KEY_QUIET_END, value.quietEndHour.coerceIn(0, 23))
            .apply()
    }

    fun readTrendSamples(): List<TrendSample> = preferences.getString(KEY_TRENDS, null)
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toTrendSample)
        .sortedBy(TrendSample::day)

    fun upsertTrendSample(sample: TrendSample) {
        val samples = readTrendSamples().associateBy(TrendSample::day).toMutableMap()
        samples[sample.day] = sample
        val normalized = samples.values.sortedBy(TrendSample::day).takeLast(MAX_TREND_DAYS)
        preferences.edit().putString(
            KEY_TRENDS,
            JSONArray().apply { normalized.forEach { put(it.toJson()) } }.toString(),
        ).apply()
    }

    fun clearAccountData() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "personal_workspace"
        const val KEY_TODOS = "todos"
        const val KEY_TODO_QUEUE = "todo_queue"
        const val KEY_ALERTS = "alerts"
        const val KEY_QUIET_ENABLED = "quiet_enabled"
        const val KEY_QUIET_START = "quiet_start"
        const val KEY_QUIET_END = "quiet_end"
        const val KEY_TRENDS = "trends"
        const val MAX_PENDING_MUTATIONS = 100
        const val MAX_ALERTS = 200
        const val MAX_TREND_DAYS = 45
    }
}

fun newTodoTask(title: String): TodoTask = TodoTask(
    id = UUID.randomUUID().toString(),
    title = title.trim(),
)

fun todayTrendSample(
    overview: OverviewData?,
    incidents: List<IncidentInfo>,
    tasks: List<PlatformTask>,
    iot: IotData?,
): TrendSample? {
    if (overview == null && incidents.isEmpty() && tasks.isEmpty() && iot == null) return null
    val services = overview?.services.orEmpty()
    val devices = iot?.devices.orEmpty()
    return TrendSample(
        day = LocalDate.now().toString(),
        serviceTotal = services.size,
        healthyServices = services.count { it.state == "healthy" },
        activeIncidents = incidents.count { it.status != "resolved" },
        pendingTasks = tasks.count { it.status in setOf("action_required", "failed", "pending") },
        deviceTotal = devices.size,
        onlineDevices = devices.count(DeviceInfo::online),
    )
}

internal fun TodoTask.toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("completed", completed)
    .put("dueAt", dueAt ?: JSONObject.NULL)
    .put("priority", priority)
    .put("recurrence", recurrence)
    .put("courseRef", courseRef?.let { JSONObject().put("id", it.id).put("name", it.name) } ?: JSONObject.NULL)
    .put("reminderAt", reminderAt ?: JSONObject.NULL)
    .put("reminderStatus", reminderStatus)
    .put("remindedAt", remindedAt ?: JSONObject.NULL)
    .put("createdAt", createdAt)
    .put("updatedAt", updatedAt)

internal fun TodoMutation.toJson(): JSONObject = JSONObject().put("type", type).apply {
    task?.let { put("task", it.toJson()) }
    id?.let { put("id", it) }
}

private fun TodoSnapshot.toJson(): JSONObject = JSONObject()
    .put("revision", revision)
    .put("tasks", JSONArray().apply { tasks.forEach { put(it.toJson()) } })

private fun AppAlertRecord.toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("type", type)
    .put("sourceId", sourceId)
    .put("title", title)
    .put("body", body)
    .put("createdAt", createdAt)
    .put("read", read)
    .put("snoozedUntil", snoozedUntil ?: JSONObject.NULL)

private fun TrendSample.toJson(): JSONObject = JSONObject()
    .put("day", day)
    .put("serviceTotal", serviceTotal)
    .put("healthyServices", healthyServices)
    .put("activeIncidents", activeIncidents)
    .put("pendingTasks", pendingTasks)
    .put("deviceTotal", deviceTotal)
    .put("onlineDevices", onlineDevices)

internal fun JSONObject.toTodoTask(): TodoTask? {
    val id = optString("id").trim()
    val title = optString("title").trim()
    if (id.isBlank() || title.isBlank()) return null
    val course = optJSONObject("courseRef")?.let {
        TodoCourseRef(it.optString("id"), it.optString("name")).takeIf { ref -> ref.id.isNotBlank() || ref.name.isNotBlank() }
    }
    return TodoTask(
        id = id,
        title = title,
        completed = optBoolean("completed"),
        dueAt = nullableLong("dueAt"),
        priority = optString("priority", "normal"),
        recurrence = optString("recurrence", "none"),
        courseRef = course,
        reminderAt = nullableLong("reminderAt"),
        reminderStatus = optString("reminderStatus", "pending"),
        remindedAt = nullableLong("remindedAt"),
        createdAt = optLong("createdAt", System.currentTimeMillis()),
        updatedAt = optLong("updatedAt", System.currentTimeMillis()),
    )
}

private fun JSONObject.toTodoSnapshot(): TodoSnapshot = TodoSnapshot(
    tasks = optJSONArray("tasks").objects().mapNotNull(JSONObject::toTodoTask),
    revision = optInt("revision", 0).coerceAtLeast(0),
)

private fun JSONObject.toTodoMutation(): TodoMutation? {
    val type = optString("type")
    return when (type) {
        "upsert" -> optJSONObject("task")?.toTodoTask()?.let { TodoMutation(type, task = it) }
        "delete" -> optString("id").takeIf(String::isNotBlank)?.let { TodoMutation(type, id = it) }
        else -> null
    }
}

private fun JSONObject.toAlertRecord(): AppAlertRecord? {
    val id = optString("id")
    if (id.isBlank()) return null
    return AppAlertRecord(
        id = id,
        type = optString("type", "system"),
        sourceId = optString("sourceId"),
        title = optString("title"),
        body = optString("body"),
        createdAt = optLong("createdAt"),
        read = optBoolean("read"),
        snoozedUntil = nullableLong("snoozedUntil"),
    )
}

private fun JSONObject.toTrendSample(): TrendSample? {
    val day = optString("day")
    if (day.isBlank()) return null
    return TrendSample(
        day = day,
        serviceTotal = optInt("serviceTotal"),
        healthyServices = optInt("healthyServices"),
        activeIncidents = optInt("activeIncidents"),
        pendingTasks = optInt("pendingTasks"),
        deviceTotal = optInt("deviceTotal"),
        onlineDevices = optInt("onlineDevices"),
    )
}

private fun parseObject(raw: String): JSONObject? = runCatching { JSONObject(raw) }.getOrNull()

private fun parseArray(raw: String): JSONArray = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }

private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
}

private fun JSONObject.nullableLong(key: String): Long? =
    takeIf { has(key) && !isNull(key) }?.optLong(key)?.takeIf { it > 0L }
