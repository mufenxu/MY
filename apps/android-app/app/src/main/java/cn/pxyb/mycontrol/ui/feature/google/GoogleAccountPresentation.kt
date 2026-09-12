package cn.pxyb.mycontrol.ui.feature.google

import androidx.compose.foundation.layout.size
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal const val FILTER_ALL = "all"

internal const val FILTER_UNREGISTERED = "unregistered"

internal const val FILTER_REGISTERED = "registered"

internal const val FILTER_ATTENTION = "attention"

internal const val SORT_ATTENTION = "attention"

private const val SORT_EMAIL = "email"

private const val SORT_RECENT = "recent"

private const val SORT_REVIEW = "review"

internal const val EMAIL_NORMAL = "normal"

internal const val EMAIL_ATTENTION = "attention"

internal const val EMAIL_UNAVAILABLE = "unavailable"

internal const val EMAIL_UNKNOWN = "unknown"

internal const val ALIAS_CANDIDATE = "candidate"

internal const val ALIAS_CONFIRMED = "confirmed"

internal const val ALIAS_UNAVAILABLE = "unavailable"

internal const val OPENAI_UNREGISTERED = "unregistered"

internal const val OPENAI_REGISTERED = "registered"

internal const val OPENAI_VERIFICATION = "verification"

internal const val OPENAI_ABNORMAL = "abnormal"

internal const val OPENAI_DISABLED = "disabled"

internal const val OPENAI_UNKNOWN = "unknown"

private val DeskTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    .withZone(ZoneId.systemDefault())

internal fun nextAliasSuggestion(account: GoogleAccountRecord): String =
    numberedAlias(account.primaryEmail, nextAliasNumber(account)) ?: ""

internal fun nextAliasNumber(account: GoogleAccountRecord): String {
    val local = account.primaryEmail.substringBefore('@')
    val domain = account.primaryEmail.substringAfter('@')
    val usedAddresses = account.aliases.map { it.address }.toSet() + account.primaryEmail
    val nextIndex = (1..9999).firstOrNull { index ->
        "$local+${index.toString().padStart(3, '0')}@$domain" !in usedAddresses
    } ?: (account.aliases.size + 1)
    return nextIndex.toString().padStart(3, '0')
}

internal fun numberedAlias(primaryEmail: String, number: String): String? {
    val local = primaryEmail.substringBefore('@').takeIf(String::isNotBlank) ?: return null
    val domain = primaryEmail.substringAfter('@').takeIf(String::isNotBlank) ?: return null
    val normalizedNumber = number.trim().filter(Char::isDigit).toIntOrNull() ?: return null
    return "$local+${normalizedNumber.toString().padStart(3, '0')}@$domain"
}

internal fun accountStatusKey(status: String): String = when (status) {
    EMAIL_NORMAL -> "healthy"
    EMAIL_ATTENTION -> "warning"
    EMAIL_UNAVAILABLE -> "critical"
    else -> "unknown"
}

internal fun accountStatusLabel(status: String): String = when (status) {
    EMAIL_NORMAL -> "正常"
    EMAIL_ATTENTION -> "需关注"
    EMAIL_UNAVAILABLE -> "不可用"
    else -> "未确认"
}

internal fun aliasStatusLabel(status: String): String = when (status) {
    ALIAS_CONFIRMED -> "已确认"
    ALIAS_UNAVAILABLE -> "不可用"
    else -> "候选"
}

internal fun aliasTypeLabel(type: String): String = when (type) {
    "plus" -> "+tag 别名"
    "workspace" -> "Workspace 别名"
    "custom" -> "自定义别名"
    else -> "其他别名"
}

internal fun openAiStatusKey(status: String): String = when (status) {
    OPENAI_REGISTERED -> "healthy"
    OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED -> "warning"
    OPENAI_UNREGISTERED -> "pending"
    else -> "unknown"
}

internal fun openAiStatusLabel(status: String): String = when (status) {
    OPENAI_REGISTERED -> "已注册正常"
    OPENAI_VERIFICATION -> "需要验证"
    OPENAI_ABNORMAL -> "暂时异常"
    OPENAI_DISABLED -> "已停用"
    OPENAI_UNREGISTERED -> "未注册"
    else -> "未确认"
}

internal fun statusOptionLabel(status: String): String = when (status) {
    EMAIL_NORMAL -> "邮箱正常"
    EMAIL_ATTENTION -> "邮箱需关注"
    EMAIL_UNAVAILABLE -> "邮箱不可用"
    EMAIL_UNKNOWN -> "邮箱未确认"
    ALIAS_CANDIDATE -> "别名候选"
    ALIAS_CONFIRMED -> "别名已确认"
    ALIAS_UNAVAILABLE -> "别名不可用"
    else -> openAiStatusLabel(status)
}

internal fun accountNeedsAttention(account: GoogleAccountRecord): Boolean =
    account.emailStatus != EMAIL_NORMAL ||
        account.openAiStatus in setOf(OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED, OPENAI_UNKNOWN) ||
        account.nextReviewAt?.let { it <= System.currentTimeMillis() } == true

internal fun accountComparator(sort: String): Comparator<GoogleAccountRecord> = when (sort) {
    SORT_EMAIL -> compareBy { it.primaryEmail }
    SORT_RECENT -> compareByDescending<GoogleAccountRecord> { it.lastCheckedAt ?: 0L }
    SORT_REVIEW -> compareBy<GoogleAccountRecord> { it.nextReviewAt ?: Long.MAX_VALUE }
        .thenBy { it.primaryEmail }
    else -> compareByDescending<GoogleAccountRecord> { accountNeedsAttention(it) }
        .thenBy { it.nextReviewAt ?: Long.MAX_VALUE }
        .thenBy { it.primaryEmail }
}

internal fun sortLabel(sort: String): String = when (sort) {
    SORT_EMAIL -> "邮箱"
    SORT_RECENT -> "最近确认"
    SORT_REVIEW -> "检查日期"
    else -> "待处理"
}

internal fun nextSort(sort: String): String = when (sort) {
    SORT_ATTENTION -> SORT_EMAIL
    SORT_EMAIL -> SORT_RECENT
    SORT_RECENT -> SORT_REVIEW
    else -> SORT_ATTENTION
}

internal fun normalizeGoogleAddress(address: String): String = address.trim().lowercase()

internal fun isValidGoogleAddress(address: String): Boolean =
    address.length <= 254 && address.count { it == '@' } == 1 &&
        address.substringBefore('@').isNotBlank() &&
        address.substringAfter('@').contains('.') &&
        address.none(Char::isWhitespace)

internal fun reviewLabel(millis: Long): String =
    DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(millis))

internal fun reviewDateInput(millis: Long): String = reviewLabel(millis)

internal fun formatDeskTime(millis: Long): String = DeskTimeFormatter.format(Instant.ofEpochMilli(millis))
