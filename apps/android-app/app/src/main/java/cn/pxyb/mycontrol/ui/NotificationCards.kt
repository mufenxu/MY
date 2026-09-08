package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppListCard
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.key
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Nfc
import androidx.compose.material.icons.outlined.DashboardCustomize
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AutomationCondition
import cn.pxyb.mycontrol.data.AutomationEngine
import cn.pxyb.mycontrol.data.AutomationRule
import cn.pxyb.mycontrol.data.AutomationRun
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationBlock
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.CampusAcademicCalendar
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusGpa
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.DeviceInfo
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.TodoCourseRef
import cn.pxyb.mycontrol.data.TodoTask
import java.text.DateFormat
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.UUID
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

@Composable
fun NotificationCenterScreen(
    state: NotificationCenterUiState,
    contentPadding: PaddingValues,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onOpen: (AppAlertRecord) -> Unit,
    onAction: (AppAlertRecord, AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkAllRead: () -> Unit,
    onClearRead: () -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    onUpdatePreferences: (AlertPreferences) -> Unit,
    onBack: () -> Unit,
) {
    var filterTab by rememberSaveable { mutableStateOf("all") }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var selectedAlertId by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingArchiveId by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val selectedAlert = state.alerts.firstOrNull {
        it.id == selectedAlertId && it.id != pendingArchiveId
    }

    LaunchedEffect(state.alerts, pendingArchiveId) {
        if (selectedAlertId != null && selectedAlert == null) selectedAlertId = null
    }

    LaunchedEffect(pendingArchiveId) {
        val id = pendingArchiveId ?: return@LaunchedEffect
        kotlinx.coroutines.delay(5_000)
        if (pendingArchiveId == id) {
            onArchive(id)
            pendingArchiveId = null
        }
    }

    fun queueArchive(id: String) {
        pendingArchiveId?.takeIf { it != id }?.let(onArchive)
        pendingArchiveId = id
    }

    val now = System.currentTimeMillis()
    val visibleAlerts = state.alerts.filter { alert ->
        if (alert.id == pendingArchiveId) return@filter false
        val isSnoozed = alert.snoozedUntil != null && alert.snoozedUntil > now
        when (filterTab) {
            "unread" -> !alert.read && !isSnoozed
            "snoozed" -> isSnoozed
            "incident" -> (alert.type == "incident" || alert.priority == "urgent" || alert.priority == "high") && !isSnoozed
            "task" -> alert.type == "task" && !isSnoozed
            "iot" -> alert.type == "iot" && !isSnoozed
            "security" -> alert.type == "security" && !isSnoozed
            else -> !isSnoozed
        }
    }
    val unreadCount = remember(state.alerts) { state.alerts.count { !it.read } }
    val hasUnreadAlerts = unreadCount > 0
    val hasReadAlerts = remember(state.alerts) { state.alerts.any(AppAlertRecord::read) }

    val isTablet = useTwoPaneLayout()

    if (isTablet) {
        // 平板 / 大屏：经典自适应 List-Detail 双栏布局
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding),
        ) {
            // 左栏：列表与过滤 (占 45% 宽度)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            ) {
                AppSecondaryHeader(
                    title = "通知中心",
                    subtitle = if (unreadCount > 0) "$unreadCount 条未读消息" else "系统告警、任务与设备消息",
                    onBack = onBack,
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    actions = {
                        if (hasUnreadAlerts) {
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
                            iconTint = MaterialTheme.colorScheme.onSurfaceVariant,
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        )
                    },
                )

                Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    CompactNotificationFilterBar(
                        selectedTab = filterTab,
                        onTabSelect = { filterTab = it },
                        alerts = state.alerts,
                    )
                }

                if (pendingArchiveId != null) {
                    AppPanel(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("通知已归档", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = { pendingArchiveId = null }) { Text("撤销") }
                        }
                    }
                }

                state.syncError?.let { error ->
                    FeedbackBanner("通知同步失败：$error", error = true, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                }

                PullToRefresh(
                    isRefreshing = refreshing,
                    onRefresh = onRefresh,
                    atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
                ) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (visibleAlerts.isEmpty()) {
                            item(key = "empty") {
                                EmptyBlock(
                                    if (filterTab == "unread") "全看完了，暂无未读通知" else "没有相关通知",
                                    "新的系统告警、任务提醒与设备消息会集中显示在这里。"
                                )
                            }
                        } else {
                            items(visibleAlerts, key = ::notificationItemKey) { alert ->
                                NotificationCard(
                                    alert = alert,
                                    onOpen = {
                                        selectedAlertId = alert.id
                                        onMarkRead(alert.id)
                                    },
                                    onMarkRead = onMarkRead,
                                    onArchive = ::queueArchive,
                                    onSnooze = onSnooze,
                                    selected = (selectedAlert?.id == alert.id),
                                )
                            }
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
            )

            // 右栏：详情面板 (占 55% 宽度)
            Box(
                modifier = Modifier
                    .weight(1.2f)
                    .fillMaxHeight()
                    .padding(16.dp),
            ) {
                val currentSelected = selectedAlert
                if (currentSelected != null) {
                    key(currentSelected.id) {
                    NotificationDetailPane(
                        alert = currentSelected,
                        onAction = { onAction(currentSelected, it) },
                        modifier = Modifier.fillMaxSize(),
                    )
                    }
                } else {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        shape = RoundedCornerShape(24.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)),
                    ) {
                        Column(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Outlined.Notifications,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                modifier = Modifier.size(48.dp),
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "选择通知查看详情",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                "在左侧选择任意一条消息以查看完整内容与快捷操作",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                }
            }
        }
    } else {
        // 手机模式：原有 NotificationWorkspacePage
        NotificationWorkspacePage(
            title = "通知中心",
            subtitle = if (unreadCount > 0) "$unreadCount 条未读消息" else "系统告警、任务与设备消息",
            contentPadding = contentPadding,
            refreshing = refreshing,
            onRefresh = onRefresh,
            onBack = onBack,
            listState = listState,
            actions = {
                if (hasUnreadAlerts) {
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
                    iconTint = MaterialTheme.colorScheme.onSurfaceVariant,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                )
            },
        ) {
            // 1. 单行超紧凑滑轨 Chip 过滤栏
            item(key = "filters", contentType = "filters") {
                CompactNotificationFilterBar(
                    selectedTab = filterTab,
                    onTabSelect = { filterTab = it },
                    alerts = state.alerts,
                )
            }
            if (pendingArchiveId != null) {
                item(key = "archive-undo", contentType = "banner") {
                    AppPanel {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("通知已归档", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = { pendingArchiveId = null }) { Text("撤销") }
                        }
                    }
                }
            }

            // 2. Banner 提醒
            state.syncError?.let { error ->
                item(key = "sync-error", contentType = "banner") {
                    FeedbackBanner("通知同步失败：$error", error = true)
                }
            }
            if (state.preferences.quietHoursEnabled) {
                item(key = "quiet-hours", contentType = "banner") {
                    FeedbackBanner(
                        "安静时段 ${hourLabel(state.preferences.quietStartHour)} - ${hourLabel(state.preferences.quietEndHour)}，通知自动静音。",
                        error = false,
                    )
                }
            }

            // 3. 通知列表
            if (visibleAlerts.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyBlock(
                        if (filterTab == "unread") "全看完了，暂无未读通知" else "没有相关通知",
                        "新的系统告警、任务提醒与设备消息会集中显示在这里。"
                    )
                }
            } else {
                items(visibleAlerts, key = ::notificationItemKey, contentType = { "notification" }) { alert ->
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
                        onArchive = ::queueArchive,
                        onSnooze = onSnooze,
                    )
                }
            }
        }
    }

    if (settingsOpen) {
        QuietHoursDialog(
            preferences = state.preferences,
            onDismiss = { settingsOpen = false },
            onSave = { onUpdatePreferences(it); settingsOpen = false },
        )
    }

    if (!isTablet) selectedAlert?.let { alert ->
        NotificationDetailDialog(
            alert = alert,
            onDismiss = { selectedAlertId = null },
            onAction = { action ->
                selectedAlertId = null
                onAction(alert, action)
            },
        )
    }
}

