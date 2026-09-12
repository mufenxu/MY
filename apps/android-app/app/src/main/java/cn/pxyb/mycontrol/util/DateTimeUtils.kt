package cn.pxyb.mycontrol.util

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.Date
import java.text.DateFormat

/**
 * 全局通用日期与时间格式化工具
 */
object DateTimeUtils {

    private val timePattern = Regex("^(\\d{1,2}):([0-5]\\d)$")

    fun parseTimeMinutes(value: String, allowEndOfDay: Boolean = false): Int? {
        val match = timePattern.matchEntire(value.trim()) ?: return null
        val hour = match.groupValues[1].toInt()
        val minute = match.groupValues[2].toInt()
        return when {
            hour in 0..23 -> hour * 60 + minute
            allowEndOfDay && hour == 24 && minute == 0 -> 1440
            else -> null
        }
    }

    /** 日末端点保留为 24:00，不能截断小时后变成 23:00。 */
    fun formatMinutesToTime(minutes: Int): String {
        val bounded = minutes.coerceIn(0, 1440)
        return String.format(Locale.ROOT, "%02d:%02d", bounded / 60, bounded % 60)
    }

    fun formatLocalDateTime(epochMillis: Long): String =
        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(epochMillis))

    private val platformTimeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")
        .withZone(ZoneId.systemDefault())

    private val standardTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
        .withZone(ZoneId.systemDefault())

    /**
     * 格式化平台 ISO-8601 时间串为简短格式（MM-dd HH:mm）
     */
    fun formatPlatformTime(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "--"
        return runCatching {
            val instant = OffsetDateTime.parse(isoString).toInstant()
            platformTimeFormatter.format(instant)
        }.getOrElse { isoString }
    }

    /**
     * 格式化毫秒时间戳为标准日期时间（yyyy-MM-dd HH:mm）
     */
    fun formatStandardTime(epochMillis: Long?): String {
        if (epochMillis == null || epochMillis <= 0L) return "--"
        return runCatching {
            standardTimeFormatter.format(Instant.ofEpochMilli(epochMillis))
        }.getOrElse { "--" }
    }

    /**
     * 相对活跃时间描述（如：刚刚活跃、x 分钟前、x 小时前、x 天前）
     */
    fun formatLastActive(epochMillis: Long?): String {
        if (epochMillis == null || epochMillis <= 0L) return "从未活跃"
        val diffSec = (System.currentTimeMillis() - epochMillis) / 1000L
        return when {
            diffSec < 60 -> "刚刚活跃"
            diffSec < 3600 -> "${diffSec / 60} 分钟前"
            diffSec < 86400 -> "${diffSec / 3600} 小时前"
            else -> "${diffSec / 86400} 天前"
        }
    }

    /**
     * 相对同步时间描述（如：刚刚同步、x 分钟前、x 小时前、x 天前）
     */
    fun formatRelativeSyncTime(epochMillis: Long?): String {
        if (epochMillis == null || epochMillis <= 0L) return "从未同步"
        val diffSec = (System.currentTimeMillis() - epochMillis) / 1000L
        return when {
            diffSec < 60 -> "刚刚同步"
            diffSec < 3600 -> "${diffSec / 60} 分钟前"
            diffSec < 86400 -> "${diffSec / 3600} 小时前"
            else -> "${diffSec / 86400} 天前"
        }
    }
}
