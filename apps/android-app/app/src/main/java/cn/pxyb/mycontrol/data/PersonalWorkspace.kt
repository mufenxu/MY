package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

import android.content.Context
import cn.pxyb.mycontrol.assistant.AssistantAction
import cn.pxyb.mycontrol.assistant.AssistantDestination
import cn.pxyb.mycontrol.assistant.AssistantPriority
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

@Immutable
data class TodoCourseRef(
    val id: String,
    val name: String,
)

@Immutable
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

@Immutable
data class TodoSnapshot(
    val tasks: List<TodoTask> = emptyList(),
    val revision: Int = 0,
)

@Immutable
data class TodoMutation(
    val type: String,
    val task: TodoTask? = null,
    val id: String? = null,
)

@Immutable
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

@Immutable
data class CampusCalendarEvent(
    val startDate: String,
    val endDate: String,
    val label: String,
)

@Immutable
data class CampusAcademicCalendar(
    val academicYear: String = "",
    val season: String = "",
    val termLabel: String = "",
    val termStartDate: String = "",
    val termEndDate: String = "",
    val teachingWeeks: Int? = null,
    val weekFirst: Int = 1,
    val currentWeek: Int? = null,
    val isHoliday: Boolean = false,
    val statusText: String = "",
    val events: List<CampusCalendarEvent> = emptyList(),
)

@Immutable
data class CampusTimetable(
    val currentCalendarText: String = "",
    val termText: String = "",
    val schoolCalendar: CampusAcademicCalendar? = null,
    val generatedAt: String? = null,
    val live: Boolean = false,
    val staleReason: String? = null,
    val courses: List<CampusCourse> = emptyList(),
)

@Immutable
data class CampusGpa(
    val overall: String? = null,
    val core: String? = null,
    val required: String? = null,
    val degree: String? = null,
)

@Immutable
data class CampusSectionTime(
    val section: Int,
    val start: String,
    val end: String,
)

@Immutable
data class CampusFreeClassroomOption(
    val value: String,
    val name: String,
)

@Immutable
data class CampusFreeClassroomRoom(
    val room: String,
    val floor: String? = null,
    val seats: Int? = null,
)

@Immutable
data class CampusFreeClassroomBuilding(
    val number: String,
    val name: String,
    val roomCount: Int,
    val seats: Int,
    val rooms: List<CampusFreeClassroomRoom>,
)

@Immutable
data class CampusFreeClassrooms(
    val rooms: Int? = null,
    val seats: Int? = null,
    val dayLabel: String? = null,
    val date: String? = null,
    val weekday: String? = null,
    val sections: List<Int> = emptyList(),
    val sectionTimes: List<CampusSectionTime> = emptyList(),
    val building: CampusFreeClassroomOption? = null,
    val buildingOptions: List<CampusFreeClassroomOption> = emptyList(),
    val buildings: List<CampusFreeClassroomBuilding> = emptyList(),
    val buildingCount: Int? = null,
)

@Immutable
data class CampusOverview(
    val gpa: CampusGpa? = null,
    val freeClassrooms: CampusFreeClassrooms? = null,
    val cardBalance: String? = null,
    val waterCode: String? = null,
    val dormitory: String? = null,
    val energyBalance: String? = null,
    val energyRoom: String? = null,
)

@Immutable
data class CampusDashboard(
    val timetable: CampusTimetable,
    val overview: CampusOverview,
)

@Immutable
data class ResourceExpiry(
    val id: String,
    val type: String,
    val name: String,
    val expiresAt: String,
    val advanceNoticeDays: Int,
)

@Immutable
data class AppAlertRecord(
    val id: String,
    val type: String,
    val sourceId: String,
    val title: String,
    val body: String,
    val createdAt: Long,
    val read: Boolean = false,
    val snoozedUntil: Long? = null,
    val origin: String = "local",
    val priority: String = "normal",
    val contentKind: String = "text",
    val contentBlocks: List<AppNotificationBlock> = emptyList(),
    val actions: List<AppNotificationAction> = emptyList(),
)

