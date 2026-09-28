package cn.pxyb.mycontrol.ui.feature.agenda

import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.data.TodoTask
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

data class AgendaItem(
    val id: String,
    val title: String,
    val location: String,
    val start: Long,
    val end: Long,
    val kind: String,
    val blocksTime: Boolean = true,
)

fun agendaMinute(value: String): Int? {
    val match = Regex("(?:^|\\s)([01]?\\d|2[0-4]):([0-5]\\d)").find(value) ?: return null
    val hour = match.groupValues[1].toInt()
    val minute = match.groupValues[2].toInt()
    return (hour * 60 + minute).takeIf { it <= 1440 }
}

fun agendaInstant(date: LocalDate, minute: Int, zone: ZoneId = ZoneId.systemDefault()): Long =
    date.atStartOfDay(zone).plusMinutes(minute.toLong()).toInstant().toEpochMilli()

fun agendaCourseWeek(timetable: CampusTimetable, date: LocalDate): Int? {
    val termStart = timetable.schoolCalendar?.termStartDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    return termStart?.let { ChronoUnit.DAYS.between(it, date).let { days -> if (days < 0) 0 else (days / 7).toInt() + 1 } }
        ?: timetable.schoolCalendar?.currentWeek?.let { current ->
            val monday = LocalDate.now().minusDays((LocalDate.now().dayOfWeek.value - 1).toLong())
            current + Math.floorDiv(ChronoUnit.DAYS.between(monday, date), 7L).toInt()
        }
}

fun courseOccurrenceId(course: CampusCourse, timetable: CampusTimetable, date: LocalDate): String {
    val identity = listOf(course.courseCode, course.sectionNo, course.courseName, agendaCourseWeek(timetable, date), course.day, course.startSection, course.endSection).joinToString("|") { it?.toString().orEmpty() }
    return java.security.MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).take(16).joinToString("") { "%02x".format(it) }
}

fun courseAgenda(timetable: CampusTimetable?, date: LocalDate): List<AgendaItem> {
    timetable ?: return emptyList()
    val week = agendaCourseWeek(timetable, date)
    return timetable.courses.filter { course ->
        course.day == date.dayOfWeek.value && (course.weeks.isEmpty() || week != null && week in course.weeks)
    }.mapNotNull { course ->
        val times = Regex("([01]?\\d|2[0-4]):[0-5]\\d").findAll(course.timeRange).map { it.value }.toList()
        val start = times.firstOrNull()?.let(::agendaMinute) ?: return@mapNotNull null
        val end = times.getOrNull(1)?.let(::agendaMinute) ?: return@mapNotNull null
        if (end <= start) return@mapNotNull null
        AgendaItem("course:${course.id}:$date", course.courseName, course.location,
            agendaInstant(date, start), agendaInstant(date, end), "课程")
    }
}

fun agendaCourseWarning(timetable: CampusTimetable?, date: LocalDate): String? {
    if (timetable == null) return "课表尚未加载。"
    if (!timetable.live || !timetable.staleReason.isNullOrBlank()) return "课表可能是缓存数据。"
    val courses = timetable.courses.filter { it.day == date.dayOfWeek.value }
    if (courses.any { it.weeks.isNotEmpty() } && timetable.schoolCalendar?.termStartDate.isNullOrBlank() && timetable.schoolCalendar?.currentWeek == null) {
        return "课表周次尚不明确，无法完整判断课程占用。"
    }
    if (courses.any { course -> Regex("([01]?\\d|2[0-4]):[0-5]\\d").findAll(course.timeRange).count() < 2 }) return "部分课程缺少起止时间。"
    return null
}

fun buildAgenda(
    date: LocalDate,
    timetable: CampusTimetable?,
    todos: List<TodoTask>,
    rooms: List<CampusMyReservation>,
    seats: List<LibrarySeatReservationRecord>,
): List<AgendaItem> {
    val result = courseAgenda(timetable, date).toMutableList()
    fun reservation(id: String, title: String, location: String, day: String, start: String, end: String, kind: String, status: String) {
        if (day.take(10) != date.toString() || Regex("取消|失效|违约|结束|cancel|expired|ended", RegexOption.IGNORE_CASE).containsMatchIn(status)) return
        val from = agendaMinute(start) ?: return
        val to = agendaMinute(end) ?: return
        if (to > from) result += AgendaItem(id, title, location, agendaInstant(date, from), agendaInstant(date, to), kind)
    }
    rooms.forEach { reservation("room:${it.id}", it.title.ifBlank { "研讨间预约" }, it.spaceName, it.date, it.startTime, it.endTime, "研讨间", it.statusText) }
    seats.forEach { reservation("seat:${it.id}", "座位 ${it.seatLabel}", it.location.ifBlank { listOf(it.buildName, it.floorName, it.roomName).filter(String::isNotBlank).joinToString(" · ") }, it.date, it.startTime, it.endTime, "座位", it.statusText) }
    val startOfDay = agendaInstant(date, 0)
    val endOfDay = agendaInstant(date.plusDays(1), 0)
    todos.filter { !it.completed && it.dueAt != null && it.dueAt >= startOfDay && it.dueAt < endOfDay }.forEach {
        result += AgendaItem("todo:${it.id}", it.title, it.courseRef?.name.orEmpty(), it.dueAt!!, it.dueAt, "待办截止", false)
    }
    return result.sortedWith(compareBy(AgendaItem::start, AgendaItem::id))
}

fun agendaConflicts(items: List<AgendaItem>, start: Long, end: Long, excludeId: String? = null): List<AgendaItem> =
    items.filter { it.blocksTime && it.id != excludeId && start < it.end && end > it.start }

fun agendaFreeWindows(items: List<AgendaItem>, date: LocalDate): List<Pair<Long, Long>> {
    val dayStart = agendaInstant(date, 8 * 60)
    val dayEnd = agendaInstant(date, 22 * 60)
    var cursor = dayStart
    val result = mutableListOf<Pair<Long, Long>>()
    items.filter { it.blocksTime && it.end > dayStart && it.start < dayEnd }.sortedBy { it.start }.forEach {
        if (it.start > cursor) result += cursor to it.start.coerceAtMost(dayEnd)
        cursor = maxOf(cursor, it.end.coerceAtMost(dayEnd))
    }
    if (cursor < dayEnd) result += cursor to dayEnd
    return result.filter { it.second - it.first >= 30 * 60_000 }
}
