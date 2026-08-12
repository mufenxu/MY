package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LibraryBooks
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tune
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationBlock
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusGpa
import cn.pxyb.mycontrol.data.CampusOverview
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
    onOpenEvents: () -> Unit,
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

                SectionHeader("需要处理", "系统事件与平台任务")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AttentionCard(
                        label = "活动事件",
                        value = state.incidents.count { it.status != "resolved" },
                        onClick = onOpenEvents,
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
    onBack: () -> Unit,
    onOpen: (AppAlertRecord) -> Unit,
    onAction: (AppAlertRecord, AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkAllRead: () -> Unit,
    onClearRead: () -> Unit,
    onSnooze: (String) -> Unit,
    onUpdatePreferences: (AlertPreferences) -> Unit,
) {
    var unreadOnly by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    var selectedAlert by remember { mutableStateOf<AppAlertRecord?>(null) }
    val now = System.currentTimeMillis()
    val visibleAlerts = state.alerts.filter { alert ->
        (alert.snoozedUntil == null || alert.snoozedUntil <= now) && (!unreadOnly || !alert.read)
    }
    NotificationWorkspacePage(
        title = "通知中心",
        subtitle = "${state.alerts.count { !it.read }} 条未读 · 保留最近 200 条",
        contentPadding = contentPadding,
        onBack = onBack,
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.Settings,
                contentDescription = "提醒设置",
                onClick = { settingsOpen = true },
            )
        },
    ) {
        item(key = "filters", contentType = "filters") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !unreadOnly, onClick = { unreadOnly = false }, label = { Text("全部") })
                FilterChip(selected = unreadOnly, onClick = { unreadOnly = true }, label = { Text("未读") })
                Spacer(Modifier.weight(1f))
                if (state.alerts.any { !it.read }) TextButton(onClick = onMarkAllRead) { Text("全部已读") }
            }
        }
        if (state.preferences.quietHoursEnabled) {
            item(key = "quiet-hours", contentType = "banner") {
                FeedbackBanner(
                    "安静时段 ${hourLabel(state.preferences.quietStartHour)} - ${hourLabel(state.preferences.quietEndHour)}，通知会记录但不打扰。",
                    error = false,
                )
            }
        }
        if (visibleAlerts.isEmpty()) {
            item(key = "empty", contentType = "empty") {
                EmptyBlock(if (unreadOnly) "没有未读通知" else "还没有通知", "新的关键事件、任务和提醒会集中显示在这里。")
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
                    onSnooze = onSnooze,
                )
            }
        }
        if (state.alerts.any(AppAlertRecord::read)) {
            item(key = "clear-read", contentType = "action") {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    TextButton(onClick = onClearRead) {
                        Icon(Icons.Outlined.DeleteOutline, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("清理已读通知")
                    }
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
private fun NotificationDetailDialog(
    alert: AppAlertRecord,
    onDismiss: () -> Unit,
    onAction: (AppNotificationAction) -> Unit,
) {
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Notifications,
        title = alert.title,
        subtitle = alert.body.ifBlank { formatMillis(alert.createdAt) },
        modifier = Modifier.heightIn(max = 620.dp),
        footer = {
            AppDialogSecondaryButton("关闭", onDismiss, Modifier.fillMaxWidth())
        },
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            alert.contentBlocks.forEach { block -> NotificationBlockView(block) }
            if (alert.actions.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                alert.actions.forEach { action ->
                    Button(onClick = { onAction(action) }, modifier = Modifier.fillMaxWidth()) {
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
        "keyValue" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            block.items.forEach { item ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(item.key, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.38f))
                    Text(item.value, modifier = Modifier.weight(0.62f))
                }
            }
        }
        "list" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            block.listItems.forEach { item ->
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("• ${item.title}", style = MaterialTheme.typography.bodyLarge)
                    if (item.description.isNotBlank()) Text(item.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        "progress" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${block.label} ${block.value ?: 0}%", style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(progress = { ((block.value ?: 0).coerceIn(0, 100)) / 100f }, modifier = Modifier.fillMaxWidth())
        }
        "image", "attachment" -> {
            Text(block.alt.ifBlank { block.fileName.ifBlank { block.url } }, style = MaterialTheme.typography.bodyMedium)
            if (block.url.isNotBlank()) {
                TextButton(onClick = { runCatching { uriHandler.openUri(block.url) } }) {
                    Text(if (block.type == "image") "查看图片" else "打开附件")
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
    val conclusion = when {
        samples.size < 2 -> "趋势记录刚开始积累。继续使用几天后，这里会给出可靠的变化结论。"
        latest == null || earlier == null -> "暂无足够数据。"
        latest.activeIncidents < earlier.activeIncidents -> "活动事件比周期开始时减少，整体运行状态正在改善。"
        latest.activeIncidents > earlier.activeIncidents -> "活动事件比周期开始时增加，建议优先查看未关闭事件。"
        latest.onlineDevices < earlier.onlineDevices -> "在线设备数有所下降，建议检查离线设备与网络连接。"
        else -> "本周期核心指标整体平稳，没有发现明显恶化趋势。"
    }
    WorkspacePage(
        title = "趋势与周报",
        subtitle = "基于本机实际采样，不补造缺失数据",
        contentPadding = contentPadding,
        onBack = onBack,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = days == 7, onClick = { days = 7 }, label = { Text("近 7 天") })
            FilterChip(selected = days == 30, onClick = { days = 30 }, label = { Text("近 30 天") })
        }
        AppPanel {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    IconTile(Icons.Outlined.BarChart, Color(0xFF2563EB), Color(0xFFDBEAFE))
                    Column {
                        Text("本期结论", style = MaterialTheme.typography.titleMedium)
                        Text("已采样 ${samples.size} 天", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(conclusion, style = MaterialTheme.typography.bodyLarge)
            }
        }
        if (samples.isEmpty()) {
            EmptyBlock("暂无趋势样本", "首页和后台同步成功后会每天记录一次关键指标。")
        } else {
            TrendChart("服务健康率", samples.map { if (it.serviceTotal == 0) 0 else (it.healthyServices * 100 / it.serviceTotal) }, "%")
            TrendChart("活动事件", samples.map { it.activeIncidents }, "")
            TrendChart("在线设备", samples.map { it.onlineDevices }, "")
            latest?.let {
                AppPanel {
                    Row(Modifier.padding(18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MetricCell("健康服务", "${it.healthyServices}/${it.serviceTotal}", Modifier.weight(1f))
                        MetricCell("待处理", it.pendingTasks.toString(), Modifier.weight(1f))
                        MetricCell("在线设备", "${it.onlineDevices}/${it.deviceTotal}", Modifier.weight(1f))
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
) {
    var editing by remember { mutableStateOf<IotScene?>(null) }
    var adding by remember { mutableStateOf(false) }
    WorkspacePage(
        title = "智能场景",
        subtitle = "组合多个真实继电器动作，一次完成",
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
    onBack: () -> Unit,
    actions: (@Composable RowScope.() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    val listState = rememberLazyListState()
    PullToRefresh(
        isRefreshing = false,
        onRefresh = null,
        enabled = false,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(appPageContentPadding(contentPadding, bottomSpacing = 18.dp)),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header", contentType = "header") {
                AppSecondaryHeader(title = title, subtitle = subtitle, onBack = onBack, actions = actions)
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
                        Surface(
                            modifier = Modifier.clickable { displayMode = TimetableDisplayMode.Grid },
                            color = if (displayMode == TimetableDisplayMode.Grid) MaterialTheme.colorScheme.primary else Color.Transparent,
                            contentColor = if (displayMode == TimetableDisplayMode.Grid) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = RoundedCornerShape(11.dp),
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
                        Surface(
                            modifier = Modifier.clickable { displayMode = TimetableDisplayMode.List },
                            color = if (displayMode == TimetableDisplayMode.List) MaterialTheme.colorScheme.primary else Color.Transparent,
                            contentColor = if (displayMode == TimetableDisplayMode.List) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            shape = RoundedCornerShape(11.dp),
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

                                    Surface(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .clickable { onCourseClick(matchingCourse) },
                                        color = bg,
                                        shape = RoundedCornerShape(10.dp),
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

@Composable
private fun NotificationCard(
    alert: AppAlertRecord,
    onOpen: (AppAlertRecord) -> Unit,
    onMarkRead: (String) -> Unit,
    onSnooze: (String) -> Unit,
) {
    AppPanel(Modifier.clickable { onOpen(alert) }) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconTile(if (alert.read) Icons.Outlined.NotificationsOff else Icons.Outlined.Notifications, if (alert.read) Color(0xFF64748B) else Color(0xFF2563EB), if (alert.read) Color(0xFFE2E8F0) else Color(0xFFDBEAFE))
                Column(Modifier.weight(1f)) {
                    Text(alert.title, style = MaterialTheme.typography.titleMedium, fontWeight = if (alert.read) FontWeight.Normal else FontWeight.SemiBold)
                    Text(formatMillis(alert.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (alert.body.isNotBlank()) Text(alert.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Row(Modifier.align(Alignment.End)) {
                if (!alert.read) TextButton(onClick = { onMarkRead(alert.id) }) { Text("设为已读") }
                TextButton(onClick = { onSnooze(alert.id) }) { Text("1 小时后提醒") }
            }
        }
    }
}

@Composable
private fun TrendChart(title: String, values: List<Int>, suffix: String) {
    val max = (values.maxOrNull() ?: 0).coerceAtLeast(1)
    AppPanel {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text("${values.lastOrNull() ?: 0}$suffix", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Row(Modifier.fillMaxWidth().height(96.dp), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.Bottom) {
                values.forEach { value ->
                    Surface(
                        modifier = Modifier.weight(1f).height(((value.toFloat() / max) * 88f).coerceAtLeast(6f).dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.76f),
                        shape = RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp, bottomStart = 3.dp, bottomEnd = 3.dp),
                    ) {}
                }
            }
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
                AppDialogPrimaryButton("保存", { onSave(AlertPreferences(enabled, start.toIntOrNull()?.coerceIn(0, 23) ?: 22, end.toIntOrNull()?.coerceIn(0, 23) ?: 7)) }, Modifier.weight(1f))
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
