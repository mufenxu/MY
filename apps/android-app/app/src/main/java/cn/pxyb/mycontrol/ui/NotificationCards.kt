package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.AppNotificationBlock
import cn.pxyb.mycontrol.data.NotificationKind
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.data.isHighPriority
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.data.kind
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppMetricCard
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.input.AppSearchBar
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal
import cn.pxyb.mycontrol.ui.theme.AccentColors
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

private const val UNDO_WINDOW_MS = 5_000L
private const val QUIET_START = "quiet-start"
private const val QUIET_END = "quiet-end"
private val ARCHIVE_SWIPE_THRESHOLD = 96.dp

/** 通知中心筛选维度：与 [NotificationKind] 的 id 保持一致，便于按分类直接匹配。 */
private enum class NotificationFilter(val id: String, val label: String) {
    All("all", "全部"),
    Unread("unread", "未读"),
    Alert("alert", "告警"),
    Task("task", "任务"),
    Schedule("schedule", "日程"),
    Device("device", "设备"),
    Security("security", "安全"),
    Snoozed("snoozed", "稍后"),
}

private data class NotificationStats(val unread: Int, val today: Int, val urgent: Int)

internal data class NotificationDaySection(val key: String, val label: String, val alerts: List<AppAlertRecord>)

@Composable
fun NotificationCenterScreen(
    state: NotificationCenterUiState,
    contentPadding: PaddingValues,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onOpen: (AppAlertRecord) -> Unit,
    onAction: (AppAlertRecord, AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onMarkAllRead: () -> Unit,
    onClearRead: () -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String, Long) -> Unit,
    onUpdatePreferences: (AlertPreferences) -> Unit,
    onBack: () -> Unit,
) {
    var filterTab by rememberSaveable { mutableStateOf(NotificationFilter.All.id) }
    var query by rememberSaveable { mutableStateOf("") }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var selectedAlertId by rememberSaveable { mutableStateOf<String?>(null) }
    var snoozeTargetId by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingArchiveId by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()

    val now = System.currentTimeMillis()
    val selectedAlert = state.alerts.firstOrNull { it.id == selectedAlertId && it.id != pendingArchiveId }
    val pendingAlert = state.alerts.firstOrNull { it.id == pendingArchiveId }
    val activeAlerts = state.alerts.filterNot { it.id == pendingArchiveId }
    val visibleAlerts = filterNotifications(activeAlerts, filterTab, query, now)
    val sections = notificationDaySections(visibleAlerts, now)
    val stats = notificationStats(activeAlerts, now)
    val unreadCount = activeAlerts.activeUnreadCount(now)
    val hasReadAlerts = activeAlerts.any(AppAlertRecord::read)
    val isLoading = refreshing && state.alerts.isEmpty()

    LaunchedEffect(state.alerts, pendingArchiveId) {
        if (selectedAlertId != null && selectedAlert == null) selectedAlertId = null
    }

    LaunchedEffect(pendingArchiveId) {
        val id = pendingArchiveId ?: return@LaunchedEffect
        kotlinx.coroutines.delay(UNDO_WINDOW_MS)
        if (pendingArchiveId == id) {
            onArchive(id)
            pendingArchiveId = null
        }
    }

    fun queueArchive(id: String) {
        pendingArchiveId?.takeIf { it != id }?.let(onArchive)
        pendingArchiveId = id
    }

    val headerActions: @Composable RowScope.() -> Unit = {
        if (unreadCount > 0) {
            AppHeaderIconButton(
                icon = Icons.Outlined.DoneAll,
                contentDescription = "全部已读",
                onClick = onMarkAllRead,
                iconTint = ColorTokens.Green.foreground,
                containerColor = ColorTokens.Green.container,
            )
        }
        if (hasReadAlerts) {
            AppHeaderIconButton(
                icon = Icons.Outlined.DeleteOutline,
                contentDescription = "清理已读",
                onClick = onClearRead,
                iconTint = ColorTokens.Red.foreground,
                containerColor = ColorTokens.Red.container,
            )
        }
        AppHeaderIconButton(
            icon = Icons.Outlined.Settings,
            contentDescription = "提醒设置",
            onClick = { settingsOpen = true },
        )
    }

    val listContent: LazyListScope.() -> Unit = {
        item(key = "summary", contentType = "summary") {
            NotificationSummaryPanel(stats = stats, onFilterSelect = { filterTab = it })
        }
        item(key = "search", contentType = "search") {
            AppSearchBar(
                query = query,
                onQueryChange = { query = it },
                placeholder = "搜索通知标题或内容",
            )
        }
        item(key = "filters", contentType = "filters") {
            NotificationFilterRow(
                alerts = activeAlerts,
                selectedId = filterTab,
                onSelect = { filterTab = it },
            )
        }
        state.syncError?.let { error ->
            item(key = "sync-error", contentType = "banner") {
                FeedbackBanner("通知同步失败：$error", error = true, onRetry = onRefresh)
            }
        }
        if (state.preferences.quietHoursEnabled) {
            item(key = "quiet-hours", contentType = "banner") {
                AppFeedbackBanner(
                    message = "安静时段 ${hourLabel(state.preferences.quietStartHour)} - ${hourLabel(state.preferences.quietEndHour)} 内不弹出系统通知，历史仍会保留。",
                    type = AppFeedbackType.Info,
                    showCloseButton = false,
                    autoDismissDurationMillis = null,
                )
            }
        }
        if (isLoading) {
            item(key = "skeleton", contentType = "skeleton") {
                GlassShimmerList(itemCount = 5, itemHeight = 92.dp)
            }
        } else if (sections.isEmpty()) {
            item(key = "empty", contentType = "empty") {
                AppEmptyState(
                    title = when {
                        query.isNotBlank() -> "没有匹配的通知"
                        filterTab == NotificationFilter.Unread.id -> "全部已读"
                        filterTab == NotificationFilter.Snoozed.id -> "暂无稍后提醒"
                        else -> "暂无通知"
                    },
                    detail = when {
                        query.isNotBlank() -> "换个关键词试试，或清空搜索内容。"
                        filterTab == NotificationFilter.Unread.id -> "新的告警与提醒到达后会出现在这里。"
                        filterTab == NotificationFilter.Snoozed.id -> "推迟处理的通知会在这里等待重新提醒。"
                        else -> "系统告警、任务提醒与日程消息会集中显示在这里。"
                    },
                    icon = notificationEmptyIcon(filterTab, query),
                )
            }
        } else {
            sections.forEach { section ->
                item(key = "day-${section.key}", contentType = "day") {
                    NotificationDayHeader(label = section.label, count = section.alerts.size)
                }
                items(section.alerts, key = ::notificationItemKey, contentType = { "notification" }) { alert ->
                    NotificationCard(
                        alert = alert,
                        onOpen = {
                            if (alert.contentBlocks.isNotEmpty()) {
                                selectedAlertId = alert.id
                                onMarkRead(alert.id)
                            } else {
                                onOpen(alert)
                            }
                        },
                        onMarkRead = onMarkRead,
                        onMarkUnread = onMarkUnread,
                        onArchive = ::queueArchive,
                        onSnooze = { snoozeTargetId = it },
                        selected = selectedAlert?.id == alert.id,
                    )
                }
            }
        }
    }

    val isTablet = useTwoPaneLayout()

    Box(modifier = Modifier.fillMaxSize()) {
        if (isTablet) {
            NotificationTwoPaneLayout(
                title = "通知中心",
                subtitle = notificationSubtitle(unreadCount),
                contentPadding = contentPadding,
                refreshing = refreshing,
                onRefresh = onRefresh,
                onBack = onBack,
                actions = headerActions,
                listState = listState,
                selectedAlert = selectedAlert,
                onAction = onAction,
                onMarkRead = onMarkRead,
                onMarkUnread = onMarkUnread,
                onArchive = ::queueArchive,
                onSnooze = { snoozeTargetId = it },
                listContent = listContent,
            )
        } else {
            AppSubPage(
                title = "通知中心",
                subtitle = notificationSubtitle(unreadCount),
                onBack = onBack,
                contentPadding = contentPadding,
                pinHeader = true,
                refreshing = refreshing,
                onRefresh = onRefresh,
                actions = headerActions,
                listState = listState,
                content = listContent,
            )
        }

        pendingAlert?.let { alert ->
            AppFeedbackBanner(
                message = "已归档「${alert.title}」",
                type = AppFeedbackType.Success,
                onRetry = { pendingArchiveId = null },
                retryText = "撤销",
                showCloseButton = false,
                autoDismissDurationMillis = null,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(
                        start = AppPageHorizontalPadding,
                        end = AppPageHorizontalPadding,
                        bottom = contentPadding.calculateBottomPadding() + 12.dp,
                    ),
            )
        }
    }

    if (settingsOpen) {
        QuietHoursDialog(
            preferences = state.preferences,
            onDismiss = { settingsOpen = false },
            onSave = { onUpdatePreferences(it); settingsOpen = false },
        )
    }

    snoozeTargetId?.let { id ->
        SnoozeDialog(
            onDismiss = { snoozeTargetId = null },
            onPick = { duration ->
                onSnooze(id, duration)
                snoozeTargetId = null
            },
        )
    }

    if (!isTablet) {
        selectedAlert?.let { alert ->
            NotificationDetailDialog(
                alert = alert,
                onDismiss = { selectedAlertId = null },
                onAction = { action ->
                    selectedAlertId = null
                    onAction(alert, action)
                },
                onMarkRead = onMarkRead,
                onMarkUnread = onMarkUnread,
            )
        }
    }
}

