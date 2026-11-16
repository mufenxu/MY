package cn.pxyb.mycontrol.ui.feature.todos

import cn.pxyb.mycontrol.data.TodoTask
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** 快捷日期只决定哪一天，时刻沿用这个默认值，之后可在时间字段里改。 */
internal const val TODO_DEFAULT_DUE_TIME = "20:00"
internal const val TODO_DEFAULT_REMINDER_LEAD_MINUTES = 60

private const val MINUTE_MILLIS = 60_000L
private const val DAY_MINUTES = 24 * 60
private val TODO_REMINDER_LEADS = listOf(0, 10, 30, 60, DAY_MINUTES)

internal data class TodoSchedule(
    val dueAt: Long?,
    val reminderAt: Long?,
    val reminderStatus: String,
    val remindedAt: Long?,
)

/** 截止前多少分钟提醒；null 表示不提醒。 */
internal fun todoReminderLeadMinutes(task: TodoTask?): Int? {
    val dueAt = task?.dueAt ?: return TODO_DEFAULT_REMINDER_LEAD_MINUTES
    if (task.reminderStatus == "dismissed") return null
    // 没有单独的提醒时间时，服务端按截止时间提醒，等同于「准时」。
    val reminderAt = task.reminderAt ?: return 0
    return ((dueAt - reminderAt + MINUTE_MILLIS / 2) / MINUTE_MILLIS).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
}

/** 固定档位之外，保留这条待办原有的提前量（例如在小程序里单独设过提醒时间）。 */
internal fun todoReminderLeadChoices(current: Int?): List<Int?> =
    listOf<Int?>(null) + (TODO_REMINDER_LEADS + listOfNotNull(current)).distinct().sorted()

internal fun todoReminderLeadLabel(minutes: Int?): String = when {
    minutes == null -> "不提醒"
    minutes <= 0 -> "准时"
    minutes % DAY_MINUTES == 0 -> "提前 ${minutes / DAY_MINUTES} 天"
    minutes % 60 == 0 -> "提前 ${minutes / 60} 小时"
    minutes < 60 -> "提前 $minutes 分钟"
    else -> "提前 ${minutes / 60} 小时 ${minutes % 60} 分钟"
}

internal fun todoDueAtMillis(date: String?, time: String, zone: ZoneId = ZoneId.systemDefault()): Long? {
    val day = date?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    val clock = runCatching { LocalTime.parse(time) }.getOrElse { LocalTime.parse(TODO_DEFAULT_DUE_TIME) }
    return day.atTime(clock).atZone(zone).toInstant().toEpochMilli()
}

/**
 * 保存时的截止与提醒字段。截止时间和提前量都没动时原样返回，
 * 避免只改标题就把已经提醒过的待办重新排进提醒。
 */
internal fun resolveTodoSchedule(task: TodoTask?, selectedDueAt: Long?, leadMinutes: Int?): TodoSchedule {
    // 选择器只精确到分钟：落在同一分钟视为没改，保留原始时间戳。
    val dueAt = task?.dueAt
        ?.takeIf { selectedDueAt != null && it / MINUTE_MILLIS == selectedDueAt / MINUTE_MILLIS }
        ?: selectedDueAt
    if (task != null && dueAt == task.dueAt && leadMinutes == todoReminderLeadMinutes(task)) {
        return TodoSchedule(task.dueAt, task.reminderAt, task.reminderStatus, task.remindedAt)
    }
    return when {
        dueAt == null -> TodoSchedule(null, null, "pending", null)
        // 提醒时间留空时服务端会退回到按截止时间提醒，所以「不提醒」要靠状态关掉。
        leadMinutes == null -> TodoSchedule(dueAt, null, "dismissed", null)
        else -> TodoSchedule(dueAt, dueAt - leadMinutes * MINUTE_MILLIS, "pending", null)
    }
}
