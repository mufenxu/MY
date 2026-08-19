package cn.pxyb.mycontrol.assistant

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.TodoSnapshot
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

enum class AssistantDestination(val deepLinkValue: String) {
    Today("today"),
    Notifications("notifications"),
    Operations("operations"),
    Profile("profile"),
}

enum class AssistantPriority { Normal, Attention, Critical }

@Immutable
data class AssistantAction(
    val id: String,
    val title: String,
    val detail: String,
    val destination: AssistantDestination,
    val priority: AssistantPriority = AssistantPriority.Normal,
)

@Immutable
data class PersonalAssistantSnapshot(
    val nextAction: AssistantAction,
    val morningBrief: String,
    val eveningBrief: String,
    val classFocusUntilMillis: Long? = null,
    val generatedAtMillis: Long,
)

enum class DailyBriefPeriod { Morning, Evening }

data class DailyBriefSchedule(
    val period: DailyBriefPeriod,
    val triggerAtMillis: Long,
)

fun buildPersonalAssistantSnapshot(
    nowMillis: Long = System.currentTimeMillis(),
    zoneId: ZoneId = ZoneId.systemDefault(),
    timetable: CampusTimetable? = null,
    todos: TodoSnapshot = TodoSnapshot(),
    incidents: List<IncidentInfo> = emptyList(),
    alerts: List<AppAlertRecord> = emptyList(),
    resources: List<ResourceExpiry> = emptyList(),
    backup: BackupQuality? = null,
    security: SecurityData? = null,
): PersonalAssistantSnapshot {
    val now = Instant.ofEpochMilli(nowMillis).atZone(zoneId)
    val courses = todayCourses(timetable, now.toLocalDate())
    val timedCourses = courses.mapNotNull { course ->
        parseCourseRange(now.toLocalDate(), course.timeRange, zoneId)?.let { range -> course to range }
    }
    val currentCourse = timedCourses.firstOrNull { (_, range) -> nowMillis in range.first until range.second }
    val nextCourse = timedCourses.firstOrNull { (_, range) -> range.first > nowMillis }
    val pendingTodos = todos.tasks.filterNot { it.completed }
    val overdueTodo = pendingTodos.filter { it.dueAt != null && it.dueAt < nowMillis }
        .minByOrNull { it.dueAt ?: Long.MAX_VALUE }
    val dueSoonTodo = pendingTodos.filter { it.dueAt != null && it.dueAt >= nowMillis }
        .minByOrNull { it.dueAt ?: Long.MAX_VALUE }
    val activeIncident = incidents.filter { it.status != "resolved" }
        .minWithOrNull(compareBy<IncidentInfo> { incidentPriority(it.severity) }.thenBy { it.openedAt.orEmpty() })
    val upcomingResource = resources.mapNotNull { resource ->
        runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull()?.let { date ->
            resource to ChronoUnit.DAYS.between(now.toLocalDate(), date).toInt()
        }
    }.filter { it.second <= 7 }.minByOrNull { it.second }

    val nextAction = when {
        activeIncident != null -> AssistantAction(
            id = "incident:${activeIncident.id}",
            title = activeIncident.title,
            detail = activeIncident.description.ifBlank { "有系统异常需要确认处理" },
            destination = AssistantDestination.Notifications,
            priority = if (activeIncident.severity.equals("critical", true)) AssistantPriority.Critical else AssistantPriority.Attention,
        )
        overdueTodo != null -> AssistantAction(
            id = "todo:${overdueTodo.id}",
            title = overdueTodo.title,
            detail = "待办已经到期，建议优先处理",
            destination = AssistantDestination.Today,
            priority = AssistantPriority.Attention,
        )
        currentCourse != null -> AssistantAction(
            id = "course:${currentCourse.first.id}",
            title = "${currentCourse.first.courseName}进行中",
            detail = listOf(currentCourse.first.timeRange, currentCourse.first.location).filter(String::isNotBlank).joinToString(" · "),
            destination = AssistantDestination.Today,
        )
        nextCourse != null -> AssistantAction(
            id = "course:${nextCourse.first.id}",
            title = "下一节：${nextCourse.first.courseName}",
            detail = listOf(nextCourse.first.timeRange, nextCourse.first.location).filter(String::isNotBlank).joinToString(" · "),
            destination = AssistantDestination.Today,
        )
        dueSoonTodo != null -> AssistantAction(
            id = "todo:${dueSoonTodo.id}",
            title = dueSoonTodo.title,
            detail = "下一项待办",
            destination = AssistantDestination.Today,
        )
        upcomingResource != null -> AssistantAction(
            id = "resource:${upcomingResource.first.id}",
            title = upcomingResource.first.name,
            detail = when {
                upcomingResource.second < 0 -> "已过期 ${-upcomingResource.second} 天"
                upcomingResource.second == 0 -> "今天到期"
                else -> "${upcomingResource.second} 天后到期"
            },
            destination = AssistantDestination.Operations,
            priority = AssistantPriority.Attention,
        )
        backup != null && backup.rpoState != "healthy" -> AssistantAction(
            id = "backup",
            title = "备份状态需要关注",
            detail = backup.ageHours?.let { "距上次有效备份 ${"%.1f".format(it)} 小时" } ?: "尚无有效备份",
            destination = AssistantDestination.Operations,
            priority = AssistantPriority.Attention,
        )
        security != null && security.recoveryCodesRemaining in 0..2 -> AssistantAction(
            id = "recovery-codes",
            title = "恢复码即将用尽",
            detail = "当前剩余 ${security.recoveryCodesRemaining} 个，建议及时补充",
            destination = AssistantDestination.Profile,
            priority = AssistantPriority.Attention,
        )
        alerts.any { !it.read } -> AssistantAction(
            id = "unread-alerts",
            title = "有 ${alerts.count { !it.read }} 条未读提醒",
            detail = "打开通知中心集中处理",
            destination = AssistantDestination.Notifications,
        )
        else -> AssistantAction(
            id = "all-clear",
            title = "今天安排平稳",
            detail = "暂时没有需要立即处理的事项",
            destination = AssistantDestination.Today,
        )
    }

    val nextCourseText = nextCourse?.first?.let { "下一节 ${it.courseName} ${it.timeRange}" }
        ?: currentCourse?.first?.let { "正在上 ${it.courseName}" }
        ?: "今天暂无后续课程"
    val todoText = if (pendingTodos.isEmpty()) "待办已清空" else "${pendingTodos.size} 项待办未完成"
    val attentionCount = incidents.count { it.status != "resolved" } + alerts.count { !it.read }
    val attentionText = if (attentionCount == 0) "没有新增提醒" else "$attentionCount 条事项需要关注"

    return PersonalAssistantSnapshot(
        nextAction = nextAction,
        morningBrief = listOf(nextCourseText, todoText, attentionText).joinToString("；"),
        eveningBrief = listOf(todoText, attentionText, nextCourseText).joinToString("；"),
        classFocusUntilMillis = currentCourse?.second?.second,
        generatedAtMillis = nowMillis,
    )
}