private fun notificationSubtitle(unreadCount: Int): String =
    if (unreadCount > 0) "$unreadCount 条未读消息" else "系统告警、任务与日程消息"

private fun notificationEmptyIcon(filterId: String, query: String): ImageVector = when {
    query.isNotBlank() -> Icons.Outlined.SearchOff
    filterId == NotificationFilter.Unread.id -> Icons.Outlined.DoneAll
    filterId == NotificationFilter.Snoozed.id -> Icons.Outlined.AccessTime
    else -> Icons.Outlined.Notifications
}

@Composable
private fun NotificationSummaryPanel(
    stats: NotificationStats,
    onFilterSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppMetricCard(
            label = "未读",
            value = stats.unread.toString(),
            unit = "条",
            icon = Icons.Outlined.NotificationsActive,
            iconTint = ColorTokens.Blue.foreground,
            iconBackground = ColorTokens.Blue.container,
            modifier = Modifier.weight(1f),
            onClick = { onFilterSelect(NotificationFilter.Unread.id) },
        )
        AppMetricCard(
            label = "今日",
            value = stats.today.toString(),
            unit = "条",
            icon = Icons.Outlined.Schedule,
            iconTint = ColorTokens.Teal.foreground,
            iconBackground = ColorTokens.Teal.container,
            modifier = Modifier.weight(1f),
        )
        AppMetricCard(
            label = "高优先",
            value = stats.urgent.toString(),
            unit = "条",
            icon = Icons.Outlined.Warning,
            iconTint = ColorTokens.Amber.foreground,
            iconBackground = ColorTokens.Amber.container,
            modifier = Modifier.weight(1f),
            onClick = { onFilterSelect(NotificationFilter.Alert.id) },
        )
    }
}