@Immutable
data class AlertPreferences(
    val quietHoursEnabled: Boolean = false,
    val quietStartHour: Int = 22,
    val quietEndHour: Int = 7,
    val dailyBriefEnabled: Boolean = true,
    val morningBriefHour: Int = 7,
    val eveningBriefHour: Int = 21,
    val classFocusEnabled: Boolean = false,
    val severityFilter: String = "all",
    val incidentAlerts: Boolean = true,
    val iotAlerts: Boolean = true,
    val campusAlerts: Boolean = true,
    val backupAlerts: Boolean = true,
)

@Immutable
data class QuickScenePreference(
    val sceneId: String,
    val sceneName: String,
)

@Immutable
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
    private val codec = EncryptedPreferenceCodec(preferences, KEY_ALIAS)
    @Volatile private var accountScope: String? = null

    fun setAccount(username: String?) {
        accountScope = accountStorageScope(username)
    }

    fun readTodoSnapshot(): TodoSnapshot = scopedKey(KEY_TODOS)?.let { key -> codec.read(key) }
        ?.let(::parseObject)
        ?.toTodoSnapshot()
        ?: TodoSnapshot()

    fun writeTodoSnapshot(snapshot: TodoSnapshot) {
        scopedKey(KEY_TODOS)?.let { key -> codec.write(key, snapshot.toJson().toString()) }
    }

    fun readPendingTodoMutations(): List<TodoMutation> = scopedKey(KEY_TODO_QUEUE)?.let { key -> codec.read(key) }
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toTodoMutation)

    fun writePendingTodoMutations(mutations: List<TodoMutation>) {
        scopedKey(KEY_TODO_QUEUE)?.let { key ->
            codec.write(key, JSONArray().apply { mutations.takeLast(MAX_PENDING_MUTATIONS).forEach { put(it.toJson()) } }.toString())
        }
    }

    fun readAlerts(): List<AppAlertRecord> = scopedKey(KEY_ALERTS)?.let { key -> codec.read(key) }
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toAlertRecord)
        .sortedByDescending(AppAlertRecord::createdAt)

    fun writeAlerts(alerts: List<AppAlertRecord>) {
        scopedKey(KEY_ALERTS)?.let { key ->
            codec.write(key, JSONArray().apply { alerts.sortedByDescending(AppAlertRecord::createdAt).take(MAX_ALERTS).forEach { put(it.toJson()) } }.toString())
        }
    }

    fun appendAlerts(alerts: List<AppAlertRecord>) {
        if (alerts.isEmpty()) return
        val existing = readAlerts().associateBy(AppAlertRecord::id).toMutableMap()
        alerts.forEach { existing[it.id] = it }
        writeAlerts(existing.values.toList())
    }

    fun readAlertPreferences(): AlertPreferences = AlertPreferences(
        quietHoursEnabled = scopedKey(KEY_QUIET_ENABLED)?.let { preferences.getBoolean(it, false) } ?: false,
        quietStartHour = scopedKey(KEY_QUIET_START)?.let { preferences.getInt(it, 22) }?.coerceIn(0, 23) ?: 22,
        quietEndHour = scopedKey(KEY_QUIET_END)?.let { preferences.getInt(it, 7) }?.coerceIn(0, 23) ?: 7,
        dailyBriefEnabled = scopedKey(KEY_DAILY_BRIEF_ENABLED)?.let { preferences.getBoolean(it, true) } ?: true,
        morningBriefHour = scopedKey(KEY_MORNING_BRIEF_HOUR)?.let { preferences.getInt(it, 7) }?.coerceIn(0, 23) ?: 7,
        eveningBriefHour = scopedKey(KEY_EVENING_BRIEF_HOUR)?.let { preferences.getInt(it, 21) }?.coerceIn(0, 23) ?: 21,
        classFocusEnabled = scopedKey(KEY_CLASS_FOCUS_ENABLED)?.let { preferences.getBoolean(it, false) } ?: false,
        severityFilter = scopedKey(KEY_SEVERITY_FILTER)?.let { preferences.getString(it, "all") } ?: "all",
        incidentAlerts = scopedKey(KEY_INCIDENT_ALERTS)?.let { preferences.getBoolean(it, true) } ?: true,
        iotAlerts = scopedKey(KEY_IOT_ALERTS)?.let { preferences.getBoolean(it, true) } ?: true,
        campusAlerts = scopedKey(KEY_CAMPUS_ALERTS)?.let { preferences.getBoolean(it, true) } ?: true,
        backupAlerts = scopedKey(KEY_BACKUP_ALERTS)?.let { preferences.getBoolean(it, true) } ?: true,
    )

    fun writeAlertPreferences(value: AlertPreferences) {
        val scope = accountScope ?: return
        preferences.edit()
            .putBoolean("account_${scope}_$KEY_QUIET_ENABLED", value.quietHoursEnabled)
            .putInt("account_${scope}_$KEY_QUIET_START", value.quietStartHour.coerceIn(0, 23))
            .putInt("account_${scope}_$KEY_QUIET_END", value.quietEndHour.coerceIn(0, 23))
            .putBoolean("account_${scope}_$KEY_DAILY_BRIEF_ENABLED", value.dailyBriefEnabled)
            .putInt("account_${scope}_$KEY_MORNING_BRIEF_HOUR", value.morningBriefHour.coerceIn(0, 23))
            .putInt("account_${scope}_$KEY_EVENING_BRIEF_HOUR", value.eveningBriefHour.coerceIn(0, 23))
            .putBoolean("account_${scope}_$KEY_CLASS_FOCUS_ENABLED", value.classFocusEnabled)
            .putString("account_${scope}_$KEY_SEVERITY_FILTER", value.severityFilter)
            .putBoolean("account_${scope}_$KEY_INCIDENT_ALERTS", value.incidentAlerts)
            .putBoolean("account_${scope}_$KEY_IOT_ALERTS", value.iotAlerts)
            .putBoolean("account_${scope}_$KEY_CAMPUS_ALERTS", value.campusAlerts)
            .putBoolean("account_${scope}_$KEY_BACKUP_ALERTS", value.backupAlerts)
            .apply()
    }

    fun readAssistantSnapshot(): PersonalAssistantSnapshot? = scopedKey(KEY_ASSISTANT_SNAPSHOT)
        ?.let(codec::read)
        ?.let(::parseObject)
        ?.toAssistantSnapshot()

    fun writeAssistantSnapshot(snapshot: PersonalAssistantSnapshot) {
        scopedKey(KEY_ASSISTANT_SNAPSHOT)?.let { key -> codec.write(key, snapshot.toJson().toString()) }
    }

    fun readNotificationMutations(): List<NotificationMutation> = scopedKey(KEY_NOTIFICATION_QUEUE)
        ?.let(codec::read)
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toNotificationMutation)

    fun writeNotificationMutations(mutations: List<NotificationMutation>) {
        scopedKey(KEY_NOTIFICATION_QUEUE)?.let { key ->
            codec.write(
                key,
                JSONArray().apply { mutations.takeLast(MAX_PENDING_MUTATIONS).forEach { put(it.toJson()) } }.toString(),
            )
        }
    }

    fun readQuickScene(): QuickScenePreference? = scopedKey(KEY_QUICK_SCENE)
        ?.let(codec::read)
        ?.let(::parseObject)
        ?.let { json ->
            val id = json.optString("sceneId").trim()
            val name = json.optString("sceneName").trim()
            if (id.isBlank() || name.isBlank()) null else QuickScenePreference(id, name)
        }

    fun writeQuickScene(value: QuickScenePreference?) {
        val key = scopedKey(KEY_QUICK_SCENE) ?: return
        if (value == null) {
            preferences.edit().remove(key).apply()
        } else {
            codec.write(key, JSONObject().put("sceneId", value.sceneId).put("sceneName", value.sceneName).toString())
        }
    }

    fun readTrendSamples(): List<TrendSample> = scopedKey(KEY_TRENDS)?.let { key -> codec.read(key) }
        ?.let(::parseArray)
        .objects()
        .mapNotNull(JSONObject::toTrendSample)
        .sortedBy(TrendSample::day)

    fun upsertTrendSample(sample: TrendSample) {
        val samples = readTrendSamples().associateBy(TrendSample::day).toMutableMap()
        samples[sample.day] = sample
        val normalized = samples.values.sortedBy(TrendSample::day).takeLast(MAX_TREND_DAYS)
        scopedKey(KEY_TRENDS)?.let { key -> codec.write(key, JSONArray().apply { normalized.forEach { put(it.toJson()) } }.toString()) }
    }

    fun sizeInBytes(): Long {
        val scope = accountScope ?: return 0L
        val prefix = "account_${scope}_"
        return preferences.all.entries
            .filter { it.key.startsWith(prefix) }
            .sumOf { (_, value) ->
                when (value) {
                    is String -> value.toByteArray(Charsets.UTF_8).size.toLong()
                    is Int -> 4L
                    is Long -> 8L
                    is Boolean -> 1L
                    else -> 16L
                }
            }
    }

    fun clearAccountData() {
        val scope = accountScope ?: return
        val prefix = "account_${scope}_"
        preferences.edit().apply {
            preferences.all.keys.filter { it.startsWith(prefix) }.forEach(::remove)
        }.apply()
    }

    private fun scopedKey(base: String): String? = accountScope?.let { "account_${it}_$base" }

    private companion object {
        const val PREFERENCES_NAME = "personal_workspace"
        const val KEY_ALIAS = "my_control_personal_workspace_v1"
        const val KEY_TODOS = "todos"
        const val KEY_TODO_QUEUE = "todo_queue"
        const val KEY_ALERTS = "alerts"
        const val KEY_QUIET_ENABLED = "quiet_enabled"
        const val KEY_QUIET_START = "quiet_start"
        const val KEY_QUIET_END = "quiet_end"
        const val KEY_DAILY_BRIEF_ENABLED = "daily_brief_enabled"
        const val KEY_MORNING_BRIEF_HOUR = "morning_brief_hour"
        const val KEY_EVENING_BRIEF_HOUR = "evening_brief_hour"
        const val KEY_CLASS_FOCUS_ENABLED = "class_focus_enabled"
        const val KEY_SEVERITY_FILTER = "severity_filter"
        const val KEY_INCIDENT_ALERTS = "incident_alerts"
        const val KEY_IOT_ALERTS = "iot_alerts"
        const val KEY_CAMPUS_ALERTS = "campus_alerts"
        const val KEY_BACKUP_ALERTS = "backup_alerts"
        const val KEY_TRENDS = "trends"
        const val KEY_ASSISTANT_SNAPSHOT = "assistant_snapshot"
        const val KEY_NOTIFICATION_QUEUE = "notification_queue"
        const val KEY_QUICK_SCENE = "quick_scene"
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
    .put("origin", origin)
    .put("priority", priority)
    .put("contentKind", contentKind)
    .put("contentBlocks", JSONArray().apply { contentBlocks.forEach { put(it.toJson()) } })
    .put("actions", JSONArray().apply { actions.forEach { put(it.toJson()) } })

private fun TrendSample.toJson(): JSONObject = JSONObject()
    .put("day", day)
    .put("serviceTotal", serviceTotal)
    .put("healthyServices", healthyServices)
    .put("activeIncidents", activeIncidents)
    .put("pendingTasks", pendingTasks)
    .put("deviceTotal", deviceTotal)
    .put("onlineDevices", onlineDevices)

private fun PersonalAssistantSnapshot.toJson(): JSONObject = JSONObject()
    .put("nextAction", JSONObject()
        .put("id", nextAction.id)
        .put("title", nextAction.title)
        .put("detail", nextAction.detail)
        .put("destination", nextAction.destination.name)
        .put("priority", nextAction.priority.name))
    .put("morningBrief", morningBrief)
    .put("eveningBrief", eveningBrief)
    .put("classFocusUntilMillis", classFocusUntilMillis ?: JSONObject.NULL)
    .put("generatedAtMillis", generatedAtMillis)

private fun NotificationMutation.toJson(): JSONObject = JSONObject()
    .put("type", type.name)
    .put("alertId", alertId)
    .put("snoozedUntilMillis", snoozedUntilMillis ?: JSONObject.NULL)

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
        origin = optString("origin", "local"),
        priority = optString("priority", "normal"),
        contentKind = optString("contentKind", "text"),
        contentBlocks = optJSONArray("contentBlocks").objects().mapNotNull(JSONObject::toAppNotificationBlock),
        actions = optJSONArray("actions").objects().mapNotNull(JSONObject::toAppNotificationAction),
    )
}

