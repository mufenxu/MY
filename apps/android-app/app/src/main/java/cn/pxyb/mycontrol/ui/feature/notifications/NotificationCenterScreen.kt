package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.input.AppSearchBar
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.components.layout.AppListDetailMinWidth
import cn.pxyb.mycontrol.ui.theme.ColorTokens

private const val UNDO_WINDOW_MS = 5_000L

private const val QUIET_START = "quiet-start"

private const val QUIET_END = "quiet-end"

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
    onOpenSettings: () -> Unit,
    onBack: () -> Unit,
) {
    var filterTab by rememberSaveable { mutableStateOf(NotificationFilter.All.id) }
    var query by rememberSaveable { mutableStateOf("") }
    var selectedAlertId by rememberSaveable { mutableStateOf<String?>(null) }
    var snoozeTargetId by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingArchiveId by remember { mutableStateOf<String?>(null) }
    var archiveTarget by remember { mutableStateOf<AppAlertRecord?>(null) }
    var bulkConfirmation by remember { mutableStateOf<String?>(null) }
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
        archiveTarget = state.alerts.firstOrNull { it.id == id }
    }

    val headerActions: @Composable RowScope.() -> Unit = {
        if (unreadCount > 0) {
            AppHeaderIconButton(
                icon = Icons.Outlined.DoneAll,
                contentDescription = "全部已读",
                onClick = { bulkConfirmation = "read" },
                iconTint = ColorTokens.Green.foreground,
                containerColor = ColorTokens.Green.container,
            )
        }
        if (hasReadAlerts) {
            AppHeaderIconButton(
                icon = Icons.Outlined.DeleteOutline,
                contentDescription = "清理已读",
                onClick = { bulkConfirmation = "clear" },
                iconTint = ColorTokens.Red.foreground,
                containerColor = ColorTokens.Red.container,
            )
        }
        AppHeaderIconButton(
            icon = Icons.Outlined.Settings,
            contentDescription = "通知设置",
            onClick = onOpenSettings,
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
                AppFeedbackBanner("通知同步失败：$error", error = true, onRetry = onRefresh)
            }
        }
        if (state.preferences.quietHoursEnabled) {
            item(key = "quiet-hours", contentType = "banner") {
                AppFeedbackBanner(
                    message = "安静时段 ${"%02d:00".format(state.preferences.quietStartHour)} - ${"%02d:00".format(state.preferences.quietEndHour)} 内不弹出系统通知，历史仍会保留。",
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

    val isTablet = useTwoPaneLayout(AppListDetailMinWidth)

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

    bulkConfirmation?.let { action ->
        AppConfirmDialog(
            title = if (action == "clear") "清理全部已读通知？" else "将全部通知标为已读？",
            detail = if (action == "clear") {
                "将从通知中心移除全部已读通知，包括当前筛选条件外的通知。清理后无法在此恢复。"
            } else {
                "将全部未读通知标为已读，包括当前筛选条件外的通知，未读提醒也会消失。"
            },
            confirmLabel = if (action == "clear") "确认清理" else "全部已读",
            icon = if (action == "clear") Icons.Outlined.DeleteOutline else Icons.Outlined.DoneAll,
            danger = action == "clear",
            onDismiss = { bulkConfirmation = null },
            onConfirm = {
                bulkConfirmation = null
                if (action == "clear") onClearRead() else onMarkAllRead()
            },
        )
    }
    archiveTarget?.let { alert ->
        AppConfirmDialog(
            title = "归档通知？",
            detail = "将从通知中心移除“${alert.title}”。确认后仍可在 5 秒内撤销，之后无法在此恢复。",
            confirmLabel = "确认归档",
            icon = Icons.Outlined.DeleteOutline,
            danger = true,
            onDismiss = { archiveTarget = null },
            onConfirm = {
                archiveTarget = null
                pendingArchiveId?.takeIf { it != alert.id }?.let(onArchive)
                pendingArchiveId = alert.id
            },
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