@Composable
private fun NotificationFilterRow(
    alerts: List<AppAlertRecord>,
    selectedId: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val now = System.currentTimeMillis()
    val counts = notificationFilterCounts(alerts, now)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NotificationFilter.entries.forEach { filter ->
            val count = counts[filter] ?: 0
            AppFilterChip(
                label = if (count > 0) "${filter.label} $count" else filter.label,
                selected = filter.id == selectedId,
                onClick = { onSelect(filter.id) },
            )
        }
    }
}

@Composable
private fun NotificationDayHeader(label: String, count: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 4.dp, end = 4.dp, top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp, fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(1.dp)
                .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        )
        Text(
            text = "$count 条",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            maxLines = 1,
        )
    }
}

private fun notificationStats(alerts: List<AppAlertRecord>, now: Long): NotificationStats {
    val zone = ZoneId.systemDefault()
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    return NotificationStats(
        unread = alerts.activeUnreadCount(now),
        today = alerts.count { Instant.ofEpochMilli(it.createdAt).atZone(zone).toLocalDate() == today },
        urgent = alerts.count { !it.read && it.isHighPriority() && !it.isSnoozedAt(now) },
    )
}

private fun notificationFilterCounts(alerts: List<AppAlertRecord>, now: Long): Map<NotificationFilter, Int> =
    NotificationFilter.entries.associateWith { filter ->
        alerts.count { alert -> alertMatchesFilter(alert, filter, now) }
    }