private fun AppNotificationBlock.toJson(): JSONObject = JSONObject()
    .put("type", type)
    .put("text", text)
    .put("markdown", markdown)
    .put("items", JSONArray().apply { items.forEach { put(JSONObject().put("key", it.key).put("value", it.value)) } })
    .put("listItems", JSONArray().apply { listItems.forEach { put(JSONObject().put("title", it.title).put("description", it.description)) } })
    .put("url", url)
    .put("alt", alt)
    .put("value", value ?: JSONObject.NULL)
    .put("label", label)
    .put("fileName", fileName)
    .put("mediaType", mediaType)

private fun AppNotificationAction.toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("label", label)
    .put("deepLink", deepLink)

private fun JSONObject.toAppNotificationBlock(): AppNotificationBlock? {
    val type = optString("type").takeIf(String::isNotBlank) ?: return null
    val items = optJSONArray("items").objects().mapNotNull { item ->
        val key = item.optString("key").trim()
        if (key.isBlank()) null else AppNotificationKeyValue(key, item.optString("value"))
    }
    val listItems = optJSONArray("listItems").objects().mapNotNull { item ->
        val title = item.optString("title").trim()
        if (title.isBlank()) null else AppNotificationListItem(title, item.optString("description"))
    }
    return AppNotificationBlock(
        type = type,
        text = optString("text"),
        markdown = optString("markdown"),
        items = items,
        listItems = listItems,
        url = optString("url"),
        alt = optString("alt"),
        value = if (has("value") && !isNull("value")) optInt("value") else null,
        label = optString("label"),
        fileName = optString("fileName"),
        mediaType = optString("mediaType"),
    )
}

