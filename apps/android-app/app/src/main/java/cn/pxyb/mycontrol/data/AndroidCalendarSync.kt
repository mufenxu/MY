package cn.pxyb.mycontrol.data

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters

data class CalendarSyncResult(
    val courseCount: Int,
    val todoCount: Int,
    val resourceCount: Int,
    val skippedCourseCount: Int,
) {
    val totalCount: Int get() = courseCount + todoCount + resourceCount

    fun message(): String = buildString {
        append("已同步 $totalCount 项到 Android 日历")
        append("（课程 $courseCount、待办 $todoCount、到期提醒 $resourceCount）")
        if (skippedCourseCount > 0) append("；$skippedCourseCount 节课程因时间或周次不完整未同步")
    }
}

private data class AcademicCalendarAnchor(
    val currentWeek: Int,
    val termStart: LocalDate,
)

private fun resolveAcademicCalendarAnchor(
    timetable: CampusTimetable,
    today: LocalDate = LocalDate.now(),
): AcademicCalendarAnchor? {
    val schoolCalendar = timetable.schoolCalendar
    val officialTermStart = schoolCalendar?.termStartDate
        ?.takeIf(String::isNotBlank)
        ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    if (officialTermStart != null) {
        val elapsedDays = ChronoUnit.DAYS.between(officialTermStart, today)
        val officialWeek = schoolCalendar?.currentWeek
        val currentWeek = officialWeek ?: if (elapsedDays < 0) 1 else (elapsedDays / 7 + 1).toInt()
        return AcademicCalendarAnchor(currentWeek = currentWeek, termStart = officialTermStart)
    }

    val calendarText = "${timetable.currentCalendarText} ${timetable.termText}"
    val explicitWeek = Regex("第\\s*(\\d+)\\s*周")
        .find(calendarText)
        ?.groupValues
        ?.getOrNull(1)
        ?.toIntOrNull()
        ?.takeIf { it > 0 }
    if (explicitWeek != null) {
        val currentMonday = today.with(TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
        return AcademicCalendarAnchor(
            currentWeek = explicitWeek,
            termStart = currentMonday.minusWeeks((explicitWeek - 1).toLong()),
        )
    }

    val termMatch = Regex("(\\d{4})\\s*-\\s*(\\d{4}).*?([春秋])").find(calendarText) ?: return null
    val startYear = termMatch.groupValues[1].toIntOrNull() ?: return null
    val endYear = termMatch.groupValues[2].toIntOrNull() ?: return null
    val termStartCandidate = when (termMatch.groupValues[3]) {
        "秋" -> LocalDate.of(startYear, 9, 1)
        "春" -> LocalDate.of(endYear, 2, 20)
        else -> return null
    }
    val termStart = termStartCandidate.with(TemporalAdjusters.nextOrSame(java.time.DayOfWeek.MONDAY))
    val elapsedDays = ChronoUnit.DAYS.between(termStart, today)
    val currentWeek = if (elapsedDays < 0) 1 else (elapsedDays / 7 + 1).toInt()
    return AcademicCalendarAnchor(currentWeek = currentWeek, termStart = termStart)
}

class AndroidCalendarSync(context: Context) {
    private val appContext = context.applicationContext
    private val resolver = appContext.contentResolver

    fun sync(
        accountUsername: String?,
        timetable: CampusTimetable?,
        todos: TodoSnapshot,
        resources: List<ResourceExpiry>,
    ): CalendarSyncResult {
        requireCalendarPermission()
        check(timetable != null) { "课表尚未同步，请先刷新今日工作台后再同步。" }
        val loadedTimetable = requireNotNull(timetable)
        val accountScope = accountStorageScope(accountUsername)
            ?: error("当前登录账号不可用，请重新登录后再试。")
        val academicAnchor = resolveAcademicCalendarAnchor(loadedTimetable)
        check(loadedTimetable.courses.isEmpty() || academicAnchor != null) {
            "课表当前周次无法识别，请刷新课表后再试。"
        }
        val courseDrafts = buildCourseDrafts(loadedTimetable, academicAnchor)
        val todoDrafts = buildTodoDrafts(todos)
        val resourceDrafts = buildResourceDrafts(resources)
        val calendarId = findCalendarId(accountScope) ?: createCalendar(accountScope)

        resolver.delete(
            CalendarContract.Events.CONTENT_URI,
            "${CalendarContract.Events.CALENDAR_ID} = ?",
            arrayOf(calendarId.toString()),
        )

        (courseDrafts.events + todoDrafts + resourceDrafts).forEach { draft ->
            insertEvent(calendarId, draft)
        }

        return CalendarSyncResult(
            courseCount = courseDrafts.events.size,
            todoCount = todoDrafts.size,
            resourceCount = resourceDrafts.size,
            skippedCourseCount = courseDrafts.skipped,
        )
    }

    private fun requireCalendarPermission() {
        val granted = listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR).all { permission ->
            ContextCompat.checkSelfPermission(appContext, permission) == PackageManager.PERMISSION_GRANTED
        }
        check(granted) { "请先允许日历权限后再同步。" }
    }

    private fun findCalendarId(accountScope: String): Long? = resolver.query(
        CalendarContract.Calendars.CONTENT_URI,
        arrayOf(CalendarContract.Calendars._ID),
        "${CalendarContract.Calendars.ACCOUNT_NAME} = ? AND ${CalendarContract.Calendars.ACCOUNT_TYPE} = ?",
        arrayOf(calendarAccountName(accountScope), CalendarContract.ACCOUNT_TYPE_LOCAL),
        null,
    )?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getLong(0) else null
    }

    private fun createCalendar(accountScope: String): Long {
        val accountName = calendarAccountName(accountScope)
        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, accountName)
            put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(CalendarContract.Calendars.NAME, CALENDAR_INTERNAL_NAME)
            put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CALENDAR_DISPLAY_NAME)
            put(CalendarContract.Calendars.CALENDAR_COLOR, Color.rgb(37, 99, 235))
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
            put(CalendarContract.Calendars.OWNER_ACCOUNT, accountName)
            put(CalendarContract.Calendars.VISIBLE, 1)
            put(CalendarContract.Calendars.SYNC_EVENTS, 1)
            put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, ZoneId.systemDefault().id)
        }
        val syncAdapterUri = CalendarContract.Calendars.CONTENT_URI.buildUpon()
            .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, accountName)
            .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            .build()
        return resolver.insert(syncAdapterUri, values)?.let { ContentUris.parseId(it) }
            ?: error("无法创建“$CALENDAR_DISPLAY_NAME”日历。")
    }

    private fun insertEvent(calendarId: Long, draft: CalendarEventDraft) {
        val values = ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, calendarId)
            put(CalendarContract.Events.TITLE, draft.title)
            put(CalendarContract.Events.DESCRIPTION, draft.description)
            put(CalendarContract.Events.EVENT_LOCATION, draft.location)
            put(CalendarContract.Events.DTSTART, draft.startAtMillis)
            put(CalendarContract.Events.DTEND, draft.endAtMillis)
            put(CalendarContract.Events.EVENT_TIMEZONE, draft.timeZone)
            put(CalendarContract.Events.ALL_DAY, if (draft.allDay) 1 else 0)
            put(CalendarContract.Events.HAS_ALARM, if (draft.reminderMinutes != null) 1 else 0)
            draft.rrule?.let { put(CalendarContract.Events.RRULE, it) }
        }
        val eventId = resolver.insert(CalendarContract.Events.CONTENT_URI, values)?.let { ContentUris.parseId(it) }
            ?: error("日历事件写入失败：${draft.title}")
        draft.reminderMinutes?.let { minutes ->
            resolver.insert(
                CalendarContract.Reminders.CONTENT_URI,
                ContentValues().apply {
                    put(CalendarContract.Reminders.EVENT_ID, eventId)
                    put(CalendarContract.Reminders.MINUTES, minutes)
                    put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
                },
            )
        }
    }

    private data class CourseDrafts(val events: List<CalendarEventDraft>, val skipped: Int)

    private fun buildCourseDrafts(
        timetable: CampusTimetable,
        academicAnchor: AcademicCalendarAnchor?,
    ): CourseDrafts {
        if (academicAnchor == null) {
            return CourseDrafts(emptyList(), timetable.courses.size)
        }

        var skipped = 0
        val events = buildList {
            for (course in timetable.courses) {
                val weeks = course.weeks
                    .ifEmpty { listOf(academicAnchor.currentWeek) }
                    .filter { it >= academicAnchor.currentWeek }
                if (weeks.isEmpty() || course.day !in 1..7) {
                    skipped += 1
                    continue
                }
                var courseAdded = false
                for (week in weeks) {
                    val date = academicAnchor.termStart
                        .plusWeeks((week - 1).toLong())
                        .plusDays((course.day - 1).toLong())
                    val times = parseCourseTimes(date, course.timeRange) ?: continue
                    if (times.second <= System.currentTimeMillis()) continue
                    add(
                        CalendarEventDraft(
                            title = course.courseName,
                            description = listOf(course.teacher, course.weekText, course.sectionText)
                                .filter(String::isNotBlank)
                                .joinToString(" · "),
                            location = course.location,
                            startAtMillis = times.first,
                            endAtMillis = times.second,
                            timeZone = ZoneId.systemDefault().id,
                            reminderMinutes = COURSE_REMINDER_MINUTES,
                        ),
                    )
                    courseAdded = true
                }
                if (!courseAdded) skipped += 1
            }
        }
        return CourseDrafts(events, skipped)
    }

    private fun buildTodoDrafts(snapshot: TodoSnapshot): List<CalendarEventDraft> {
        val startOfToday = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        return snapshot.tasks.mapNotNull { task ->
            val dueAt = task.dueAt ?: return@mapNotNull null
            if (task.completed || dueAt < startOfToday) return@mapNotNull null
            val reminderMinutes = task.reminderAt
                ?.takeIf { it <= dueAt }
                ?.let { ((dueAt - it) / 60_000L).coerceIn(0, MAX_REMINDER_MINUTES.toLong()).toInt() }
                ?: DEFAULT_TODO_REMINDER_MINUTES
            CalendarEventDraft(
                title = "待办：${task.title}",
                description = listOf(
                    "优先级：${task.priority}",
                    task.courseRef?.name?.takeIf(String::isNotBlank)?.let { "关联课程：$it" },
                ).filterNotNull().joinToString(" · "),
                startAtMillis = dueAt,
                endAtMillis = dueAt + TODO_DURATION_MILLIS,
                timeZone = ZoneId.systemDefault().id,
                reminderMinutes = reminderMinutes,
                rrule = when (task.recurrence) {
                    "daily" -> "FREQ=DAILY"
                    "weekly" -> "FREQ=WEEKLY"
                    "monthly" -> "FREQ=MONTHLY"
                    else -> null
                },
            )
        }
    }

    private fun buildResourceDrafts(resources: List<ResourceExpiry>): List<CalendarEventDraft> {
        val today = LocalDate.now()
        return resources.mapNotNull { resource ->
            val date = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return@mapNotNull null
            if (date < today) return@mapNotNull null
            val start = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            CalendarEventDraft(
                title = "到期：${resource.name}",
                description = "资源类型：${resource.type}",
                startAtMillis = start,
                endAtMillis = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
                timeZone = ZoneOffset.UTC.id,
                allDay = true,
                reminderMinutes = resource.advanceNoticeDays.coerceIn(0, 365) * 24 * 60,
            )
        }
    }

    private fun parseCourseTimes(date: LocalDate, value: String): Pair<Long, Long>? {
        val match = Regex("(\\d{1,2}):(\\d{2}).*?(\\d{1,2}):(\\d{2})").find(value) ?: return null
        val startTime = runCatching {
            LocalTime.of(match.groupValues[1].toInt(), match.groupValues[2].toInt())
        }.getOrNull() ?: return null
        val endTime = runCatching {
            LocalTime.of(match.groupValues[3].toInt(), match.groupValues[4].toInt())
        }.getOrNull() ?: return null
        val zone = ZoneId.systemDefault()
        val start = date.atTime(startTime).atZone(zone).toInstant().toEpochMilli()
        val endDate = if (endTime > startTime) date else date.plusDays(1)
        val end = endDate.atTime(endTime).atZone(zone).toInstant().toEpochMilli()
        return start to end
    }

    private data class CalendarEventDraft(
        val title: String,
        val description: String = "",
        val location: String = "",
        val startAtMillis: Long,
        val endAtMillis: Long,
        val timeZone: String,
        val allDay: Boolean = false,
        val reminderMinutes: Int? = null,
        val rrule: String? = null,
    )

    private companion object {
        const val CALENDAR_ACCOUNT_PREFIX = "cn.pxyb.mycontrol.calendar:"
        const val CALENDAR_INTERNAL_NAME = "my_control"
        const val CALENDAR_DISPLAY_NAME = "智控中心"
        const val COURSE_REMINDER_MINUTES = 15
        const val DEFAULT_TODO_REMINDER_MINUTES = 30
        const val MAX_REMINDER_MINUTES = 365 * 24 * 60
        const val TODO_DURATION_MILLIS = 30 * 60_000L
    }

    private fun calendarAccountName(accountScope: String): String = "$CALENDAR_ACCOUNT_PREFIX$accountScope"
}