@Composable
private fun CompactNotificationFilterBar(
    selectedTab: String,
    onTabSelect: (String) -> Unit,
    alerts: List<AppAlertRecord>,
) {
    val unreadCount = remember(alerts) { alerts.count { !it.read } }
    val snoozedCount = remember(alerts) {
        val now = System.currentTimeMillis()
        alerts.count { it.snoozedUntil != null && it.snoozedUntil > now }
    }
    val incidentCount = remember(alerts) {
        val now = System.currentTimeMillis()
        alerts.count { (it.type == "incident" || it.priority == "urgent" || it.priority == "high") && (it.snoozedUntil == null || it.snoozedUntil <= now) }
    }
    val taskCount = remember(alerts) {
        val now = System.currentTimeMillis()
        alerts.count { it.type == "task" && (it.snoozedUntil == null || it.snoozedUntil <= now) }
    }
    val iotCount = remember(alerts) {
        val now = System.currentTimeMillis()
        alerts.count { it.type == "iot" && (it.snoozedUntil == null || it.snoozedUntil <= now) }
    }
    val securityCount = remember(alerts) {
        val now = System.currentTimeMillis()
        alerts.count { it.type == "security" && (it.snoozedUntil == null || it.snoozedUntil <= now) }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ModernNotificationFilterPill(
            selected = selectedTab == "all",
            onClick = { onTabSelect("all") },
            label = "全部",
            count = alerts.size,
            activeColor = MaterialTheme.colorScheme.primary,
        )
        ModernNotificationFilterPill(
            selected = selectedTab == "unread",
            onClick = { onTabSelect("unread") },
            label = "未读",
            count = unreadCount,
            activeColor = ColorTokens.Blue.foreground,
            icon = if (unreadCount > 0) Icons.Outlined.NotificationsActive else null,
        )
        if (incidentCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "incident",
                onClick = { onTabSelect("incident") },
                label = "告警",
                count = incidentCount,
                activeColor = ColorTokens.Red.foreground,
                icon = Icons.Outlined.Warning,
            )
        }
        if (taskCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "task",
                onClick = { onTabSelect("task") },
                label = "任务",
                count = taskCount,
                activeColor = ColorTokens.Amber.foreground,
                icon = Icons.Outlined.Assignment,
            )
        }
        if (iotCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "iot",
                onClick = { onTabSelect("iot") },
                label = "设备",
                count = iotCount,
                activeColor = ColorTokens.Green.foreground,
                icon = Icons.Outlined.Devices,
            )
        }
        if (securityCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "security",
                onClick = { onTabSelect("security") },
                label = "安全",
                count = securityCount,
                activeColor = ColorTokens.Purple.foreground,
                icon = Icons.Outlined.Security,
            )
        }
        if (snoozedCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "snoozed",
                onClick = { onTabSelect("snoozed") },
                label = "稍后",
                count = snoozedCount,
                activeColor = MaterialTheme.colorScheme.onSurfaceVariant,
                icon = Icons.Outlined.AccessTime,
            )
        }
    }
}