private fun JSONObject.toAppNotificationAction(): AppNotificationAction? {
    val id = optString("id").trim()
    val label = optString("label").trim()
    val deepLink = optString("deepLink").trim()
    return if (id.isBlank() || label.isBlank() || deepLink.isBlank()) null else AppNotificationAction(id, label, deepLink)
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

private fun JSONObject.toAssistantSnapshot(): PersonalAssistantSnapshot? {
    val action = optJSONObject("nextAction") ?: return null
    val id = action.optString("id").trim()
    val title = action.optString("title").trim()
    if (id.isBlank() || title.isBlank()) return null
    val destination = runCatching { AssistantDestination.valueOf(action.optString("destination")) }.getOrNull() ?: return null
    val priority = runCatching { AssistantPriority.valueOf(action.optString("priority")) }.getOrDefault(AssistantPriority.Normal)
    return PersonalAssistantSnapshot(
        nextAction = AssistantAction(
            id = id,
            title = title,
            detail = action.optString("detail"),
            destination = destination,
            priority = priority,
        ),
        morningBrief = optString("morningBrief"),
        eveningBrief = optString("eveningBrief"),
        classFocusUntilMillis = nullableLong("classFocusUntilMillis"),
        generatedAtMillis = optLong("generatedAtMillis"),
    )
}

private fun JSONObject.toNotificationMutation(): NotificationMutation? {
    val type = runCatching { NotificationMutationType.valueOf(optString("type")) }.getOrNull() ?: return null
    val alertId = optString("alertId").trim().takeIf(String::isNotBlank) ?: return null
    return NotificationMutation(type, alertId, nullableLong("snoozedUntilMillis"))
}

private fun parseObject(raw: String): JSONObject? = runCatching { JSONObject(raw) }.getOrNull()

private fun parseArray(raw: String): JSONArray = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }

private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
}

private fun JSONObject.nullableLong(key: String): Long? =
    takeIf { has(key) && !isNull(key) }?.optLong(key)?.takeIf { it > 0L }
