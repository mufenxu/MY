package cn.pxyb.mycontrol.ui.feature.campus.reservation

import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

internal fun weekdayName(date: LocalDate): String {
    return date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.SIMPLIFIED_CHINESE)
}

internal fun defaultAutoReservationExecuteDate(reservationDate: String, today: LocalDate): String {
    val target = runCatching {
        LocalDate.parse(reservationDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
    }.getOrNull() ?: today
    val earliest = target.minusDays(3)
    return (if (earliest.isAfter(today)) earliest else today).format(DateTimeFormatter.ISO_LOCAL_DATE)
}

internal fun CampusAutoReservationTask.copyForNextRun(today: LocalDate): CampusAutoReservationTask {
    val nextTarget = runCatching {
        LocalDate.parse(reservationDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE).plusDays(7)
    }.getOrNull() ?: today.plusDays(7)
    val nextTargetText = nextTarget.format(DateTimeFormatter.ISO_LOCAL_DATE)
    return copy(
        id = "",
        enabled = true,
        status = "waiting",
        statusText = "等待运行",
        nextRunAt = null,
        reservationDate = nextTargetText,
        executeDate = defaultAutoReservationExecuteDate(nextTargetText, today),
        lastStatus = null,
        lastMessage = null,
        lastCandidateIndex = null,
        lastRunAt = null,
        lastAttempts = emptyList(),
        lastReservation = null,
    )
}

internal fun reservationWindowText(windows: List<CampusReservationTimeWindow>?): String {
    return windows.orEmpty()
        .joinToString("、") { "${it.start} - ${it.end}" }
        .ifBlank { "暂无可预约空闲时段" }
}

internal const val CAMPUS_LIBROOM_MIN_START_TIME = "08:00"

internal const val CAMPUS_LIBROOM_MAX_START_TIME = "20:45"

internal const val CAMPUS_LIBROOM_MIN_END_TIME = "08:15"

internal const val CAMPUS_LIBROOM_MAX_END_TIME = "21:45"

internal const val CAMPUS_LIBROOM_TIME_STEP_MINUTES = 15

internal fun isReservationDurationValid(startTime: String, endTime: String): Boolean {
    val start = parseTimeMinutes(startTime, allowEndOfDay = true) ?: return false
    val end = parseTimeMinutes(endTime, allowEndOfDay = true) ?: return false
    return start in 480..1305 && end in 480..1305 && (end - start in 60..240)
}