private fun alertMatchesFilter(alert: AppAlertRecord, filter: NotificationFilter, now: Long): Boolean {
    val snoozed = alert.isSnoozedAt(now)
    return when (filter) {
        NotificationFilter.All -> true
        NotificationFilter.Snoozed -> snoozed
        NotificationFilter.Unread -> !alert.read && !snoozed
        else -> !snoozed && alert.kind().id == filter.id
    }
}

private fun filterNotifications(
    alerts: List<AppAlertRecord>,
    filterId: String,
    query: String,
    now: Long,
): List<AppAlertRecord> {
    val filter = NotificationFilter.entries.firstOrNull { it.id == filterId } ?: NotificationFilter.All
    val keyword = query.trim()
    return alerts.filter { alert ->
        alertMatchesFilter(alert, filter, now) && (
            keyword.isEmpty() ||
                alert.title.contains(keyword, ignoreCase = true) ||
                alert.body.contains(keyword, ignoreCase = true)
            )
    }
}

internal fun notificationDaySections(
    alerts: List<AppAlertRecord>,
    now: Long = System.currentTimeMillis(),
): List<NotificationDaySection> {
    val zone = ZoneId.systemDefault()
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    return alerts
        .groupBy { Instant.ofEpochMilli(it.createdAt).atZone(zone).toLocalDate() }
        .entries
        .sortedByDescending { it.key }
        .map { (date, items) -> NotificationDaySection(date.toString(), notificationDayLabel(date, today), items) }
}

private fun notificationDayLabel(date: LocalDate, today: LocalDate): String = when {
    date == today -> "今天"
    date == today.minusDays(1) -> "昨天"
    date.isAfter(today.minusDays(7)) -> date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.SIMPLIFIED_CHINESE)
    date.year == today.year -> "${date.monthValue} 月 ${date.dayOfMonth} 日"
    else -> "${date.year} 年 ${date.monthValue} 月 ${date.dayOfMonth} 日"
}

internal fun notificationItemKey(alert: AppAlertRecord): String = alert.id

/** 平板 / 大屏：左侧列表 + 右侧详情的经典双栏布局。 */
@Composable
private fun NotificationTwoPaneLayout(
    title: String,
    subtitle: String,
    contentPadding: PaddingValues,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    actions: (@Composable RowScope.() -> Unit)?,
    listState: LazyListState,
    selectedAlert: AppAlertRecord?,
    onAction: (AppAlertRecord, AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    listContent: LazyListScope.() -> Unit,
) {
    val dark = isAppInDarkTheme()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .auroraBackdrop(dark)
            .padding(
                top = contentPadding.calculateTopPadding(),
                bottom = contentPadding.calculateBottomPadding(),
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppPageHorizontalPadding)
                .padding(top = AppPageTopSpacing, bottom = 8.dp),
        ) {
            AppSecondaryHeader(
                title = title,
                subtitle = subtitle,
                onBack = onBack,
                actions = actions,
            )
        }
        Row(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            ) {
                PullToRefresh(
                    isRefreshing = refreshing,
                    onRefresh = onRefresh,
                    atTop = {
                        listState.firstVisibleItemIndex == 0 &&
                            listState.firstVisibleItemScrollOffset == 0
                    },
                ) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = AppPageHorizontalPadding,
                            end = AppPageHorizontalPadding,
                            top = 4.dp,
                            bottom = AppPageBottomSpacing,
                        ),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        listContent()
                    }
                }
            }
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
            )
            Box(
                modifier = Modifier
                    .weight(1.2f)
                    .fillMaxHeight()
                    .padding(16.dp),
            ) {
                if (selectedAlert != null) {
                    key(selectedAlert.id) {
                        NotificationDetailPane(
                            alert = selectedAlert,
                            onAction = { onAction(selectedAlert, it) },
                            onMarkRead = onMarkRead,
                            onMarkUnread = onMarkUnread,
                            onArchive = onArchive,
                            onSnooze = onSnooze,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                } else {
                    NotificationDetailPlaceholder(modifier = Modifier.fillMaxSize())
                }
            }
        }
    }
}