fun buildGuardianAlerts(
    nowMillis: Long = System.currentTimeMillis(),
    zoneId: ZoneId = ZoneId.systemDefault(),
    backup: BackupQuality? = null,
    security: SecurityData? = null,
): List<AppAlertRecord> {
    val date = Instant.ofEpochMilli(nowMillis).atZone(zoneId).toLocalDate()
    return buildList {
        if (backup != null && (backup.rpoState != "healthy" || backup.ageHours?.let { it > backup.rpoHours } == true)) {
            add(
                AppAlertRecord(
                    id = "guardian:backup:$date",
                    type = "backup",
                    sourceId = "backup",
                    title = "备份状态需要关注",
                    body = backup.ageHours?.let { "距上次有效备份 ${"%.1f".format(it)} 小时，已超过 RPO ${backup.rpoHours} 小时。" }
                        ?: "当前没有可确认的有效备份。",
                    createdAt = nowMillis,
                    priority = "high",
                ),
            )
        }
        if (security != null && security.recoveryCodesRemaining in 0..2) {
            add(
                AppAlertRecord(
                    id = "guardian:recovery:${security.recoveryCodesRemaining}",
                    type = "security",
                    sourceId = "recovery-codes",
                    title = "账号恢复码即将用尽",
                    body = "当前仅剩 ${security.recoveryCodesRemaining} 个恢复码，请在账号安全中及时补充。",
                    createdAt = nowMillis,
                    priority = "high",
                ),
            )
        }
    }
}

