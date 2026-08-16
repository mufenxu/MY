package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Category
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LibraryBooks
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextDecoration
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
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
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

private enum class CampusWorkspaceSection { Today, Timetable, Campus }

@Composable
fun TodayScreen(
    state: TodayUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onSaveTodo: (TodoTask) -> Unit,
    onToggleTodo: (String) -> Unit,
    onDeleteTodo: (String) -> Unit,
    onSyncCalendar: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenTasks: () -> Unit,
) {
    var editingTodo by remember { mutableStateOf<TodoTask?>(null) }
    var addingTodo by remember { mutableStateOf(false) }
    var campusSection by remember { mutableStateOf(CampusWorkspaceSection.Today) }
    val week = remember(state.timetable?.currentCalendarText) {
        Regex("第(\\d+)周").find(state.timetable?.currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
    }
    val today = DayOfWeek.from(LocalDate.now()).value
    val courses = remember(state.timetable, week, today) {
        state.timetable?.courses.orEmpty()
            .filter { it.day == today && (week == null || it.weeks.isEmpty() || week in it.weeks) }
            .sortedBy(CampusCourse::startSection)
    }
    val activeTodos = remember(state.todoSnapshot.tasks) {
        state.todoSnapshot.tasks.filterNot(TodoTask::completed)
    }
    val expiringResources = remember(state.resourceExpiries) {
        state.resourceExpiries.mapNotNull { resource ->
            val date = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return@mapNotNull null
            val days = ChronoUnit.DAYS.between(LocalDate.now(), date).toInt()
            (resource to days).takeIf { days <= maxOf(60, resource.advanceNoticeDays) }
        }.sortedBy { it.second }
    }
    WorkspacePage(
        title = "今日工作台",
        subtitle = listOfNotNull(
            state.timetable?.currentCalendarText?.takeIf(String::isNotBlank),
            "${courses.size} 节课",
            "${activeTodos.size} 项待办",
        ).joinToString(" · "),
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.CalendarMonth,
                contentDescription = "同步到 Android 日历",
                onClick = onSyncCalendar,
                enabled = !state.calendarSyncing,
                loading = state.calendarSyncing,
            )
        },
    ) {
        if (state.offlineMode || state.pendingTodoMutations > 0) {
            FeedbackBanner(
                message = if (state.pendingTodoMutations > 0) {
                    "${state.pendingTodoMutations} 项更改已保存在本机，联网后自动同步。"
                } else {
                    "当前展示离线快照，个人待办仍可编辑。"
                },
                error = false,
            )
        }
        state.sectionError?.let { FeedbackBanner("部分今日数据暂不可用：$it", error = true) }

        SectionHeader("校园智览", state.timetable?.termText ?: "课表与校园生活信息")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = campusSection == CampusWorkspaceSection.Today,
                onClick = { campusSection = CampusWorkspaceSection.Today },
                label = { Text("今日课程") },
            )
            FilterChip(
                selected = campusSection == CampusWorkspaceSection.Timetable,
                onClick = { campusSection = CampusWorkspaceSection.Timetable },
                label = { Text("本学期课表") },
            )
            FilterChip(
                selected = campusSection == CampusWorkspaceSection.Campus,
                onClick = { campusSection = CampusWorkspaceSection.Campus },
                label = { Text("校园信息") },
            )
        }

        when (campusSection) {
            CampusWorkspaceSection.Today -> {
                SectionHeader("今天的课程", state.timetable?.currentCalendarText)
                if (courses.isEmpty()) {
                    EmptyBlock("今天没有课程", "可以把时间留给个人待办或需要处理的事项。")
                } else {
                    courses.forEach { course -> CourseCard(course) }
                }

                SectionHeader(
                    "个人待办",
                    "${activeTodos.size} 项未完成",
                    trailing = {
                        IconButton(onClick = { addingTodo = true }) {
                            Icon(Icons.Outlined.Add, contentDescription = "添加待办")
                        }
                    },
                )
                if (state.todoSnapshot.tasks.isEmpty()) {
                    AppPanel(onClick = { addingTodo = true }) {
                        Row(
                            modifier = Modifier.padding(18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            IconTile(Icons.Outlined.Add, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
                            Column {
                                Text("添加第一项待办", style = MaterialTheme.typography.titleMedium)
                                Text("支持截止时间、优先级、重复和课程关联", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                } else {
                    state.todoSnapshot.tasks.forEach { task ->
                        TodoCard(task, onToggleTodo, { editingTodo = task }, onDeleteTodo)
                    }
                }

                SectionHeader("需要处理", "系统提醒与平台任务")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AttentionCard(
                        label = "系统通知",
                        value = state.incidents.count { it.status != "resolved" },
                        onClick = onOpenNotifications,
                        modifier = Modifier.weight(1f),
                    )
                    AttentionCard(
                        label = "待处理任务",
                        value = state.tasks.count { it.status in setOf("action_required", "failed", "pending") },
                        onClick = onOpenTasks,
                        modifier = Modifier.weight(1f),
                    )
                }

                if (expiringResources.isNotEmpty()) {
                    SectionHeader("即将到期", "脱敏资源摘要，不包含密码或连接凭据")
                    expiringResources.take(6).forEach { (resource, days) -> ResourceExpiryCard(resource, days) }
                }
            }
            CampusWorkspaceSection.Timetable -> TermTimetable(state.timetable?.courses.orEmpty(), state.timetable?.currentCalendarText)
            CampusWorkspaceSection.Campus -> CampusOverviewSection(state.campusOverview)
        }
    }

    if (addingTodo || editingTodo != null) {
        TodoEditorDialog(
            task = editingTodo,
            courses = state.timetable?.courses.orEmpty().distinctBy(CampusCourse::id),
            onDismiss = { addingTodo = false; editingTodo = null },
            onSave = {
                onSaveTodo(it)
                addingTodo = false
                editingTodo = null
            },
        )
    }
}

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
    var filterTab by remember { mutableStateOf("all") }
    var settingsOpen by remember { mutableStateOf(false) }
    var selectedAlert by remember { mutableStateOf<AppAlertRecord?>(null) }
    val now = System.currentTimeMillis()

    val visibleAlerts = state.alerts.filter { alert ->
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

    val unreadCount = state.alerts.count { !it.read }

    NotificationWorkspacePage(
        title = "通知中心",
        subtitle = if (unreadCount > 0) "$unreadCount 条未读消息" else "系统告警、任务与设备消息",
        contentPadding = contentPadding,
        refreshing = refreshing,
        onRefresh = onRefresh,
        onBack = onBack,
        actions = {
            if (state.alerts.any { !it.read }) {
                AppHeaderIconButton(
                    icon = Icons.Outlined.DoneAll,
                    contentDescription = "全部已读",
                    onClick = onMarkAllRead,
                    iconTint = Color(0xFF059669),
                    containerColor = Color(0xFFECFDF5),
                )
            }
            if (state.alerts.any { it.read }) {
                AppHeaderIconButton(
                    icon = Icons.Outlined.DeleteOutline,
                    contentDescription = "清理已读",
                    onClick = onClearRead,
                    iconTint = Color(0xFFDC2626),
                    containerColor = Color(0xFFFEF2F2),
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
                            selectedAlert = alert
                            onMarkRead(alert.id)
                        } else {
                            onOpen(alert)
                        }
                    },
                    onMarkRead = onMarkRead,
                    onArchive = onArchive,
                    onSnooze = onSnooze,
                )
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

    selectedAlert?.let { alert ->
        NotificationDetailDialog(
            alert = alert,
            onDismiss = { selectedAlert = null },
            onAction = { action ->
                selectedAlert = null
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
            activeColor = Color(0xFF2563EB),
            icon = if (unreadCount > 0) Icons.Outlined.NotificationsActive else null,
        )
        if (incidentCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "incident",
                onClick = { onTabSelect("incident") },
                label = "告警",
                count = incidentCount,
                activeColor = Color(0xFFDC2626),
                icon = Icons.Outlined.Warning,
            )
        }
        if (taskCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "task",
                onClick = { onTabSelect("task") },
                label = "任务",
                count = taskCount,
                activeColor = Color(0xFFD97706),
                icon = Icons.Outlined.Assignment,
            )
        }
        if (iotCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "iot",
                onClick = { onTabSelect("iot") },
                label = "设备",
                count = iotCount,
                activeColor = Color(0xFF059669),
                icon = Icons.Outlined.Devices,
            )
        }
        if (securityCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "security",
                onClick = { onTabSelect("security") },
                label = "安全",
                count = securityCount,
                activeColor = Color(0xFF7C3AED),
                icon = Icons.Outlined.Security,
            )
        }
        if (snoozedCount > 0) {
            ModernNotificationFilterPill(
                selected = selectedTab == "snoozed",
                onClick = { onTabSelect("snoozed") },
                label = "稍后",
                count = snoozedCount,
                activeColor = Color(0xFF64748B),
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
        color = if (selected) activeColor.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            if (selected) 1.dp else 0.5.dp,
            if (selected) activeColor.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
        ),
        shadowElevation = if (selected) 0.5.dp else 0.dp,
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
                        color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
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
        alert.priority == "urgent" || alert.priority == "high" || alert.type == "incident" -> Triple("高危告警", Color(0xFFFEE2E2), Color(0xFF991B1B))
        alert.type == "task" -> Triple("任务待办", Color(0xFFFEF3C7), Color(0xFF92400E))
        alert.type == "iot" -> Triple("IoT设备", Color(0xFFD1FAE5), Color(0xFF065F46))
        alert.type == "security" -> Triple("安全提醒", Color(0xFFEDE9FE), Color(0xFF5B21B6))
        else -> Triple("系统通知", Color(0xFFDBEAFE), Color(0xFF1E40AF))
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
                    Button(
                        onClick = { onAction(action) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Outlined.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(action.label)
                    }
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
fun InsightsScreen(
    state: InsightsUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
) {
    var days by remember { mutableStateOf(7) }
    val samples = state.samples.takeLast(days)
    val latest = samples.lastOrNull()
    val earlier = samples.firstOrNull()

    val (statusLabel, statusBg, statusFg, statusIcon) = when {
        samples.size < 2 -> Quadruple("数据积累中", Color(0xFFF1F5F9), Color(0xFF64748B), Icons.Outlined.Info)
        latest == null || earlier == null -> Quadruple("暂无数据", Color(0xFFF1F5F9), Color(0xFF64748B), Icons.Outlined.Info)
        latest.activeIncidents < earlier.activeIncidents -> Quadruple("状态改善", Color(0xFFD1FAE5), Color(0xFF065F46), Icons.Outlined.CheckCircle)
        latest.activeIncidents > earlier.activeIncidents -> Quadruple("异常增加", Color(0xFFFEE2E2), Color(0xFF991B1B), Icons.Outlined.Warning)
        latest.onlineDevices < earlier.onlineDevices -> Quadruple("设备离线", Color(0xFFFEF3C7), Color(0xFF92400E), Icons.Outlined.Warning)
        else -> Quadruple("运行平稳", Color(0xFFDBEAFE), Color(0xFF1E40AF), Icons.Outlined.CheckCircle)
    }

    val conclusion = when {
        samples.size < 2 -> "趋势记录刚开始积累。继续使用几天后，这里会给出可靠的变化结论。"
        latest == null || earlier == null -> "暂无足够数据。"
        latest.activeIncidents < earlier.activeIncidents -> "系统异常比周期开始时减少，整体运行状态正在改善。"
        latest.activeIncidents > earlier.activeIncidents -> "系统异常比周期开始时增加，建议优先查看通知中心。"
        latest.onlineDevices < earlier.onlineDevices -> "在线设备数有所下降，建议检查离线设备与网络连接。"
        else -> "本周期核心指标整体平稳，没有发现明显恶化趋势。"
    }

    WorkspacePage(
        title = "趋势与周报",
        subtitle = "基于本机实际采样，不补造缺失数据",
        contentPadding = contentPadding,
        onBack = onBack,
    ) {
        // 1. 时间范围切换 Chip 行
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = days == 7, onClick = { days = 7 }, label = { Text("近 7 天") })
                FilterChip(selected = days == 30, onClick = { days = 30 }, label = { Text("近 30 天") })
            }
            Text(
                text = "已采样 ${samples.size} 天",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // 2. 本期结论卡片
        AppPanel {
            Column(
                modifier = Modifier
                    .background(
                        Brush.linearGradient(
                            listOf(
                                statusBg.copy(alpha = 0.35f),
                                MaterialTheme.colorScheme.surface
                            )
                        )
                    )
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        IconTile(statusIcon, statusFg, statusBg)
                        Text(
                            text = "本期分析结论",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Surface(
                        color = statusBg,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = statusLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = statusFg,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                Text(
                    text = conclusion,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    lineHeight = 22.sp
                )
            }
        }

        // 3. 趋势图表组与概览 Cell
        if (samples.isEmpty()) {
            EmptyBlock("暂无趋势样本", "首页和后台同步成功后会每天记录一次关键指标。")
        } else {
            ModernTrendChart(
                title = "服务健康率",
                samples = samples,
                getValue = { if (it.serviceTotal == 0) 0 else (it.healthyServices * 100 / it.serviceTotal) },
                suffix = "%",
                primaryColor = Color(0xFF10B981),
                maxScale = 100
            )

            ModernTrendChart(
                title = "系统异常数",
                samples = samples,
                getValue = { it.activeIncidents },
                suffix = "次",
                primaryColor = Color(0xFFEF4444),
                maxScale = null
            )

            ModernTrendChart(
                title = "在线设备数",
                samples = samples,
                getValue = { it.onlineDevices },
                suffix = "台",
                primaryColor = Color(0xFF3B82F6),
                maxScale = null
            )

            latest?.let {
                AppPanel {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            text = "最新指标快照",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            EnhancedMetricCard(
                                icon = Icons.Outlined.CheckCircle,
                                label = "健康服务",
                                value = "${it.healthyServices}/${it.serviceTotal}",
                                color = Color(0xFF10B981),
                                modifier = Modifier.weight(1f)
                            )
                            EnhancedMetricCard(
                                icon = Icons.Outlined.Assignment,
                                label = "待处理任务",
                                value = "${it.pendingTasks}",
                                color = Color(0xFFF59E0B),
                                modifier = Modifier.weight(1f)
                            )
                            EnhancedMetricCard(
                                icon = Icons.Outlined.Devices,
                                label = "在线设备",
                                value = "${it.onlineDevices}/${it.deviceTotal}",
                                color = Color(0xFF3B82F6),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ScenesScreen(
    state: ScenesUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onRun: (String) -> Unit,
    onSave: (String?, String, List<IotSceneAction>) -> Unit,
    onDelete: (String) -> Unit,
    onSaveRule: (String?, String, Boolean, AutomationCondition, List<IotSceneAction>, Int) -> Unit,
    onToggleRule: (String, Boolean) -> Unit,
    onDeleteRule: (String) -> Unit,
) {
    var editing by remember { mutableStateOf<IotScene?>(null) }
    var adding by remember { mutableStateOf(false) }
    var editingRule by remember { mutableStateOf<AutomationRule?>(null) }
    var addingRule by remember { mutableStateOf(false) }

    WorkspacePage(
        title = "智能场景与自动化",
        subtitle = "手动控制场景或配置条件自动联动执行",
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.Add,
                contentDescription = "新建场景",
                onClick = { adding = true },
                enabled = !state.offlineMode,
            )
        },
    ) {
        if (state.offlineMode) FeedbackBanner("离线时仅可查看场景，联网后才能执行或编辑。", error = false)
        state.sectionError?.let { FeedbackBanner(it, error = true) }
        val scenes = state.iot?.scenes.orEmpty()
        
        Text(
            text = "手动执行场景",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 4.dp, bottom = 2.dp)
        )

        if (scenes.isEmpty()) {
            EmptyBlock("还没有智能场景", "新建场景后，可以把多个设备动作合并为一次操作。")
        } else {
            scenes.forEach { scene ->
                SceneCard(
                    scene = scene,
                    busy = state.busyAction != null,
                    enabled = !state.offlineMode,
                    onRun = onRun,
                    onEdit = { editing = scene },
                    onDelete = onDelete,
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        SectionHeader(
            title = "条件自动化",
            subtitle = "${state.iot?.rules.orEmpty().size} 条真实规则，由 IoT 服务执行并审计",
            trailing = {
                IconButton(
                    onClick = { addingRule = true },
                    enabled = !state.offlineMode && state.iot?.devices.orEmpty().isNotEmpty() && state.iot?.scenes.orEmpty().isNotEmpty(),
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = "新建自动化规则")
                }
            },
        )

        val rules = state.iot?.rules.orEmpty()
        if (rules.isEmpty()) {
            EmptyBlock("还没有自动化规则", "先创建场景，再按设备状态或环境指标配置自动执行条件。")
        } else {
            rules.forEach { rule ->
                AutomationRuleCard(
                    rule = rule,
                    devices = state.iot?.devices.orEmpty(),
                    busy = state.busyAction != null,
                    onToggle = { enabled -> onToggleRule(rule.id, enabled) },
                    onEdit = { editingRule = rule },
                    onDelete = { onDeleteRule(rule.id) },
                )
            }
        }

        SectionHeader("最近执行", "规则和场景的真实指令结果")
        val runs = state.iot?.runs.orEmpty()
        if (runs.isEmpty()) {
            EmptyBlock("暂无执行记录", "手动运行场景或规则触发后会在这里留下审计记录。")
        } else {
            runs.take(8).forEach { run -> AutomationRunCard(run) }
        }
    }
    if (adding || editing != null) {
        SceneEditorDialog(
            scene = editing,
            devices = state.iot?.devices.orEmpty(),
            onDismiss = { adding = false; editing = null },
            onSave = { id, name, actions ->
                onSave(id, name, actions)
                adding = false
                editing = null
            },
        )
    }
    if (addingRule || editingRule != null) {
        AutomationRuleEditorDialog(
            rule = editingRule,
            devices = state.iot?.devices.orEmpty(),
            scenes = state.iot?.scenes.orEmpty(),
            onDismiss = { addingRule = false; editingRule = null },
            onSave = { id, name, enabled, condition, actions, cooldownSeconds ->
                onSaveRule(id, name, enabled, condition, actions, cooldownSeconds)
                addingRule = false
                editingRule = null
            },
        )
    }
}

@Composable
private fun WorkspacePage(
    title: String,
    subtitle: String,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    refreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val scrollState = rememberScrollState()
    PullToRefresh(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        enabled = onRefresh != null,
        atTop = { scrollState.value == 0 },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(appPageContentPadding(contentPadding, bottomSpacing = 18.dp)),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppSecondaryHeader(
                title = title,
                subtitle = subtitle,
                onBack = onBack,
                actions = actions,
            )
            content()
        }
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
    actions: (@Composable RowScope.() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    val listState = rememberLazyListState()
    PullToRefresh(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
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

private enum class TimetableDisplayMode { Grid, List }

internal fun notificationItemKey(alert: AppAlertRecord): String = alert.id

private data class CourseColorScheme(
    val background: Color,
    val contentColor: Color,
    val accentColor: Color,
)

private val CoursePalette = listOf(
    CourseColorScheme(Color(0xFFEFF6FF), Color(0xFF1E40AF), Color(0xFF3B82F6)), // 湛蓝
    CourseColorScheme(Color(0xFFF0FDF4), Color(0xFF166534), Color(0xFF22C55E)), // 翡翠
    CourseColorScheme(Color(0xFFFAF5FF), Color(0xFF6B21A8), Color(0xFFA855F7)), // 罗兰紫
    CourseColorScheme(Color(0xFFFFF7ED), Color(0xFF9A3412), Color(0xFFF97316)), // 暖橙
    CourseColorScheme(Color(0xFFECFEFF), Color(0xFF155E75), Color(0xFF06B6D4)), // 蓝绿
    CourseColorScheme(Color(0xFFFDF2F8), Color(0xFF9D174D), Color(0xFFEC4899)), // 珊瑚粉
    CourseColorScheme(Color(0xFFFEFCE8), Color(0xFF854D0E), Color(0xFFEAB308)), // 琥珀黄
)

private fun getCourseColorScheme(courseName: String): CourseColorScheme {
    val index = kotlin.math.abs(courseName.hashCode()) % CoursePalette.size
    return CoursePalette[index]
}

@Composable
private fun TermTimetable(courses: List<CampusCourse>, currentCalendarText: String? = null) {
    val orderedCourses = remember(courses) {
        courses.sortedWith(compareBy(CampusCourse::day).thenBy(CampusCourse::startSection).thenBy(CampusCourse::courseName))
    }
    if (orderedCourses.isEmpty()) {
        EmptyBlock("课表暂未同步", "连接学校账号后，下拉刷新即可查看本学期全部课程。")
        return
    }

    val currentWeekNum = remember(currentCalendarText) {
        Regex("第(\\d+)周").find(currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 1
    }
    var selectedWeek by remember(currentWeekNum) { mutableStateOf(currentWeekNum) }
    var displayMode by remember { mutableStateOf(TimetableDisplayMode.Grid) }
    var selectedCourseDetail by remember { mutableStateOf<CampusCourse?>(null) }

    val totalCourseCount = orderedCourses.map(CampusCourse::courseName).distinct().size
    val currentWeekCourses = remember(orderedCourses, selectedWeek) {
        orderedCourses.filter { course ->
            course.weeks.isEmpty() || selectedWeek in course.weeks
        }
    }

    AppPanel {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "第 $selectedWeek 周课表",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        if (selectedWeek == currentWeekNum) {
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.primary,
                                shape = RoundedCornerShape(8.dp),
                            ) {
                                Text(
                                    "本周",
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                    Text(
                        "全学期 $totalCourseCount 门课程 · 本周 ${currentWeekCourses.size} 节安排",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Row(modifier = Modifier.padding(3.dp)) {
                        val gridShape = RoundedCornerShape(11.dp)
                        Surface(
                            modifier = Modifier
                                .clip(gridShape)
                                .clickable { displayMode = TimetableDisplayMode.Grid },
                            color = if (displayMode == TimetableDisplayMode.Grid) MaterialTheme.colorScheme.primary else Color.Transparent,
                            contentColor = if (displayMode == TimetableDisplayMode.Grid) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = gridShape,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(Icons.Outlined.GridView, contentDescription = null, modifier = Modifier.size(15.dp))
                                Text("矩阵", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        val listShape = RoundedCornerShape(11.dp)
                        Surface(
                            modifier = Modifier
                                .clip(listShape)
                                .clickable { displayMode = TimetableDisplayMode.List },
                            color = if (displayMode == TimetableDisplayMode.List) MaterialTheme.colorScheme.primary else Color.Transparent,
                            contentColor = if (displayMode == TimetableDisplayMode.List) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = listShape,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(Icons.AutoMirrored.Outlined.ViewList, contentDescription = null, modifier = Modifier.size(15.dp))
                                Text("列表", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                (1..20).forEach { week ->
                    val isCurrent = week == currentWeekNum
                    val isSelected = week == selectedWeek
                    FilterChip(
                        selected = isSelected,
                        onClick = { selectedWeek = week },
                        label = {
                            Text(
                                if (isCurrent) "第 $week 周 (本周)" else "第 $week 周",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = if (isSelected || isCurrent) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                    )
                }
            }
        }
    }

    if (displayMode == TimetableDisplayMode.Grid) {
        CourseGridMatrix(
            courses = orderedCourses,
            selectedWeek = selectedWeek,
            onCourseClick = { selectedCourseDetail = it },
        )
    } else {
        orderedCourses.groupBy(CampusCourse::day).forEach { (day, sessions) ->
            SectionHeader(
                sessions.firstOrNull()?.dayName?.takeIf(String::isNotBlank) ?: weekdayLabel(day),
                "${sessions.size} 节安排",
            )
            sessions.forEach { course ->
                CourseCard(
                    course = course,
                    showWeek = true,
                    selectedWeek = selectedWeek,
                    onClick = { selectedCourseDetail = course },
                )
            }
        }
    }

    selectedCourseDetail?.let { course ->
        CourseDetailDialog(
            course = course,
            selectedWeek = selectedWeek,
            onDismiss = { selectedCourseDetail = null },
        )
    }
}

@Composable
private fun CourseGridMatrix(
    courses: List<CampusCourse>,
    selectedWeek: Int,
    onCourseClick: (CampusCourse) -> Unit,
) {
    val days = listOf("一", "二", "三", "四", "五", "六", "日")

    AppPanel(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(30.dp)
                        .height(34.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "节次",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                days.forEachIndexed { index, day ->
                    val isToday = (index + 1) == DayOfWeek.from(LocalDate.now()).value
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(34.dp)
                            .background(
                                if (isToday) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f) else Color.Transparent,
                                shape = RoundedCornerShape(8.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            "周$day",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (isToday) FontWeight.Bold else FontWeight.Medium,
                            color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            HorizontalDivider(
                modifier = Modifier.padding(vertical = 6.dp),
                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            )

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                for (section in 1..11 step 2) {
                    val endSec = section + 1
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(72.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .width(30.dp)
                                .fillMaxHeight(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    "$section",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    "$endSec",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                                )
                            }
                        }

                        for (dayIndex in 1..7) {
                            val matchingCourse = courses.firstOrNull { course ->
                                course.day == dayIndex && (course.startSection <= section && course.endSection >= section)
                            }

                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .padding(horizontal = 2.dp),
                            ) {
                                if (matchingCourse != null) {
                                    val isThisWeek = matchingCourse.weeks.isEmpty() || selectedWeek in matchingCourse.weeks
                                    val colorScheme = getCourseColorScheme(matchingCourse.courseName)

                                    val bg = if (isThisWeek) colorScheme.background else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                                    val textColor = if (isThisWeek) colorScheme.contentColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                    val borderColor = if (isThisWeek) colorScheme.accentColor.copy(alpha = 0.35f) else Color.Transparent

                                    val courseShape = RoundedCornerShape(10.dp)
                                    Surface(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .clip(courseShape)
                                            .clickable { onCourseClick(matchingCourse) },
                                        color = bg,
                                        shape = courseShape,
                                        border = BorderStroke(0.5.dp, borderColor),
                                    ) {
                                        Column(
                                            modifier = Modifier
                                                .padding(4.dp)
                                                .fillMaxSize(),
                                            verticalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Text(
                                                matchingCourse.courseName,
                                                style = MaterialTheme.typography.labelSmall.copy(
                                                    fontSize = 10.sp,
                                                    lineHeight = 12.sp,
                                                ),
                                                fontWeight = FontWeight.Bold,
                                                color = textColor,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                            Text(
                                                if (isThisWeek) matchingCourse.location.ifBlank { "在线/待定" } else "(非本周)",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.5.sp),
                                                color = textColor.copy(alpha = 0.85f),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CampusOverviewSection(overview: CampusOverview?) {
    if (overview == null) {
        EmptyBlock("校园信息正在同步", "连接学校账号后，会显示成绩、空教室、一卡通和宿舍能耗。")
        return
    }

    SmartCardView(
        balance = overview.cardBalance,
        waterCode = overview.waterCode,
    )

    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        DormEnergyCard(
            energyBalance = overview.energyBalance,
            roomName = overview.energyRoom ?: overview.dormitory,
            modifier = Modifier.weight(1f),
        )
        AcademicGpaCard(
            gpa = overview.gpa,
            modifier = Modifier.weight(1f),
        )
    }

    FreeClassroomCard(
        freeClassrooms = overview.freeClassrooms,
    )

    CampusQuickToolsGrid()
}

@Composable
private fun SmartCardView(
    balance: String?,
    waterCode: String?,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = AppCardShape,
        color = Color(0xFF1E293B),
        contentColor = Color.White,
        shadowElevation = 4.dp,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(Color(0xFF1E1B4B), Color(0xFF312E81), Color(0xFF3730A3)),
                    )
                )
                .padding(20.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Surface(
                            color = Color.White.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Icon(
                                Icons.Outlined.CreditCard,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.padding(8.dp).size(22.dp),
                            )
                        }
                        Column {
                            Text(
                                "校园一卡通",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                            )
                            Text(
                                "智能通行与支付结算",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.65f),
                            )
                        }
                    }

                    if (!waterCode.isNullOrBlank()) {
                        Surface(
                            color = Color(0xFF4F46E5),
                            contentColor = Color.White,
                            shape = RoundedCornerShape(10.dp),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(Icons.Outlined.QrCode, contentDescription = null, modifier = Modifier.size(13.dp))
                                Text(
                                    "用水码 $waterCode",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
                                )
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Column {
                        Text(
                            "卡内可用余额",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.7f),
                        )
                        Text(
                            balance?.let(::formatCampusAmount) ?: "¥ --",
                            style = MaterialTheme.typography.headlineLarge.copy(
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 32.sp,
                            ),
                            color = Color.White,
                        )
                    }

                    Surface(
                        color = Color.White.copy(alpha = 0.2f),
                        contentColor = Color.White,
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(
                            "实时在线",
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DormEnergyCard(
    energyBalance: String?,
    roomName: String?,
    modifier: Modifier = Modifier,
) {
    val amountVal = energyBalance?.replace(Regex("[^0-9.]"), "")?.toFloatOrNull() ?: 50f
    val isWarning = amountVal <= 20f

    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier
                .height(180.dp)
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconTile(
                    Icons.Outlined.Bolt,
                    if (isWarning) Color(0xFFD97706) else Color(0xFF0284C7),
                    if (isWarning) Color(0xFFFEF3C7) else Color(0xFFE0F2FE),
                )
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        roomName ?: "宿舍电费",
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("宿舍电费余额", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    energyBalance?.let(::formatCampusAmount) ?: "¥ --",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (isWarning) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurface,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        if (isWarning) "电量偏低，建议充值" else "能耗状态良好",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isWarning) Color(0xFFD97706) else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                LinearProgressIndicator(
                    progress = { (amountVal / 100f).coerceIn(0.1f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(5.dp),
                    color = if (isWarning) Color(0xFFF59E0B) else Color(0xFF0284C7),
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AcademicGpaCard(
    gpa: CampusGpa?,
    modifier: Modifier = Modifier,
) {
    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier
                .height(180.dp)
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconTile(Icons.Outlined.School, Color(0xFF7C3AED), Color(0xFFF3E8FF))
                Surface(
                    color = Color(0xFFF3E8FF),
                    contentColor = Color(0xFF7C3AED),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        "教务系统",
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("综合 GPA 绩点", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    gpa?.overall ?: "--",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    gpa?.core?.let { "核心 $it" } ?: "暂未同步明细",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    gpa?.required?.let { "必修 $it" } ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun FreeClassroomCard(
    freeClassrooms: CampusFreeClassrooms?,
) {
    AppPanel {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IconTile(Icons.Outlined.MeetingRoom, Color(0xFF059669), Color(0xFFD1FAE5))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "自习空教室指南",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    freeClassrooms?.dayLabel?.let { label ->
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                label,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        "空教室 ${freeClassrooms?.rooms ?: 0} 间",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF059669),
                    )
                    Text(
                        "空余座位 ${freeClassrooms?.seats ?: 0} 个",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CampusQuickToolsGrid() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeader("校园快捷服务", "常用教务与生活服务指南")
        AppPanel {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                QuickToolItem(
                    icon = Icons.Outlined.School,
                    label = "成绩明细",
                    accent = Color(0xFF7C3AED),
                    accentPale = Color(0xFFF3E8FF),
                    modifier = Modifier.weight(1f),
                )
                QuickToolItem(
                    icon = Icons.Outlined.MeetingRoom,
                    label = "空教室",
                    accent = Color(0xFF059669),
                    accentPale = Color(0xFFD1FAE5),
                    modifier = Modifier.weight(1f),
                )
                QuickToolItem(
                    icon = Icons.Outlined.CreditCard,
                    label = "一卡通流水",
                    accent = Color(0xFF4F46E5),
                    accentPale = Color(0xFFEEF2FF),
                    modifier = Modifier.weight(1f),
                )
                QuickToolItem(
                    icon = Icons.Outlined.Bolt,
                    label = "水电充值",
                    accent = Color(0xFF0284C7),
                    accentPale = Color(0xFFE0F2FE),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun QuickToolItem(
    icon: ImageVector,
    label: String,
    accent: Color,
    accentPale: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        IconTile(icon, accent, accentPale, modifier = Modifier.size(40.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun CourseCard(
    course: CampusCourse,
    showWeek: Boolean = false,
    selectedWeek: Int? = null,
    onClick: (() -> Unit)? = null,
) {
    val isThisWeek = selectedWeek == null || course.weeks.isEmpty() || selectedWeek in course.weeks
    val colorScheme = getCourseColorScheme(course.courseName)

    AppPanel(onClick = onClick) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = if (isThisWeek) colorScheme.background else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (isThisWeek) colorScheme.contentColor else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(46.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "${course.startSection}-${course.endSection}",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 12.sp),
                        )
                        Text(
                            "节",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                        )
                    }
                }
            }

            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        course.courseName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isThisWeek) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (!isThisWeek) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                "非本周",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (course.timeRange.isNotBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Outlined.Schedule, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(course.timeRange, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (course.location.isNotBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Outlined.LocationOn, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(course.location, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                if (course.teacher.isNotBlank() || (showWeek && course.weekText.isNotBlank())) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (course.teacher.isNotBlank()) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Icon(Icons.Outlined.Person, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(course.teacher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (showWeek && course.weekText.isNotBlank()) {
                            Text(course.weekText, style = MaterialTheme.typography.bodySmall, color = colorScheme.accentColor, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CourseDetailDialog(
    course: CampusCourse,
    selectedWeek: Int,
    onDismiss: () -> Unit,
) {
    val colorScheme = getCourseColorScheme(course.courseName)
    val isThisWeek = course.weeks.isEmpty() || selectedWeek in course.weeks

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.CalendarMonth,
        iconTint = colorScheme.contentColor,
        iconBackground = colorScheme.background,
        title = course.courseName,
        subtitle = "${course.dayName} ${course.sectionText}",
        footer = {
            AppDialogPrimaryButton(
                text = "确定",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DetailRow("上课地点", course.location.ifBlank { "待定" }, Icons.Outlined.LocationOn)
            DetailRow("授课教师", course.teacher.ifBlank { "未知" }, Icons.Outlined.Person)
            DetailRow("上课时间", course.timeRange.ifBlank { "按照节次" }, Icons.Outlined.Schedule)
            DetailRow("周次范围", course.weekText.ifBlank { "全学期" }, Icons.Outlined.Event)
            DetailRow("课程代码", course.courseCode.ifBlank { "无" }, Icons.Outlined.Info)
            DetailRow(
                "当前状态",
                if (isThisWeek) "本周 (第 $selectedWeek 周) 有课安排" else "第 $selectedWeek 周无课 (非本周)",
                Icons.Outlined.CheckCircle,
            )
        }
    }
}

@Composable
private fun DetailRow(
    label: String,
    value: String,
    icon: ImageVector,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(72.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
    }
}

private fun weekdayLabel(day: Int): String = listOf("", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")
    .getOrElse(day) { "未排定日期" }

private fun formatCampusAmount(value: String): String = value
    .takeIf { it.startsWith("¥") || it.startsWith("￥") }
    ?: "¥$value"

@Composable
private fun TodoCard(task: TodoTask, onToggle: (String) -> Unit, onEdit: () -> Unit, onDelete: (String) -> Unit) {
    AppPanel {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconButton(onClick = { onToggle(task.id) }) {
                Icon(if (task.completed) Icons.Outlined.CheckCircle else Icons.Outlined.Schedule, if (task.completed) "标记未完成" else "标记完成", tint = if (task.completed) Color(0xFF059669) else MaterialTheme.colorScheme.primary)
            }
            Column(Modifier.weight(1f)) {
                Text(task.title, style = MaterialTheme.typography.titleMedium, textDecoration = if (task.completed) TextDecoration.LineThrough else null, color = if (task.completed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                Text(todoMeta(task), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconButton(onClick = onEdit) { Icon(Icons.Outlined.Edit, "编辑") }
            IconButton(onClick = { onDelete(task.id) }) { Icon(Icons.Outlined.DeleteOutline, "删除") }
        }
    }
}

@Composable
private fun AttentionCard(label: String, value: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    AppPanel(onClick = onClick, modifier = modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(value.toString(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ResourceExpiryCard(resource: ResourceExpiry, days: Int) {
    AppPanel {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconTile(Icons.Outlined.Event, if (days <= 7) Color(0xFFB91C1C) else Color(0xFFB45309), if (days <= 7) Color(0xFFFEE2E2) else Color(0xFFFEF3C7))
            Column(Modifier.weight(1f)) {
                Text(resource.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(if (resource.type == "domain") "域名" else "服务器", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                when {
                    days < 0 -> "已过期 ${-days} 天"
                    days == 0 -> "今天到期"
                    else -> "$days 天后"
                },
                color = if (days <= 7) MaterialTheme.colorScheme.error else Color(0xFFB45309),
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private data class Hexa<A, B, C, D, E, F>(val first: A, val second: B, val third: C, val fourth: D, val fifth: E, val sixth: F)

@Composable
private fun NotificationCard(
    alert: AppAlertRecord,
    onOpen: (AppAlertRecord) -> Unit,
    onMarkRead: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
) {
    var offsetX by remember(alert.id) { mutableFloatStateOf(0f) }
    val deleteThresholdPx = with(androidx.compose.ui.platform.LocalDensity.current) { 96.dp.toPx() }

    val isUrgent = alert.priority == "urgent" || alert.priority == "high" || alert.type == "incident"
    val isTask = alert.type == "task"
    val isIot = alert.type == "iot"
    val isSecurity = alert.type == "security"

    val (categoryLabel, categoryBg, categoryFg, categoryBorder, icon, gradientBrush) = remember(isUrgent, isTask, isIot, isSecurity) {
        when {
            isUrgent -> Hexa(
                "告警",
                Color(0xFFFEF2F2),
                Color(0xFFDC2626),
                Color(0xFFFECACA),
                Icons.Outlined.Warning,
                Brush.linearGradient(listOf(Color(0xFFEF4444), Color(0xFFDC2626))),
            )
            isTask -> Hexa(
                "任务",
                Color(0xFFFFFBEB),
                Color(0xFFD97706),
                Color(0xFFFDE68A),
                Icons.Outlined.Assignment,
                Brush.linearGradient(listOf(Color(0xFFF59E0B), Color(0xFFD97706))),
            )
            isIot -> Hexa(
                "设备",
                Color(0xFFECFDF5),
                Color(0xFF059669),
                Color(0xFFA7F3D0),
                Icons.Outlined.Devices,
                Brush.linearGradient(listOf(Color(0xFF10B981), Color(0xFF059669))),
            )
            isSecurity -> Hexa(
                "安全",
                Color(0xFFF5F3FF),
                Color(0xFF7C3AED),
                Color(0xFFDDD6FE),
                Icons.Outlined.Security,
                Brush.linearGradient(listOf(Color(0xFF8B5CF6), Color(0xFF7C3AED))),
            )
            else -> Hexa(
                "通知",
                Color(0xFFEFF6FF),
                Color(0xFF2563EB),
                Color(0xFFBFDBFE),
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
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(
                if (!alert.read && isUrgent) 1.2.dp else 0.6.dp,
                if (!alert.read && isUrgent) Color(0xFFF87171)
                else if (!alert.read) MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
            ),
            shadowElevation = if (!alert.read) 1.dp else 0.3.dp,
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
                                        .background(Color(0xFF2563EB), CircleShape),
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
                                color = Color(0xFFEFF6FF),
                                border = BorderStroke(0.6.dp, Color(0xFFBFDBFE)),
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
                                        tint = Color(0xFF2563EB),
                                    )
                                    Text(
                                        "设已读",
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.5.sp,
                                        ),
                                        color = Color(0xFF2563EB),
                                    )
                                }
                            }
                        }

                        Surface(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onSnooze(alert.id) },
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFF1F5F9),
                            border = BorderStroke(0.6.dp, Color(0xFFE2E8F0)),
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
                                    tint = Color(0xFF475569),
                                )
                                Text(
                                    "稍后",
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        fontWeight = FontWeight.Medium,
                                        fontSize = 11.5.sp,
                                    ),
                                    color = Color(0xFF475569),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

@Composable
private fun ModernTrendChart(
    title: String,
    samples: List<cn.pxyb.mycontrol.data.TrendSample>,
    getValue: (cn.pxyb.mycontrol.data.TrendSample) -> Int,
    suffix: String,
    primaryColor: Color,
    maxScale: Int? = null,
) {
    val values = samples.map(getValue)
    val maxVal = (maxScale ?: (values.maxOrNull() ?: 0)).coerceAtLeast(1)
    val latestVal = values.lastOrNull() ?: 0
    val gridLineColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)

    AppPanel {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: 标题 + 最新值亮字
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = "$latestVal",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = primaryColor
                    )
                    Text(
                        text = suffix,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 2.dp)
                    )
                }
            }

            // 图表 Canvas 绘图与槽位 Row
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(105.dp)
            ) {
                // 1. 绘制纵向参考虚线网格
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val h = size.height
                    val dashPath = PathEffect.dashPathEffect(floatArrayOf(8f, 8f), 0f)

                    drawLine(
                        color = gridLineColor,
                        start = Offset(0f, 0f),
                        end = Offset(size.width, 0f),
                        pathEffect = dashPath,
                        strokeWidth = 1f
                    )
                    drawLine(
                        color = gridLineColor,
                        start = Offset(0f, h / 2f),
                        end = Offset(size.width, h / 2f),
                        pathEffect = dashPath,
                        strokeWidth = 1f
                    )
                    drawLine(
                        color = gridLineColor,
                        start = Offset(0f, h),
                        end = Offset(size.width, h),
                        strokeWidth = 1.5f
                    )
                }

                // 2. 采样柱与数值标注
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = 14.dp, bottom = 4.dp),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.Bottom
                ) {
                    samples.forEach { sample ->
                        val valNum = getValue(sample)
                        val ratio = (valNum.toFloat() / maxVal).coerceIn(0f, 1f)

                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Bottom,
                            modifier = Modifier.fillMaxHeight()
                        ) {
                            Text(
                                text = "$valNum",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (valNum > 0) primaryColor else MaterialTheme.colorScheme.outline
                            )

                            Spacer(Modifier.height(4.dp))

                            Canvas(
                                modifier = Modifier
                                    .width(18.dp)
                                    .fillMaxHeight(0.85f)
                            ) {
                                val barH = size.height * ratio
                                val minBarH = 6.dp.toPx()
                                val finalH = barH.coerceAtLeast(minBarH)

                                // 背景轨
                                drawRoundRect(
                                    color = primaryColor.copy(alpha = 0.12f),
                                    topLeft = Offset(0f, 0f),
                                    size = Size(size.width, size.height),
                                    cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx())
                                )

                                // 填充渐变柱
                                drawRoundRect(
                                    brush = Brush.verticalGradient(
                                        colors = listOf(
                                            primaryColor,
                                            primaryColor.copy(alpha = 0.7f)
                                        )
                                    ),
                                    topLeft = Offset(0f, size.height - finalH),
                                    size = Size(size.width, finalH),
                                    cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx())
                                )
                            }
                        }
                    }
                }
            }

            // X 轴时间 Label
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                samples.forEachIndexed { index, sample ->
                    val dateLabel = formatSampleDate(sample.day, index == samples.lastIndex)
                    Text(
                        text = dateLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (index == samples.lastIndex) primaryColor else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (index == samples.lastIndex) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        }
    }
}

private fun formatSampleDate(rawDay: String, isLast: Boolean): String {
    if (isLast) return "今日"
    if (rawDay.length >= 5) {
        return rawDay.takeLast(5).removePrefix("0")
    }
    return rawDay
}

@Composable
private fun EnhancedMetricCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = color.copy(alpha = 0.08f),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color
            )
        }
    }
}

@Composable
private fun SceneCard(scene: IotScene, busy: Boolean, enabled: Boolean, onRun: (String) -> Unit, onEdit: () -> Unit, onDelete: (String) -> Unit) {
    AppPanel {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconTile(Icons.Outlined.Tune, Color(0xFF047857), Color(0xFFD1FAE5))
                Column(Modifier.weight(1f)) {
                    Text(scene.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${scene.actionCount} 个设备动作", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onEdit, enabled = enabled && !busy) { Icon(Icons.Outlined.Edit, "编辑") }
                IconButton(onClick = { onDelete(scene.id) }, enabled = enabled && !busy) { Icon(Icons.Outlined.DeleteOutline, "删除") }
            }
            Button(onClick = { onRun(scene.id) }, modifier = Modifier.fillMaxWidth().height(46.dp), enabled = enabled && !busy, shape = RoundedCornerShape(18.dp)) {
                Icon(Icons.Outlined.PlayArrow, null)
                Spacer(Modifier.width(6.dp))
                Text("执行场景")
            }
        }
    }
}

@Composable
private fun TodoEditorDialog(task: TodoTask?, courses: List<CampusCourse>, onDismiss: () -> Unit, onSave: (TodoTask) -> Unit) {
    var title by remember(task?.id) { mutableStateOf(task?.title.orEmpty()) }
    var priority by remember(task?.id) { mutableStateOf(task?.priority ?: "normal") }
    var recurrence by remember(task?.id) { mutableStateOf(task?.recurrence ?: "none") }
    var duePreset by remember(task?.id) { mutableStateOf(duePreset(task?.dueAt)) }
    var courseId by remember(task?.id) { mutableStateOf(task?.courseRef?.id) }
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Event,
        title = if (task == null) "添加待办" else "编辑待办",
        subtitle = "离线时也会安全保存在本机",
        modifier = Modifier.heightIn(max = 720.dp),
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f))
                AppDialogPrimaryButton("保存", { 
                    val now = System.currentTimeMillis()
                    val selectedCourse = courses.firstOrNull { it.id == courseId }
                    val dueAt = dueFromPreset(duePreset)
                    onSave(
                        (task ?: TodoTask(id = UUID.randomUUID().toString(), title = title.trim())).copy(
                            title = title.trim(),
                            priority = priority,
                            recurrence = recurrence,
                            dueAt = dueAt,
                            reminderAt = dueAt?.minus(60 * 60_000L),
                            reminderStatus = "pending",
                            courseRef = selectedCourse?.let { TodoCourseRef(it.id, it.courseName) },
                            updatedAt = now,
                        ),
                    )
                }, Modifier.weight(1f), enabled = title.isNotBlank())
            }
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogTextField(title, { title = it }, "待办内容")
            ChoiceRow("截止", listOf("none" to "无", "today" to "今天", "tomorrow" to "明天", "week" to "7 天后"), duePreset) { duePreset = it }
            ChoiceRow("优先级", listOf("low" to "低", "normal" to "普通", "high" to "高"), priority) { priority = it }
            ChoiceRow("重复", listOf("none" to "不重复", "daily" to "每天", "weekly" to "每周", "monthly" to "每月"), recurrence) { recurrence = it }
            if (courses.isNotEmpty()) {
                Text("关联课程", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = courseId == null, onClick = { courseId = null }, label = { Text("无") })
                    courses.take(8).forEach { course ->
                        FilterChip(selected = courseId == course.id, onClick = { courseId = course.id }, label = { Text(course.courseName, maxLines = 1) })
                    }
                }
            }
        }
    }
}

@Composable
private fun ChoiceRow(title: String, choices: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            choices.forEach { (value, label) ->
                FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(label) })
            }
        }
    }
}

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
            Switch(checked = enabled, onCheckedChange = { enabled = it })
        }
        if (enabled) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                DialogTextField(start, { start = it.filter(Char::isDigit).take(2) }, "开始小时", Modifier.weight(1f))
                DialogTextField(end, { end = it.filter(Char::isDigit).take(2) }, "结束小时", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SceneEditorDialog(
    scene: IotScene?,
    devices: List<cn.pxyb.mycontrol.data.DeviceInfo>,
    onDismiss: () -> Unit,
    onSave: (String?, String, List<IotSceneAction>) -> Unit,
) {
    var name by remember(scene?.id) { mutableStateOf(scene?.name.orEmpty()) }
    var actions by remember(scene?.id) { mutableStateOf(scene?.actions.orEmpty()) }
    val endpoints = devices.flatMap { device -> device.relays.keys.sorted().map { relay -> Triple(device.id, device.name, relay) } }
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Tune,
        title = if (scene == null) "新建智能场景" else "编辑智能场景",
        subtitle = "只显示后端已确认的真实设备与继电器",
        modifier = Modifier.heightIn(max = 760.dp),
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f))
                AppDialogPrimaryButton("保存", { onSave(scene?.id, name.trim(), actions) }, Modifier.weight(1f), enabled = name.isNotBlank() && actions.isNotEmpty())
            }
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogTextField(name, { name = it }, "场景名称")
            if (endpoints.isEmpty()) {
                DialogInfoText("当前没有可配置的继电器设备。")
            } else {
                endpoints.forEach { (deviceId, deviceName, relayId) ->
                    val current = actions.firstOrNull { it.deviceId == deviceId && it.relayId == relayId }
                    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(deviceName, style = MaterialTheme.typography.titleSmall)
                                    Text(relayId, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Switch(
                                    checked = current != null,
                                    onCheckedChange = { checked ->
                                        actions = if (checked) actions + IotSceneAction(deviceId, relayId, "ON")
                                        else actions.filterNot { it.deviceId == deviceId && it.relayId == relayId }
                                    },
                                )
                            }
                            if (current != null) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilterChip(selected = current.status == "ON", onClick = { actions = actions.map { if (it.deviceId == deviceId && it.relayId == relayId) it.copy(status = "ON") else it } }, label = { Text("打开") })
                                    FilterChip(selected = current.status == "OFF", onClick = { actions = actions.map { if (it.deviceId == deviceId && it.relayId == relayId) it.copy(status = "OFF") else it } }, label = { Text("关闭") })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun todoMeta(task: TodoTask): String = listOfNotNull(
    when (task.priority) { "high" -> "高优先级"; "low" -> "低优先级"; else -> "普通" },
    task.dueAt?.let { "截止 ${formatMillis(it)}" },
    task.courseRef?.name,
    when (task.recurrence) { "daily" -> "每天"; "weekly" -> "每周"; "monthly" -> "每月"; else -> null },
).joinToString(" · ")

private fun duePreset(value: Long?): String {
    if (value == null) return "none"
    val date = Instant.ofEpochMilli(value).atZone(ZoneId.systemDefault()).toLocalDate()
    return when (date) {
        LocalDate.now() -> "today"
        LocalDate.now().plusDays(1) -> "tomorrow"
        else -> "week"
    }
}

private fun dueFromPreset(preset: String): Long? {
    val date = when (preset) {
        "today" -> LocalDate.now()
        "tomorrow" -> LocalDate.now().plusDays(1)
        "week" -> LocalDate.now().plusDays(7)
        else -> return null
    }
    return date.atTime(20, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

private fun formatMillis(value: Long): String = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(value))

private fun hourLabel(hour: Int): String = "%02d:00".format(hour)

@Composable
private fun AutomationRuleCard(
    rule: AutomationRule,
    devices: List<DeviceInfo>,
    busy: Boolean,
    onToggle: (Boolean) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val matched = rule.enabled && AutomationEngine.matches(rule, devices)
    AppPanel {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconTile(
                    icon = if (matched) Icons.Outlined.Bolt else Icons.Outlined.Tune,
                    tint = if (rule.enabled) Color(0xFF2563EB) else Color(0xFF94A3B8),
                    background = if (rule.enabled) Color(0xFFDBEAFE) else Color(0xFFF1F5F9),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(rule.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        automationConditionLabel(rule, devices),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = rule.enabled, onCheckedChange = onToggle, enabled = !busy)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusBadge(
                    status = if (!rule.enabled) "inactive" else if (matched) "warning" else "healthy",
                    label = if (!rule.enabled) "已停用" else if (matched) "当前满足条件" else "监控中",
                )
                Text(
                    "${rule.actions.size} 个动作 · 冷却 ${automationCooldownLabel(rule.cooldownSeconds)}",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                IconButton(onClick = onEdit, enabled = !busy) { Icon(Icons.Outlined.Edit, contentDescription = "编辑规则") }
                IconButton(onClick = onDelete, enabled = !busy) { Icon(Icons.Outlined.DeleteOutline, contentDescription = "删除规则") }
            }
        }
    }
}

@Composable
private fun AutomationRunCard(run: AutomationRun) {
    AppPanel {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconTile(Icons.Outlined.PlayArrow, Color(0xFF2563EB), Color(0xFFDBEAFE))
                Column(Modifier.weight(1f)) {
                    Text(run.sourceName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        listOfNotNull(
                            if (run.sourceType == "rule") "规则触发" else "手动场景",
                            run.createdAt?.let(::formatMillis),
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(run.state, automationRunStateLabel(run.state))
            }
            Text(
                if (run.deviceConfirmed) {
                    "设备已确认执行 · ${run.results.size} 个动作"
                } else {
                    "指令已提交 · ${run.results.size} 个动作 · 等待设备级回执"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AutomationRuleEditorDialog(
    rule: AutomationRule?,
    devices: List<DeviceInfo>,
    scenes: List<IotScene>,
    onDismiss: () -> Unit,
    onSave: (String?, String, Boolean, AutomationCondition, List<IotSceneAction>, Int) -> Unit,
) {
    val initialSceneId = remember(rule?.id, scenes) {
        scenes.firstOrNull { it.actions == rule?.actions }?.id ?: if (rule == null) scenes.firstOrNull()?.id else null
    }
    var name by remember(rule?.id) { mutableStateOf(rule?.name.orEmpty()) }
    var deviceId by remember(rule?.id, devices) { mutableStateOf(rule?.condition?.deviceId ?: devices.firstOrNull()?.id.orEmpty()) }
    var metric by remember(rule?.id) { mutableStateOf(rule?.condition?.metric ?: "temperature") }
    var operator by remember(rule?.id) { mutableStateOf(rule?.condition?.operator ?: "gte") }
    var value by remember(rule?.id) { mutableStateOf(rule?.condition?.value ?: "30") }
    var relayId by remember(rule?.id) { mutableStateOf(rule?.condition?.relayId) }
    var sceneId by remember(rule?.id, initialSceneId) { mutableStateOf(initialSceneId) }
    var cooldownSeconds by remember(rule?.id) { mutableStateOf(rule?.cooldownSeconds ?: 300) }
    val selectedDevice = devices.firstOrNull { it.id == deviceId }
    val selectedActions = scenes.firstOrNull { it.id == sceneId }?.actions ?: rule?.actions.orEmpty()
    val stateMetric = metric in setOf("online", "relay")
    val effectiveOperator = if (stateMetric) "eq" else operator
    val effectiveRelayId = relayId?.takeIf { metric == "relay" && it in selectedDevice?.relays.orEmpty() }
    val valid = name.isNotBlank() && selectedDevice != null && selectedActions.isNotEmpty() &&
        (metric !in setOf("temperature", "humidity") || value.toDoubleOrNull() != null) &&
        (metric != "relay" || effectiveRelayId != null)

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AutoAwesome,
        title = if (rule == null) "新建自动化规则" else "编辑自动化规则",
        subtitle = "条件由 IoT 服务持续判断，命中后执行所选场景的动作快照",
        modifier = Modifier.heightIn(max = 760.dp),
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f))
                AppDialogPrimaryButton(
                    "保存",
                    {
                        onSave(
                            rule?.id,
                            name.trim(),
                            rule?.enabled ?: true,
                            AutomationCondition(deviceId, metric, effectiveOperator, value, effectiveRelayId),
                            selectedActions,
                            cooldownSeconds,
                        )
                    },
                    Modifier.weight(1f),
                    enabled = valid,
                )
            }
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogTextField(name, { name = it }, "规则名称")
            Text("监控设备", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                devices.forEach { device ->
                    FilterChip(
                        selected = device.id == deviceId,
                        onClick = {
                            deviceId = device.id
                            relayId = device.relays.keys.firstOrNull()
                        },
                        label = { Text(device.name, maxLines = 1) },
                    )
                }
            }
            ChoiceRow(
                "监控指标",
                listOf("temperature" to "温度", "humidity" to "湿度", "online" to "在线状态", "relay" to "继电器"),
                metric,
            ) { selected ->
                metric = selected
                when (selected) {
                    "online" -> { operator = "eq"; value = "OFFLINE" }
                    "relay" -> { operator = "eq"; value = "ON"; relayId = selectedDevice?.relays?.keys?.firstOrNull() }
                    else -> { operator = "gte"; if (value.toDoubleOrNull() == null) value = "30" }
                }
            }
            when (metric) {
                "temperature", "humidity" -> {
                    ChoiceRow(
                        "比较方式",
                        listOf("gt" to "大于", "gte" to "大于等于", "lt" to "小于", "lte" to "小于等于"),
                        operator,
                    ) { operator = it }
                    DialogTextField(value, { value = it.filter { char -> char.isDigit() || char in ".-" } }, "阈值")
                }
                "online" -> ChoiceRow("目标状态", listOf("ONLINE" to "在线", "OFFLINE" to "离线"), value.uppercase()) { value = it }
                "relay" -> {
                    Text("监控继电器", style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        selectedDevice?.relays?.keys.orEmpty().sorted().forEach { id ->
                            FilterChip(selected = relayId == id, onClick = { relayId = id }, label = { Text(id) })
                        }
                    }
                    ChoiceRow("目标状态", listOf("ON" to "开启", "OFF" to "关闭"), value.uppercase()) { value = it }
                }
            }
            Text("命中后执行", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                scenes.forEach { scene ->
                    FilterChip(selected = scene.id == sceneId, onClick = { sceneId = scene.id }, label = { Text(scene.name, maxLines = 1) })
                }
            }
            if (sceneId == null && rule?.actions.orEmpty().isNotEmpty()) {
                DialogInfoText("当前规则的动作与已有场景不完全一致；不重新选择场景时将保留现有动作。")
            }
            ChoiceRow(
                "触发冷却",
                listOf("60" to "1 分钟", "300" to "5 分钟", "900" to "15 分钟", "3600" to "1 小时"),
                cooldownSeconds.toString(),
            ) { cooldownSeconds = it.toInt() }
        }
    }
}

private fun automationConditionLabel(rule: AutomationRule, devices: List<DeviceInfo>): String {
    val condition = rule.condition
    val device = devices.firstOrNull { it.id == condition.deviceId }?.name ?: condition.deviceId
    val metric = when (condition.metric) {
        "temperature" -> "温度"
        "humidity" -> "湿度"
        "online" -> "在线状态"
        "relay" -> "继电器 ${condition.relayId.orEmpty()}"
        else -> condition.metric
    }
    val operator = when (condition.operator) {
        "gt" -> ">"
        "gte" -> "≥"
        "lt" -> "<"
        "lte" -> "≤"
        "neq" -> "≠"
        else -> "="
    }
    val value = when (condition.value.uppercase()) {
        "ONLINE" -> "在线"
        "OFFLINE" -> "离线"
        "ON" -> "开启"
        "OFF" -> "关闭"
        else -> condition.value
    }
    return "$device · $metric $operator $value"
}

private fun automationCooldownLabel(seconds: Int): String = when {
    seconds >= 3600 && seconds % 3600 == 0 -> "${seconds / 3600} 小时"
    seconds >= 60 && seconds % 60 == 0 -> "${seconds / 60} 分钟"
    else -> "$seconds 秒"
}

private fun automationRunStateLabel(state: String): String = when (state) {
    "commands_queued" -> "已入队"
    "partially_queued" -> "部分入队"
    "failed" -> "失败"
    else -> state.ifBlank { "未知" }
}