@Composable
private fun NotificationDetailPlaceholder(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = AppCardShape,
        color = glassCardColor(),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            IconTile(
                icon = Icons.Outlined.Notifications,
                tint = ColorTokens.Blue.foreground,
                background = ColorTokens.Blue.container,
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "选择一条通知查看详情",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "左侧列表支持搜索、筛选与左滑归档；选中后的完整内容、结构化字段与快捷操作会显示在这里。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * 通知卡片。
 *
 * 交互约定：向左滑动超过 [ARCHIVE_SWIPE_THRESHOLD] 后松手归档（此前文案误写成"右滑"），
 * 卡片底部只保留「已读 / 标为未读」与「稍后」两个高频动作，来源与详情入口交给列表本身表达。
 */
@Composable
internal fun NotificationCard(
    alert: AppAlertRecord,
    onOpen: () -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    selected: Boolean = false,
) {
    var offsetX by remember(alert.id) { mutableFloatStateOf(0f) }
    var thresholdNotified by remember(alert.id) { mutableStateOf(false) }
    val thresholdPx = with(LocalDensity.current) { ARCHIVE_SWIPE_THRESHOLD.toPx() }
    val haptics = LocalHapticFeedback.current

    val kind = alert.kind()
    val accent = notificationKindColors(kind)
    val urgent = !alert.read && alert.isHighPriority()
    val snoozed = alert.isSnoozedAt()

    Box(contentAlignment = Alignment.CenterEnd) {
        if (offsetX < 0f) {
            val reached = -offsetX >= thresholdPx
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(MaterialTheme.colorScheme.errorContainer, AppCardShape)
                    .padding(horizontal = 22.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Archive,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = if (reached) "松开归档" else "左滑归档",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetX.roundToInt(), 0) }
                .clip(AppCardShape)
                .pointerInput(alert.id) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { _, dragAmount ->
                            if (dragAmount < 0f || offsetX < 0f) {
                                offsetX = (offsetX + dragAmount).coerceAtMost(0f)
                            }
                            val reached = -offsetX >= thresholdPx
                            if (reached && !thresholdNotified) {
                                thresholdNotified = true
                                AppHaptics.heavy(haptics)
                            } else if (!reached) {
                                thresholdNotified = false
                            }
                        },
                        onDragEnd = {
                            if (-offsetX >= thresholdPx) onArchive(alert.id)
                            offsetX = 0f
                            thresholdNotified = false
                        },
                        onDragCancel = {
                            offsetX = 0f
                            thresholdNotified = false
                        },
                    )
                }
                .clickable(onClick = onOpen),
            shape = AppCardShape,
            color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else glassCardColor(),
            border = BorderStroke(
                width = if (selected) 1.5.dp else if (urgent) 1.1.dp else 0.5.dp,
                color = when {
                    selected -> MaterialTheme.colorScheme.primary
                    urgent -> ColorTokens.Red.foreground
                    !alert.read -> MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                    else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
                },
            ),
            shadowElevation = 0.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    IconTile(
                        icon = notificationKindIcon(kind),
                        tint = accent.foreground,
                        background = accent.container,
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = alert.title,
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = if (alert.read) FontWeight.Medium else FontWeight.Bold,
                                    fontSize = 15.sp,
                                    letterSpacing = (-0.2).sp,
                                ),
                                color = if (alert.read) {
                                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.78f)
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            if (!alert.read) {
                                Spacer(Modifier.width(6.dp))
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .background(ColorTokens.Blue.foreground, CircleShape),
                                )
                            }
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = relativeTimeLabel(alert.createdAt),
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                                maxLines = 1,
                            )
                            NotificationTag(text = kind.label, accent = accent)
                            if (urgent) NotificationTag(text = "高优先", accent = ColorTokens.Red)
                            if (snoozed) {
                                NotificationTag(
                                    text = snoozeTimeLabel(alert.snoozedUntil ?: 0L),
                                    accent = ColorTokens.Amber,
                                )
                            }
                        }
                    }
                }

                if (alert.body.isNotBlank()) {
                    Text(
                        text = alert.body,
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.5.sp, lineHeight = 19.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (alert.read) 0.72f else 0.92f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 2.dp),
                    )
                }

                if (alert.contentBlocks.isNotEmpty()) {
                    Row(
                        modifier = Modifier.padding(start = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = accent.foreground,
                        )
                        Text(
                            text = "包含 ${alert.contentBlocks.size} 项详细内容 · 点击查看",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Medium,
                                fontSize = 11.5.sp,
                            ),
                            color = accent.foreground,
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (snoozed) {
                        NotificationCardAction(
                            icon = Icons.Outlined.Restore,
                            text = "取消稍后",
                            accent = ColorTokens.Amber,
                            onClick = { onMarkUnread(alert.id) },
                        )
                    } else {
                        NotificationCardAction(
                            icon = if (alert.read) Icons.Outlined.MarkEmailUnread else Icons.Outlined.MarkEmailRead,
                            text = if (alert.read) "标为未读" else "已读",
                            accent = ColorTokens.Blue,
                            onClick = { if (alert.read) onMarkUnread(alert.id) else onMarkRead(alert.id) },
                        )
                        Spacer(Modifier.width(8.dp))
                        NotificationCardAction(
                            icon = Icons.Outlined.AccessTime,
                            text = "稍后",
                            accent = ColorTokens.Teal,
                            onClick = { onSnooze(alert.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationTag(text: String, accent: AccentColors, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = accent.container,
        border = BorderStroke(0.5.dp, accent.border),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 10.5.sp),
            color = accent.foreground,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun NotificationCardAction(
    icon: ImageVector,
    text: String,
    accent: AccentColors,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(50)
    Surface(
        modifier = modifier
            .clip(shape)
            .clickable {
                AppHaptics.tick(haptics)
                onClick()
            },
        shape = shape,
        color = accent.container,
        border = BorderStroke(0.6.dp, accent.border),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(13.dp), tint = accent.foreground)
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp),
                color = accent.foreground,
            )
        }
    }
}

@Composable
private fun notificationKindColors(kind: NotificationKind): AccentColors = when (kind) {
    NotificationKind.Alert -> ColorTokens.Red
    NotificationKind.Task -> ColorTokens.Amber
    NotificationKind.Schedule -> ColorTokens.Blue
    NotificationKind.Device -> ColorTokens.Green
    NotificationKind.Security -> ColorTokens.Purple
    NotificationKind.System -> ColorTokens.Sky
}

private fun notificationKindIcon(kind: NotificationKind): ImageVector = when (kind) {
    NotificationKind.Alert -> Icons.Outlined.Warning
    NotificationKind.Task -> Icons.Outlined.Assignment
    NotificationKind.Schedule -> Icons.Outlined.Schedule
    NotificationKind.Device -> Icons.Outlined.Devices
    NotificationKind.Security -> Icons.Outlined.Security
    NotificationKind.System -> Icons.Outlined.Notifications
}

private fun relativeTimeLabel(createdAt: Long, now: Long = System.currentTimeMillis()): String {
    val diff = now - createdAt
    return when {
        diff < 60_000L -> "刚刚"
        diff < 3_600_000L -> "${diff / 60_000L} 分钟前"
        diff < 86_400_000L -> "${diff / 3_600_000L} 小时前"
        diff < 7 * 86_400_000L -> "${diff / 86_400_000L} 天前"
        else -> formatMillis(createdAt)
    }
}

private fun snoozeTimeLabel(untilMillis: Long): String {
    val time = Instant.ofEpochMilli(untilMillis).atZone(ZoneId.systemDefault())
    return "稍后 %02d:%02d".format(time.hour, time.minute)
}

@Composable
private fun NotificationDetailPane(
    alert: AppAlertRecord,
    onAction: (AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val kind = alert.kind()
    val accent = notificationKindColors(kind)
    val snoozed = alert.isSnoozedAt()

    Surface(
        modifier = modifier,
        shape = AppCardShape,
        color = glassCardColor(),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    IconTile(
                        icon = notificationKindIcon(kind),
                        tint = accent.foreground,
                        background = accent.container,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        NotificationTag(text = kind.label, accent = accent)
                        Text(
                            text = relativeTimeLabel(alert.createdAt),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (!alert.read) {
                    Text(
                        text = "未读",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = ColorTokens.Blue.foreground,
                    )
                }
            }

            Text(
                text = alert.title,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )

            if (alert.body.isNotBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = alert.body,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(14.dp),
                    )
                }
            }

            alert.contentBlocks.forEach { block -> NotificationBlockView(block) }

            if (alert.actions.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                Text(
                    text = "快捷操作",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                alert.actions.forEach { action ->
                    AppButton(
                        text = action.label,
                        icon = Icons.Outlined.OpenInNew,
                        onClick = { onAction(action) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

            if (snoozed) {
                AppSecondaryButton(
                    text = "取消稍后",
                    onClick = { onMarkUnread(alert.id) },
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Outlined.Restore,
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppSecondaryButton(
                        text = if (alert.read) "标为未读" else "标为已读",
                        onClick = { if (alert.read) onMarkUnread(alert.id) else onMarkRead(alert.id) },
                        modifier = Modifier.weight(1f),
                        icon = if (alert.read) Icons.Outlined.MarkEmailUnread else Icons.Outlined.MarkEmailRead,
                    )
                    AppSecondaryButton(
                        text = "稍后提醒",
                        onClick = { onSnooze(alert.id) },
                        modifier = Modifier.weight(1f),
                        icon = Icons.Outlined.AccessTime,
                    )
                }
            }

            AppSecondaryButton(
                text = "归档",
                onClick = { onArchive(alert.id) },
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Outlined.Archive,
            )
        }
    }
}

@Composable
private fun NotificationDetailDialog(
    alert: AppAlertRecord,
    onDismiss: () -> Unit,
    onAction: (AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
) {
    val kind = alert.kind()
    val accent = notificationKindColors(kind)

    AppDialog(
        onDismissRequest = onDismiss,
        icon = notificationKindIcon(kind),
        iconTint = accent.foreground,
        iconBackground = accent.container,
        title = alert.title,
        subtitle = "${relativeTimeLabel(alert.createdAt)} · ${kind.label}",
        modifier = Modifier.heightIn(max = 640.dp),
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppDialogSecondaryButton(
                    text = if (alert.read) "标为未读" else "标为已读",
                    onClick = { if (alert.read) onMarkUnread(alert.id) else onMarkRead(alert.id) },
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton("关闭", onDismiss, Modifier.weight(1f))
            }
        },
    ) {
        if (alert.body.isNotBlank()) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = alert.body,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }

        alert.contentBlocks.forEach { block -> NotificationBlockView(block) }

        if (alert.actions.isNotEmpty()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            alert.actions.forEach { action ->
                AppButton(
                    text = action.label,
                    icon = Icons.Outlined.OpenInNew,
                    onClick = { onAction(action) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun NotificationBlockView(block: AppNotificationBlock) {
    val uriHandler = LocalUriHandler.current
    when (block.type) {
        "text" -> Text(block.text, style = MaterialTheme.typography.bodyLarge)
        "markdown" -> Text(block.markdown, style = MaterialTheme.typography.bodyLarge)
        "keyValue" -> Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                block.items.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = item.key,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(0.38f),
                        )
                        Text(
                            text = item.value,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(0.62f),
                        )
                    }
                }
            }
        }
        "list" -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            block.listItems.forEach { item ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .padding(top = 6.dp)
                            .size(6.dp)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(3.dp)),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = item.title,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (item.description.isNotBlank()) {
                            Text(
                                text = item.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        "progress" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = block.label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "${block.value ?: 0}%",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            LinearProgressIndicator(
                progress = { ((block.value ?: 0).coerceIn(0, 100)) / 100f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
            )
        }
        "image", "attachment" -> Surface(
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = block.alt.ifBlank { block.fileName.ifBlank { block.url } },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                if (block.url.isNotBlank()) {
                    TextButton(onClick = { runCatching { uriHandler.openUri(block.url) } }) {
                        Icon(
                            imageVector = Icons.Outlined.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(if (block.type == "image") "查看图片" else "打开附件")
                    }
                }
            }
        }
        else -> if (block.text.isNotBlank()) Text(block.text, style = MaterialTheme.typography.bodyLarge)
    }
}

private const val SNOOZE_SOON_MS = 30 * 60_000L
private const val SNOOZE_HOUR_MS = 60 * 60_000L
private const val SNOOZE_THREE_HOURS_MS = 3 * 60 * 60_000L

/** 稍后提醒预设：固定 1 小时改为可选档位，最后一档顺延到次日早上 8 点。 */
internal fun snoozeOptions(now: Long = System.currentTimeMillis()): List<Pair<String, Long>> {
    val tomorrowMorning = LocalDate.now()
        .plusDays(1)
        .atTime(8, 0)
        .atZone(ZoneId.systemDefault())
        .toInstant()
        .toEpochMilli()
    return listOf(
        "30 分钟后" to SNOOZE_SOON_MS,
        "1 小时后" to SNOOZE_HOUR_MS,
        "3 小时后" to SNOOZE_THREE_HOURS_MS,
        "明天 08:00" to (tomorrowMorning - now),
    )
}

@Composable
private fun SnoozeDialog(onDismiss: () -> Unit, onPick: (Long) -> Unit) {
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AccessTime,
        iconTint = ColorTokens.Teal.foreground,
        iconBackground = ColorTokens.Teal.container,
        title = "稍后提醒",
        subtitle = "到点后会重新回到未读列表并再次提醒",
        footer = {
            AppDialogSecondaryButton("取消", onDismiss, Modifier.fillMaxWidth())
        },
    ) {
        snoozeOptions().forEach { (label, duration) ->
            AppActionRow(
                title = label,
                icon = Icons.Outlined.AccessTime,
                iconTint = ColorTokens.Teal.foreground,
                onClick = { onPick(duration) },
                trailingContent = null,
            )
        }
    }
}

@Composable
private fun QuietHoursDialog(
    preferences: AlertPreferences,
    onDismiss: () -> Unit,
    onSave: (AlertPreferences) -> Unit,
) {
    var enabled by remember { mutableStateOf(preferences.quietHoursEnabled) }
    var startHour by remember { mutableStateOf(preferences.quietStartHour.coerceIn(0, 23)) }
    var endHour by remember { mutableStateOf(preferences.quietEndHour.coerceIn(0, 23)) }
    var picking by remember { mutableStateOf<String?>(null) }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.NotificationsOff,
        title = "提醒设置",
        subtitle = "安静时段仍会保存通知历史，但不弹出系统通知",
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f))
                AppDialogPrimaryButton(
                    "保存",
                    {
                        onSave(
                            preferences.copy(
                                quietHoursEnabled = enabled,
                                quietStartHour = startHour,
                                quietEndHour = endHour,
                            ),
                        )
                    },
                    Modifier.weight(1f),
                )
            }
        },
    ) {
        AppActionRow(
            title = "启用安静时段",
            subtitle = "适合睡眠和专注时间",
            icon = Icons.Outlined.Bedtime,
            iconTint = ColorTokens.Indigo.foreground,
            onClick = { enabled = !enabled },
            trailingContent = {
                AppSwitch(checked = enabled, onCheckedChange = { enabled = it })
            },
        )
        if (enabled) {
            AppActionRow(
                title = "开始时间",
                subtitle = hourLabel(startHour),
                icon = Icons.Outlined.AccessTime,
                iconTint = ColorTokens.Blue.foreground,
                onClick = { picking = QUIET_START },
                trailingContent = null,
            )
            AppActionRow(
                title = "结束时间",
                subtitle = hourLabel(endHour),
                icon = Icons.Outlined.Schedule,
                iconTint = ColorTokens.Amber.foreground,
                onClick = { picking = QUIET_END },
                trailingContent = null,
            )
        }
    }

    when (picking) {
        QUIET_START -> AppTimePickerModal(
            title = "安静时段开始",
            currentTime = hourLabel(startHour),
            minuteStep = 60,
            onDismiss = { picking = null },
            onConfirm = { value ->
                startHour = value.substringBefore(':').toIntOrNull()?.coerceIn(0, 23) ?: startHour
                picking = null
            },
        )
        QUIET_END -> AppTimePickerModal(
            title = "安静时段结束",
            currentTime = hourLabel(endHour),
            minuteStep = 60,
            onDismiss = { picking = null },
            onConfirm = { value ->
                endHour = value.substringBefore(':').toIntOrNull()?.coerceIn(0, 23) ?: endHour
                picking = null
            },
        )
    }
}

private fun hourLabel(hour: Int): String = "%02d:00".format(hour)