fun shouldSuppressNotification(
    settings: AlertPreferences,
    nowMillis: Long = System.currentTimeMillis(),
    classFocusUntilMillis: Long? = null,
    critical: Boolean,
    zoneId: ZoneId = ZoneId.systemDefault(),
): Boolean {
    if (critical) return false
    if (settings.classFocusEnabled && classFocusUntilMillis?.let { nowMillis < it } == true) return true
    if (!settings.quietHoursEnabled) return false
    val hour = Instant.ofEpochMilli(nowMillis).atZone(zoneId).hour
    return when {
        settings.quietStartHour == settings.quietEndHour -> true
        settings.quietStartHour < settings.quietEndHour -> hour in settings.quietStartHour until settings.quietEndHour
        else -> hour >= settings.quietStartHour || hour < settings.quietEndHour
    }
}

fun sharedTodoTitle(subject: String?, text: String?): String {
    val parts = listOf(subject, text).mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }.distinct()
    return parts.joinToString(" · ").take(MAX_SHARED_TODO_LENGTH)
}

fun nextDailyBriefSchedule(
    nowMillis: Long = System.currentTimeMillis(),
    zoneId: ZoneId = ZoneId.systemDefault(),
    morningHour: Int,
    eveningHour: Int,
): DailyBriefSchedule {
    val now = Instant.ofEpochMilli(nowMillis).atZone(zoneId)
    val morning = nextOccurrence(now, morningHour.coerceIn(0, 23))
    val evening = nextOccurrence(now, eveningHour.coerceIn(0, 23))
    val target = if (morning.isBefore(evening)) morning else evening
    return DailyBriefSchedule(
        period = if (target == morning) DailyBriefPeriod.Morning else DailyBriefPeriod.Evening,
        triggerAtMillis = target.toInstant().toEpochMilli(),
    )
}

private fun nextOccurrence(now: ZonedDateTime, hour: Int): ZonedDateTime {
    val today = now.toLocalDate().atTime(hour, 0).atZone(now.zone)
    return if (today.isAfter(now)) today else today.plusDays(1)
}

private fun todayCourses(timetable: CampusTimetable?, date: LocalDate): List<CampusCourse> {
    val week = timetable?.schoolCalendar?.currentWeek
        ?: Regex("第(\\d+)周").find(timetable?.currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
    return timetable?.courses.orEmpty()
        .filter { it.day == date.dayOfWeek.value && (week == null || it.weeks.isEmpty() || week in it.weeks) }
        .sortedBy { it.startSection }
}

private fun parseCourseRange(date: LocalDate, value: String, zoneId: ZoneId): Pair<Long, Long>? {
    val matches = Regex("(\\d{1,2}):(\\d{2})").findAll(value).toList()
    if (matches.size < 2) return null
    fun time(match: MatchResult): LocalTime? = runCatching {
        LocalTime.of(match.groupValues[1].toInt(), match.groupValues[2].toInt())
    }.getOrNull()
    val start = time(matches[0]) ?: return null
    val end = time(matches[1]) ?: return null
    return LocalDateTime.of(date, start).atZone(zoneId).toInstant().toEpochMilli() to
        LocalDateTime.of(date, end).atZone(zoneId).toInstant().toEpochMilli()
}

private fun incidentPriority(value: String): Int = when (value.lowercase()) {
    "critical" -> 0
    "high" -> 1
    "warning" -> 2
    else -> 3
}

private const val MAX_SHARED_TODO_LENGTH = 500
