package cn.pxyb.mycontrol.ui

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.CampusCourse
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

        SectionHeader("今天的课程", state.timetable?.termText) 
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
            AppPanel(modifier = Modifier.clickable { addingTodo = true }) {
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
    onMarkRead: (String) -> Unit,
    onMarkAllRead: () -> Unit,
    onClearRead: () -> Unit,
    onSnooze: (String) -> Unit,
    onUpdatePreferences: (AlertPreferences) -> Unit,
) {
    var unreadOnly by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    val now = System.currentTimeMillis()
    val visibleAlerts = state.alerts.filter { alert ->
        (alert.snoozedUntil == null || alert.snoozedUntil <= now) && (!unreadOnly || !alert.read)
    }
    WorkspacePage(
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
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = !unreadOnly, onClick = { unreadOnly = false }, label = { Text("全部") })
            FilterChip(selected = unreadOnly, onClick = { unreadOnly = true }, label = { Text("未读") })
            Spacer(Modifier.weight(1f))
            if (state.alerts.any { !it.read }) TextButton(onClick = onMarkAllRead) { Text("全部已读") }
        }
        if (state.preferences.quietHoursEnabled) {
            FeedbackBanner(
                "安静时段 ${hourLabel(state.preferences.quietStartHour)} - ${hourLabel(state.preferences.quietEndHour)}，通知会记录但不打扰。",
                error = false,
            )
        }
        if (visibleAlerts.isEmpty()) {
            EmptyBlock(if (unreadOnly) "没有未读通知" else "还没有通知", "新的关键事件、任务和提醒会集中显示在这里。")
        } else {
            visibleAlerts.forEach { alert ->
                NotificationCard(alert, onOpen, onMarkRead, onSnooze)
            }
        }
        if (state.alerts.any(AppAlertRecord::read)) {
            TextButton(onClick = onClearRead, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Icon(Icons.Outlined.DeleteOutline, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("清理已读通知")
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(appPageContentPadding(contentPadding, bottomSpacing = 18.dp)),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppSecondaryHeader(
            title = title,
            subtitle = subtitle,
            onBack = onBack,
            refreshing = refreshing,
            onRefresh = onRefresh,
            actions = actions,
        )
        content()
    }
}

@Composable
private fun CourseCard(course: CampusCourse) {
    AppPanel {
        Row(Modifier.padding(17.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconTile(Icons.Outlined.CalendarMonth, Color(0xFF2563EB), Color(0xFFDBEAFE))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(course.courseName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(listOf(course.sectionText, course.timeRange).filter(String::isNotBlank).joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
                Text(listOf(course.location, course.teacher).filter(String::isNotBlank).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

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
    AppPanel(modifier.clickable(onClick = onClick)) {
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
