package cn.pxyb.mycontrol.ui.feature.campus.library

import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

internal fun timeRangeLabel(start: String, end: String): String = listOf(start.trim(), end.trim())
    .filter(String::isNotBlank)
    .joinToString(" - ")

internal fun formatSeatDateLabel(value: String): String {
    val date = runCatching { LocalDate.parse(value) }.getOrNull() ?: return value
    val weekday = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.CHINA)
    return "${date.monthValue}月${date.dayOfMonth}日 $weekday"
}