@Composable
private fun ModernNotificationFilterPill(
    selected: Boolean,
    onClick: () -> Unit,
    label: String,
    count: Int,
    activeColor: Color,
    icon: ImageVector? = null,
) {
    Surface(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) activeColor.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        border = BorderStroke(
            if (selected) 1.dp else 0.5.dp,
            if (selected) activeColor.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
        ),
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.5.dp),
        ) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(13.dp),
                    tint = if (selected) activeColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                )
            }
            Text(
                label,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    fontSize = 12.5.sp,
                ),
                color = if (selected) activeColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f),
            )
            if (count > 0) {
                Surface(
                    color = if (selected) activeColor else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text(
                        count.toString(),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                        ),
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationDetailPane(
    alert: AppAlertRecord,
    onAction: (AppNotificationAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val (categoryLabel, categoryBg, categoryFg) = when {
        alert.priority == "urgent" || alert.priority == "high" || alert.type == "incident" -> Triple("高危告警", ColorTokens.Red.container, ColorTokens.Red.foreground)
        alert.type == "task" -> Triple("任务待办", ColorTokens.Amber.container, ColorTokens.Amber.foreground)
        alert.type == "iot" -> Triple("IoT设备", ColorTokens.Green.container, ColorTokens.Green.foreground)
        alert.type == "security" -> Triple("安全提醒", ColorTokens.Purple.container, ColorTokens.Purple.foreground)
        else -> Triple("系统通知", ColorTokens.Blue.container, ColorTokens.Blue.foreground)
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
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
                Surface(
                    color = categoryBg,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        categoryLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = categoryFg,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                Text(
                    formatMillis(alert.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text(
                text = alert.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
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

            alert.contentBlocks.forEach { block ->
                NotificationBlockView(block)
            }

            if (alert.actions.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                Text("快捷操作", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
}

@Composable
private fun NotificationDetailDialog(
    alert: AppAlertRecord,
    onDismiss: () -> Unit,
    onAction: (AppNotificationAction) -> Unit,
) {
    val (categoryLabel, _, _) = when {
        alert.priority == "urgent" || alert.priority == "high" || alert.type == "incident" -> Triple("高危告警", ColorTokens.Red.container, ColorTokens.Red.foreground)
        alert.type == "task" -> Triple("任务待办", ColorTokens.Amber.container, ColorTokens.Amber.foreground)
        alert.type == "iot" -> Triple("IoT设备", ColorTokens.Green.container, ColorTokens.Green.foreground)
        alert.type == "security" -> Triple("安全提醒", ColorTokens.Purple.container, ColorTokens.Purple.foreground)
        else -> Triple("系统通知", ColorTokens.Blue.container, ColorTokens.Blue.foreground)
    }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Notifications,
        title = alert.title,
        subtitle = "${formatMillis(alert.createdAt)} · $categoryLabel",
        modifier = Modifier.heightIn(max = 640.dp),
        footer = {
            AppDialogSecondaryButton("关闭", onDismiss, Modifier.fillMaxWidth())
        },
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (alert.body.isNotBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = alert.body,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            alert.contentBlocks.forEach { block ->
                NotificationBlockView(block)
            }

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
}

@Composable
private fun NotificationBlockView(block: AppNotificationBlock) {
    val uriHandler = LocalUriHandler.current
    when (block.type) {
        "text" -> Text(block.text, style = MaterialTheme.typography.bodyLarge)
        "markdown" -> Text(block.markdown, style = MaterialTheme.typography.bodyLarge)
        "keyValue" -> Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                block.items.forEach { item ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(item.key, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(0.38f))
                        Text(item.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(0.62f))
                    }
                }
            }
        }
        "list" -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            block.listItems.forEach { item ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                    Box(
                        modifier = Modifier
                            .padding(top = 6.dp)
                            .size(6.dp)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(3.dp))
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                        if (item.description.isNotBlank()) {
                            Text(item.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        "progress" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(block.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text("${block.value ?: 0}%", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
            LinearProgressIndicator(
                progress = { ((block.value ?: 0).coerceIn(0, 100)) / 100f },
                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))
            )
        }
        "image", "attachment" -> {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = block.alt.ifBlank { block.fileName.ifBlank { block.url } },
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    if (block.url.isNotBlank()) {
                        TextButton(onClick = { runCatching { uriHandler.openUri(block.url) } }) {
                            Icon(Icons.Outlined.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(if (block.type == "image") "查看图片" else "打开附件")
                        }
                    }
                }
            }
        }
        else -> if (block.text.isNotBlank()) Text(block.text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun NotificationWorkspacePage(
    title: String,
    subtitle: String,
    contentPadding: PaddingValues,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    listState: LazyListState = rememberLazyListState(),
    actions: (@Composable RowScope.() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    val dark = isAppInDarkTheme()
    PullToRefresh(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter,
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxHeight()
                    .widthIn(max = AppTabletContentMaxWidth)
                    .fillMaxWidth()
                    .auroraBackdrop(dark)
                    .padding(
                        start = AppPageHorizontalPadding,
                        end = AppPageHorizontalPadding,
                        top = contentPadding.calculateTopPadding() + AppPageTopSpacing,
                    ),
                contentPadding = PaddingValues(bottom = contentPadding.calculateBottomPadding() + 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item(key = "header", contentType = "header") {
                    AppSecondaryHeader(
                        title = title,
                        subtitle = subtitle,
                        onBack = onBack,
                        actions = actions,
                    )
                }
                content()
            }
        }
    }
}

internal fun notificationItemKey(alert: AppAlertRecord): String = alert.id
@Composable
private fun QuietHoursDialog(preferences: AlertPreferences, onDismiss: () -> Unit, onSave: (AlertPreferences) -> Unit) {
    var enabled by remember { mutableStateOf(preferences.quietHoursEnabled) }
    var start by remember { mutableStateOf(preferences.quietStartHour.toString()) }
    var end by remember { mutableStateOf(preferences.quietEndHour.toString()) }
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
                                quietStartHour = start.toIntOrNull()?.coerceIn(0, 23) ?: 22,
                                quietEndHour = end.toIntOrNull()?.coerceIn(0, 23) ?: 7,
                            )
                        )
                    },
                    Modifier.weight(1f),
                )
            }
        },
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("启用安静时段", style = MaterialTheme.typography.titleMedium)
                Text("适合睡眠和专注时间", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            AppSwitch(checked = enabled, onCheckedChange = { enabled = it })
        }
        if (enabled) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                DialogTextField(start, { start = it.filter(Char::isDigit).take(2) }, "开始小时", Modifier.weight(1f))
                DialogTextField(end, { end = it.filter(Char::isDigit).take(2) }, "结束小时", Modifier.weight(1f))
            }
        }
    }
}

private fun hourLabel(hour: Int): String = "%02d:00".format(hour)
private data class Hexa<A, B, C, D, E, F>(val first: A, val second: B, val third: C, val fourth: D, val fifth: E, val sixth: F)

@Composable
internal fun NotificationCard(
    alert: AppAlertRecord,
    onOpen: (AppAlertRecord) -> Unit,
    onMarkRead: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    selected: Boolean = false,
) {
    var offsetX by remember(alert.id) { mutableFloatStateOf(0f) }
    val deleteThresholdPx = with(androidx.compose.ui.platform.LocalDensity.current) { 96.dp.toPx() }

    val isUrgent = alert.priority == "urgent" || alert.priority == "high" || alert.type == "incident"
    val isTask = alert.type == "task"
    val isIot = alert.type == "iot"
    val isSecurity = alert.type == "security"

    val categoryColors = when {
        isUrgent -> ColorTokens.Red
        isTask -> ColorTokens.Amber
        isIot -> ColorTokens.Green
        isSecurity -> ColorTokens.Purple
        else -> ColorTokens.Blue
    }
    val (categoryLabel, categoryBg, categoryFg, categoryBorder, icon, gradientBrush) = remember(isUrgent, isTask, isIot, isSecurity, categoryColors) {
        when {
            isUrgent -> Hexa(
                "告警",
                categoryColors.container,
                categoryColors.foreground,
                categoryColors.border,
                Icons.Outlined.Warning,
                Brush.linearGradient(listOf(Color(0xFFEF4444), Color(0xFFDC2626))),
            )
            isTask -> Hexa(
                "任务",
                categoryColors.container,
                categoryColors.foreground,
                categoryColors.border,
                Icons.Outlined.Assignment,
                Brush.linearGradient(listOf(Color(0xFFF59E0B), Color(0xFFD97706))),
            )
            isIot -> Hexa(
                "设备",
                categoryColors.container,
                categoryColors.foreground,
                categoryColors.border,
                Icons.Outlined.Devices,
                Brush.linearGradient(listOf(Color(0xFF10B981), Color(0xFF059669))),
            )
            isSecurity -> Hexa(
                "安全",
                categoryColors.container,
                categoryColors.foreground,
                categoryColors.border,
                Icons.Outlined.Security,
                Brush.linearGradient(listOf(Color(0xFF8B5CF6), Color(0xFF7C3AED))),
            )
            else -> Hexa(
                "通知",
                categoryColors.container,
                categoryColors.foreground,
                categoryColors.border,
                Icons.Outlined.Notifications,
                Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF2563EB))),
            )
        }
    }

    Box(contentAlignment = Alignment.CenterEnd) {
        // 仅在用户滑动时才显示底层归档删除背景，彻底杜绝静态透光鬼影
        if (offsetX < 0f) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(Color.Transparent, MaterialTheme.colorScheme.errorContainer),
                        ),
                        RoundedCornerShape(18.dp),
                    )
                    .padding(horizontal = 22.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Outlined.DeleteOutline, contentDescription = "归档", tint = MaterialTheme.colorScheme.onErrorContainer)
                    Text("右滑归档", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }

        // 纯净、通透、高质感的圆角卡片
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetX.roundToInt(), 0) }
                .clip(RoundedCornerShape(18.dp))
                .pointerInput(alert.id) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { _, dragAmount ->
                            if (dragAmount < 0f || offsetX < 0f) {
                                offsetX = (offsetX + dragAmount).coerceAtMost(0f)
                            }
                        },
                        onDragEnd = {
                            if (-offsetX >= deleteThresholdPx) onArchive(alert.id)
                            offsetX = 0f
                        },
                        onDragCancel = { offsetX = 0f },
                    )
                }
                .clickable { onOpen(alert) },
            shape = RoundedCornerShape(18.dp),
            color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else glassCardColor(),
            border = BorderStroke(
                if (selected) 1.5.dp else if (!alert.read && isUrgent) 1.2.dp else 0.6.dp,
                if (selected) MaterialTheme.colorScheme.primary
                else if (!alert.read && isUrgent) ColorTokens.Red.foreground
                else if (!alert.read) MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            ),
            shadowElevation = 0.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 15.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // 顶部行：左侧圆角徽章 + 中间标题/时间 + 右侧类型徽章 + 未读蓝点
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (!alert.read) gradientBrush else Brush.linearGradient(listOf(Color(0xFF94A3B8), Color(0xFF64748B)))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            icon,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = alert.title,
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = if (!alert.read) FontWeight.Bold else FontWeight.Medium,
                                    fontSize = 15.sp,
                                    letterSpacing = (-0.2).sp,
                                ),
                                color = if (!alert.read) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(6.dp))
                            Surface(
                                color = categoryBg,
                                shape = RoundedCornerShape(6.dp),
                                border = BorderStroke(0.5.dp, categoryBorder),
                            ) {
                                Text(
                                    text = categoryLabel,
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 10.5.sp,
                                    ),
                                    color = categoryFg,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            }
                            if (!alert.read) {
                                Spacer(Modifier.width(5.dp))
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .background(ColorTokens.Blue.foreground, CircleShape),
                                )
                            }
                        }

                        Text(
                            text = formatMillis(alert.createdAt),
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                        )
                    }
                }

                // 描述正文：直接以纯净优雅的字体呈现，完全去除突兀的方块背景
                if (alert.body.isNotBlank()) {
                    Text(
                        text = alert.body,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontSize = 13.5.sp,
                            lineHeight = 19.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (!alert.read) 0.9f else 0.7f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 2.dp),
                    )
                }

                // 结构化内容指示
                if (alert.contentBlocks.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(start = 2.dp),
                    ) {
                        Icon(
                            Icons.Outlined.Info,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = "包含 ${alert.contentBlocks.size} 项详细记录与操作 · 点击查看",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Medium,
                                fontSize = 11.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                // 底部操作行
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        shape = RoundedCornerShape(6.dp),
                    ) {
                        Text(
                            text = if (alert.origin == "remote") "☁️ 云端同步" else "📱 本地提醒",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Medium,
                                fontSize = 10.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (!alert.read) {
                            Surface(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { onMarkRead(alert.id) },
                                shape = RoundedCornerShape(12.dp),
                                color = ColorTokens.Blue.container,
                                border = BorderStroke(0.6.dp, ColorTokens.Blue.border),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                ) {
                                    Icon(
                                        Icons.Outlined.MarkEmailRead,
                                        contentDescription = null,
                                        modifier = Modifier.size(13.dp),
                                        tint = ColorTokens.Blue.foreground,
                                    )
                                    Text(
                                        "设已读",
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.5.sp,
                                        ),
                                        color = ColorTokens.Blue.foreground,
                                    )
                                }
                            }
                        }

                        Surface(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onSnooze(alert.id) },
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerLow,
                            border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Icon(
                                    Icons.Outlined.AccessTime,
                                    contentDescription = null,
                                    modifier = Modifier.size(13.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    "稍后",
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontWeight = FontWeight.Medium,
                                        fontSize = 11.5.sp,
                                    ),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
