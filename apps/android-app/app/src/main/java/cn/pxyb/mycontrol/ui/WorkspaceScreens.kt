package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppListCard
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
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
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

private enum class CampusWorkspaceSection { Today, Timetable, Campus, Todos }

internal fun campusReservationRedirect(): String = "/apps/campus/#reservation"

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
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenLibrarySeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
    onConsumeSharedDraft: () -> Unit,
    initialSection: WorkspaceDestination = WorkspaceDestination.Today,
) {
    var editingTodoId by rememberSaveable { mutableStateOf<String?>(null) }
    val editingTodo = state.todoSnapshot.tasks.firstOrNull { it.id == editingTodoId }
    var addingTodo by rememberSaveable { mutableStateOf(false) }
    var campusSection by rememberSaveable(initialSection) {
        mutableStateOf(when (initialSection) {
            WorkspaceDestination.Timetable -> CampusWorkspaceSection.Timetable
            WorkspaceDestination.Campus -> CampusWorkspaceSection.Campus
            WorkspaceDestination.Todos -> CampusWorkspaceSection.Todos
            else -> CampusWorkspaceSection.Today
        })
    }
    LaunchedEffect(state.sharedTodoDraft) {
        if (!state.sharedTodoDraft.isNullOrBlank()) {
            editingTodoId = null
            addingTodo = true
        }
    }
    val week = remember(state.timetable?.currentCalendarText) {
        Regex("第(\\d+)周").find(state.timetable?.currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
    }
    val currentDate = LocalDate.now()
    val tomorrowDate = currentDate.plusDays(1)
    val today = currentDate.dayOfWeek.value
    val tomorrow = tomorrowDate.dayOfWeek.value
    val currentWeek = week
    val tomorrowWeek = if (today == 7 && currentWeek != null) currentWeek + 1 else currentWeek

    val courses = remember(state.timetable, currentWeek, today) {
        state.timetable?.courses.orEmpty()
            .filter { it.day == today && (currentWeek == null || it.weeks.isEmpty() || currentWeek in it.weeks) }
            .sortedBy(CampusCourse::startSection)
    }
    val tomorrowCourses = remember(state.timetable, tomorrowWeek, tomorrow) {
        state.timetable?.courses.orEmpty()
            .filter { it.day == tomorrow && (tomorrowWeek == null || it.weeks.isEmpty() || tomorrowWeek in it.weeks) }
            .sortedBy(CampusCourse::startSection)
    }
    val tomorrowDayName = when (tomorrow) {
        1 -> "周一"
        2 -> "周二"
        3 -> "周三"
        4 -> "周四"
        5 -> "周五"
        6 -> "周六"
        7 -> "周日"
        else -> "明日"
    }
    val activeTodos = remember(state.todoSnapshot.tasks) {
        state.todoSnapshot.tasks.filterNot(TodoTask::completed)
    }
    val expiringResources = remember(state.resourceExpiries, currentDate) {
        state.resourceExpiries.mapNotNull { resource ->
            val date = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return@mapNotNull null
            val days = ChronoUnit.DAYS.between(currentDate, date).toInt()
            (resource to days).takeIf { days <= maxOf(60, resource.advanceNoticeDays) }
        }.sortedBy { it.second }
    }
    val isTablet = useTwoPaneLayout()

    val todoItems: androidx.compose.foundation.lazy.LazyListScope.() -> Unit = {
        item(key = "todos-title", contentType = "section") {
            SectionHeader(
                "个人待办",
                "${activeTodos.size} 项未完成",
                trailing = {
                    IconButton(onClick = { addingTodo = true }) {
                        Icon(Icons.Outlined.Add, contentDescription = "添加待办")
                    }
                },
            )
        }
        if (state.todoSnapshot.tasks.isEmpty()) {
            item(key = "todos-empty", contentType = "empty") {
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
            }
        } else {
            items(state.todoSnapshot.tasks, key = TodoTask::id, contentType = { "todo" }) { task ->
                TodoCard(task, onToggleTodo, { editingTodoId = task.id }, onDeleteTodo)
            }
        }
    }

    WorkspacePage(
        title = when (campusSection) {
            CampusWorkspaceSection.Today -> "今日安排"
            CampusWorkspaceSection.Timetable -> "本学期课表"
            CampusWorkspaceSection.Campus -> "校园服务"
            CampusWorkspaceSection.Todos -> "个人待办"
        },
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
            item(key = "today-offline", contentType = "banner") {
                FeedbackBanner(
                    message = if (state.pendingTodoMutations > 0) {
                        "${state.pendingTodoMutations} 项更改已保存在本机，联网后自动同步。"
                    } else {
                        "当前展示离线快照，个人待办仍可编辑。"
                    },
                    error = false,
                )
            }
        }
        state.sectionError?.let { message ->
            item(key = "today-error", contentType = "banner") {
                FeedbackBanner("部分今日数据暂不可用：$message", error = true)
            }
        }

        item(key = "workspace-sections", contentType = "filter") {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                listOf(
                    CampusWorkspaceSection.Today to "今日安排",
                    CampusWorkspaceSection.Todos to "个人待办",
                    CampusWorkspaceSection.Timetable to "本学期课表",
                    CampusWorkspaceSection.Campus to "校园服务",
                ).forEach { (section, label) ->
                    AppFilterChip(label = label, selected = campusSection == section, onClick = { campusSection = section })
                }
            }
        }

        when (campusSection) {
            CampusWorkspaceSection.Today -> {
                if (isTablet) {
                    // 平板双列布局：左列为今日与明日课程，右列为个人待办与到期提醒
                    item(key = "tablet-today-layout", contentType = "tablet-today") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                        ) {
                            // 左列：今日课程 + 明日课程预告
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                SectionHeader("今天的课程", state.timetable?.currentCalendarText)
                                if (state.refreshing && courses.isEmpty()) {
                                    AppSkeletonList(
                                        rowCount = 2,
                                        leadingSize = 32.dp,
                                        lineWidths = listOf(0.36f, 0.62f),
                                    )
                                } else if (courses.isEmpty()) {
                                    EmptyBlock("今天没有课程", "可以把时间留给个人待办或需要处理的事项。")
                                } else {
                                    courses.forEach { course ->
                                        CourseCard(course)
                                    }
                                }

                                SectionHeader(
                                    title = "明日课程预告",
                                    subtitle = if (tomorrowCourses.isNotEmpty()) {
                                        "第${tomorrowWeek ?: currentWeek ?: 1}周 · $tomorrowDayName (共 ${tomorrowCourses.size} 节)"
                                    } else {
                                        "$tomorrowDayName 暂无排课"
                                    },
                                )
                                if (tomorrowCourses.isEmpty()) {
                                    Surface(
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(16.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.25f)),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            IconTile(
                                                icon = Icons.Outlined.CheckCircle,
                                                tint = ColorTokens.Green.foreground,
                                                background = ColorTokens.Green.container,
                                                modifier = Modifier.size(34.dp),
                                            )
                                            Column {
                                                Text(
                                                    "明天暂无排课",
                                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                                )
                                                Text(
                                                    "可以提前规划自主学习或处理个人待办",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                    }
                                } else {
                                    tomorrowCourses.forEach { course ->
                                        CourseCard(
                                            course = course,
                                            selectedWeek = tomorrowWeek,
                                            tag = "明日",
                                        )
                                    }
                                }
                            }

                            // 右列：个人待办 + 需要处理 + 即将到期
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
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
                                        TodoCard(task, onToggleTodo, { editingTodoId = task.id }, onDeleteTodo)
                                    }
                                }

                                SectionHeader("需要处理", "系统提醒统一进入通知中心")
                                AttentionCard(
                                    label = "系统通知",
                                    value = state.unreadAlerts,
                                    onClick = onOpenNotifications,
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                if (expiringResources.isNotEmpty()) {
                                    SectionHeader("即将到期", "脱敏资源摘要，不包含密码或连接凭据")
                                    expiringResources.take(6).forEach { (resource, days) ->
                                        ResourceExpiryCard(resource, days)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // 手机单列流
                    item(key = "today-courses-title", contentType = "section") {
                        SectionHeader("今天的课程", state.timetable?.currentCalendarText)
                    }
                    if (state.refreshing && courses.isEmpty()) {
                        item(key = "today-courses-loading", contentType = "loading") {
                            AppSkeletonList(
                                rowCount = 3,
                                leadingSize = 32.dp,
                                lineWidths = listOf(0.36f, 0.62f),
                            )
                        }
                    } else if (courses.isEmpty()) {
                        item(key = "today-courses-empty", contentType = "empty") {
                            EmptyBlock("今天没有课程", "可以把时间留给个人待办或需要处理的事项。")
                        }
                    } else {
                        items(courses, key = CampusCourse::id, contentType = { "course" }) { course ->
                            CourseCard(course)
                        }
                    }

                    todoItems()

                    // 🌟 明日课程预告
                    item(key = "tomorrow-courses-title", contentType = "section") {
                        SectionHeader(
                            title = "明日课程预告",
                            subtitle = if (tomorrowCourses.isNotEmpty()) {
                                "第${tomorrowWeek ?: currentWeek ?: 1}周 · $tomorrowDayName (共 ${tomorrowCourses.size} 节)"
                            } else {
                                "$tomorrowDayName 暂无排课"
                            },
                        )
                    }
                    if (tomorrowCourses.isEmpty()) {
                        item(key = "tomorrow-courses-empty", contentType = "empty") {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(16.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.25f)),
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    IconTile(
                                        icon = Icons.Outlined.CheckCircle,
                                        tint = ColorTokens.Green.foreground,
                                        background = ColorTokens.Green.container,
                                        modifier = Modifier.size(34.dp),
                                    )
                                    Column {
                                        Text(
                                            "明天暂无排课",
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                        )
                                        Text(
                                            "可以提前规划自主学习或处理个人待办",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    } else {
                        items(tomorrowCourses, key = { "tomorrow-${it.id}" }, contentType = { "course-tomorrow" }) { course ->
                            CourseCard(
                                course = course,
                                selectedWeek = tomorrowWeek,
                                tag = "明日",
                            )
                        }
                    }

                    item(key = "attention-title", contentType = "section") {
                        SectionHeader("需要处理", "系统提醒统一进入通知中心")
                    }
                    item(key = "attention-cards", contentType = "card") {
                        AttentionCard(
                            label = "系统通知",
                            value = state.unreadAlerts,
                            onClick = onOpenNotifications,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    if (expiringResources.isNotEmpty()) {
                        item(key = "expiring-title", contentType = "section") {
                            SectionHeader("即将到期", "脱敏资源摘要，不包含密码或连接凭据")
                        }
                        items(
                            items = expiringResources.take(6),
                            key = { it.first.id },
                            contentType = { "resource-expiry" },
                        ) { (resource, days) ->
                            ResourceExpiryCard(resource, days)
                        }
                    }
                }
            }
            CampusWorkspaceSection.Todos -> todoItems()
            CampusWorkspaceSection.Timetable -> item(key = "timetable", contentType = "workspace") {
                TermTimetable(
                    courses = state.timetable?.courses.orEmpty(),
                    currentCalendarText = state.timetable?.currentCalendarText,
                    schoolCalendar = state.timetable?.schoolCalendar,
                )
            }
            CampusWorkspaceSection.Campus -> item(key = "campus-overview", contentType = "workspace") {
                CampusOverviewSection(
                    overview = state.campusOverview,
                    onOpenFreeClassrooms = onOpenFreeClassrooms,
                    onOpenReservation = onOpenReservation,
                    onOpenLibrarySeatReservation = onOpenLibrarySeatReservation,
                    onOpenWaterValve = onOpenWaterValve,
                )
            }
        }
    }

    if (addingTodo || editingTodo != null) {
        TodoEditorDialog(
            task = editingTodo,
            initialTitle = if (editingTodo == null) state.sharedTodoDraft.orEmpty() else "",
            courses = state.timetable?.courses.orEmpty().distinctBy(CampusCourse::id),
            onDismiss = {
                addingTodo = false
                editingTodoId = null
                onConsumeSharedDraft()
            },
            onSave = {
                onSaveTodo(it)
                addingTodo = false
                editingTodoId = null
                onConsumeSharedDraft()
            },
        )
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
    onWriteNfc: (String, String) -> Unit,
    onSetQuickScene: (String, String) -> Unit,
    onConsumePendingScene: () -> Unit,
) {
    var editingId by rememberSaveable { mutableStateOf<String?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var editingRuleId by rememberSaveable { mutableStateOf<String?>(null) }
    var addingRule by rememberSaveable { mutableStateOf(false) }
    var pendingSceneSave by rememberSaveable { mutableStateOf<Int?>(null) }
    var pendingRuleSave by rememberSaveable { mutableStateOf<Int?>(null) }
    val scenes = state.iot?.scenes.orEmpty()
    val rules = state.iot?.rules.orEmpty()
    val editing = scenes.firstOrNull { it.id == editingId }
    val editingRule = rules.firstOrNull { it.id == editingRuleId }
    LaunchedEffect(state.sceneSaveCount) {
        if (pendingSceneSave?.let { state.sceneSaveCount > it } == true) {
            adding = false
            editingId = null
            pendingSceneSave = null
        }
    }
    LaunchedEffect(state.ruleSaveCount) {
        if (pendingRuleSave?.let { state.ruleSaveCount > it } == true) {
            addingRule = false
            editingRuleId = null
            pendingRuleSave = null
        }
    }
    val runs = state.iot?.runs.orEmpty()
    val pendingScene = scenes.firstOrNull { it.id == state.pendingSceneId }
    LaunchedEffect(state.pendingSceneId, scenes) {
        if (state.pendingSceneId != null && scenes.isNotEmpty() && pendingScene == null) {
            onConsumePendingScene()
        }
    }

    WorkspacePage(
        title = "场景与自动化",
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
        if (state.offlineMode) {
            item(key = "scenes-offline", contentType = "banner") {
                FeedbackBanner("离线时仅可查看场景，联网后才能执行或编辑。", error = false)
            }
        }
        state.sectionError?.let { message ->
            item(key = "scenes-error", contentType = "banner") {
                FeedbackBanner(message, error = true)
            }
        }

        item(key = "scenes-title", contentType = "section") {
            Text(
                text = "手动执行场景",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 4.dp, bottom = 2.dp)
            )
        }

        if (state.refreshing && scenes.isEmpty()) {
            item(key = "scenes-loading", contentType = "loading") {
                AppSkeletonList(
                    rowCount = 2,
                    leadingSize = 34.dp,
                    lineWidths = listOf(0.34f, 0.6f),
                )
            }
        } else if (scenes.isEmpty()) {
            item(key = "scenes-empty", contentType = "empty") {
                EmptyBlock("还没有智能场景", "新建场景后，可以把多个设备动作合并为一次操作。")
            }
        } else {
            items(scenes, key = IotScene::id, contentType = { "scene" }) { scene ->
                SceneCard(
                    scene = scene,
                    busy = state.busyAction != null,
                    enabled = !state.offlineMode,
                    onRun = onRun,
                    onEdit = { editingId = scene.id },
                    onDelete = onDelete,
                    onWriteNfc = { onWriteNfc(scene.id, scene.name) },
                    onSetQuickScene = { onSetQuickScene(scene.id, scene.name) },
                    quickScene = state.quickScene?.sceneId == scene.id,
                )
            }
        }

        item(key = "scenes-spacer", contentType = "spacer") {
            Spacer(Modifier.height(8.dp))
        }

        item(key = "rules-title", contentType = "section") {
            SectionHeader(
                title = "条件自动化",
                subtitle = "${rules.size} 条真实规则，由 IoT 服务执行并审计",
                trailing = {
                    IconButton(
                        onClick = { addingRule = true },
                        enabled = !state.offlineMode && state.iot?.devices.orEmpty().isNotEmpty() && scenes.isNotEmpty(),
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = "新建自动化规则")
                    }
                },
            )
        }

        if (state.refreshing && rules.isEmpty()) {
            item(key = "rules-loading", contentType = "loading") {
                AppSkeletonList(
                    rowCount = 2,
                    leadingSize = 34.dp,
                    lineWidths = listOf(0.34f, 0.6f),
                )
            }
        } else if (rules.isEmpty()) {
            item(key = "rules-empty", contentType = "empty") {
                EmptyBlock("还没有自动化规则", "先创建场景，再按设备状态或环境指标配置自动执行条件。")
            }
        } else {
            items(rules, key = AutomationRule::id, contentType = { "automation-rule" }) { rule ->
                AutomationRuleCard(
                    rule = rule,
                    devices = state.iot?.devices.orEmpty(),
                    busy = state.busyAction != null,
                    onToggle = { enabled -> onToggleRule(rule.id, enabled) },
                    onEdit = { editingRuleId = rule.id },
                    onDelete = { onDeleteRule(rule.id) },
                )
            }
        }

        item(key = "runs-title", contentType = "section") {
            SectionHeader("最近执行", "规则和场景的真实指令结果")
        }
        if (runs.isEmpty()) {
            item(key = "runs-empty", contentType = "empty") {
                EmptyBlock("暂无执行记录", "手动运行场景或规则触发后会在这里留下审计记录。")
            }
        } else {
            items(runs.take(8), key = AutomationRun::id, contentType = { "automation-run" }) { run ->
                AutomationRunCard(run)
            }
        }
    }
    if (adding || editing != null) {
        SceneEditorDialog(
            scene = editing,
            devices = state.iot?.devices.orEmpty(),
            busy = state.busyAction == "scene-edit",
            error = state.sceneSaveError.takeIf { pendingSceneSave != null },
            onDismiss = { adding = false; editingId = null; pendingSceneSave = null },
            onSave = { id, name, actions ->
                pendingSceneSave = state.sceneSaveCount
                onSave(id, name, actions)
            },
        )
    }
    if (addingRule || editingRule != null) {
        AutomationRuleEditorDialog(
            rule = editingRule,
            devices = state.iot?.devices.orEmpty(),
            scenes = state.iot?.scenes.orEmpty(),
            busy = state.busyAction == "rule-edit",
            error = state.ruleSaveError.takeIf { pendingRuleSave != null },
            onDismiss = { addingRule = false; editingRuleId = null; pendingRuleSave = null },
            onSave = { id, name, enabled, condition, actions, cooldownSeconds ->
                pendingRuleSave = state.ruleSaveCount
                onSaveRule(id, name, enabled, condition, actions, cooldownSeconds)
            },
        )
    }
    if (pendingScene != null) {
        AppConfirmDialog(
            title = "执行“${pendingScene.name}”？",
            detail = "这是从 NFC、快捷磁贴或桌面小组件打开的场景。确认后仍会验证设备身份。",
            confirmLabel = "确认执行",
            onDismiss = onConsumePendingScene,
            onConfirm = {
                onConsumePendingScene()
                onRun(pendingScene.id)
            },
            icon = Icons.Outlined.PlayArrow,
        )
    }
}

@Composable
internal fun WorkspacePage(
    title: String,
    subtitle: String,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    refreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    AppSubPage(
        title = title,
        subtitle = subtitle,
        onBack = onBack,
        contentPadding = contentPadding,
        refreshing = refreshing,
        onRefresh = onRefresh,
        actions = actions,
        content = content,
    )
}

private enum class TimetableDisplayMode { Grid, List }

private val LightCoursePalette = listOf(
    ColorTokens.BlueLight, ColorTokens.GreenLight, ColorTokens.PurpleLight,
    ColorTokens.OrangeLight, ColorTokens.CyanLight, ColorTokens.PinkLight, ColorTokens.AmberLight,
)
private val DarkCoursePalette = listOf(
    ColorTokens.BlueDark, ColorTokens.GreenDark, ColorTokens.PurpleDark,
    ColorTokens.OrangeDark, ColorTokens.CyanDark, ColorTokens.PinkDark, ColorTokens.AmberDark,
)

@Composable
private fun getCourseColorScheme(courseName: String): cn.pxyb.mycontrol.ui.theme.AccentColors {
    val palette = if (isAppInDarkTheme()) DarkCoursePalette else LightCoursePalette
    val index = kotlin.math.abs(courseName.hashCode()) % palette.size
    return palette[index]
}

@Composable
private fun AcademicCalendarSummary(calendar: CampusAcademicCalendar) {
    AppPanel {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            "学校校历",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                            ),
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            calendar.termLabel.ifBlank { "本学期" },
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                            ),
                        )
                    }
                    val dateRange = listOfNotNull(
                        calendar.termStartDate.takeIf(String::isNotBlank)?.let { "开学 $it" },
                        calendar.termEndDate.takeIf(String::isNotBlank)?.let { "结束 $it" },
                    ).joinToString(" · ")
                    if (dateRange.isNotBlank()) {
                        Text(
                            dateRange,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (calendar.isHoliday) MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f)
                           else MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                ) {
                    Text(
                        calendar.statusText.ifBlank { if (calendar.isHoliday) "假期中" else "在校周" },
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            color = if (calendar.isHoliday) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            // 同一行 3 列紧凑 Bento 指标
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CalendarFactBlock(
                    label = "当前周次",
                    value = calendar.currentWeek?.let { "第 $it 周" } ?: "假期",
                    accent = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                CalendarFactBlock(
                    label = "总教学周",
                    value = calendar.teachingWeeks?.let { "共 $it 周" } ?: "--",
                    accent = ColorTokens.Green.foreground,
                    modifier = Modifier.weight(1f),
                )
                CalendarFactBlock(
                    label = "当前状态",
                    value = calendar.statusText.ifBlank { if (calendar.isHoliday) "假期" else "正常教学" },
                    accent = ColorTokens.Purple.foreground,
                    modifier = Modifier.weight(1f),
                )
            }

            if (calendar.events.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.40f))
                Text(
                    "校历安排",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                calendar.events.take(4).forEach { event ->
                    Text(
                        listOf(event.label, event.startDate.takeIf(String::isNotBlank), event.endDate.takeIf { it.isNotBlank() && it != event.startDate })
                            .filterNotNull()
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarFactBlock(
    label: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val isDark = isAppInDarkTheme()
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = if (isDark) accent.copy(alpha = 0.15f) else accent.copy(alpha = 0.08f),
        border = BorderStroke(0.5.dp, accent.copy(alpha = if (isDark) 0.25f else 0.15f)),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
            Text(
                value,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.5.sp,
                    color = accent,
                ),
                maxLines = 1,
            )
        }
    }
}

private fun resolveWeekDays(
    selectedWeek: Int,
    currentWeek: Int,
    termStartDate: String?,
): List<LocalDate> {
    val termStart = runCatching {
        if (!termStartDate.isNullOrBlank()) LocalDate.parse(termStartDate) else null
    }.getOrNull()

    val monday = if (termStart != null) {
        val offsetToMonday = termStart.dayOfWeek.value - 1
        val startMonday = termStart.minusDays(offsetToMonday.toLong())
        startMonday.plusWeeks((selectedWeek - 1).coerceAtLeast(0).toLong())
    } else {
        val now = LocalDate.now()
        val currentMonday = now.minusDays((now.dayOfWeek.value - 1).toLong())
        currentMonday.plusWeeks((selectedWeek - currentWeek).toLong())
    }

    return (0..6).map { dayIndex -> monday.plusDays(dayIndex.toLong()) }
}

@Composable
private fun TermTimetable(
    courses: List<CampusCourse>,
    currentCalendarText: String? = null,
    schoolCalendar: CampusAcademicCalendar? = null,
) {
    val orderedCourses = remember(courses) {
        courses.sortedWith(compareBy(CampusCourse::day).thenBy(CampusCourse::startSection).thenBy(CampusCourse::courseName))
    }

    if (orderedCourses.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            schoolCalendar?.let { AcademicCalendarSummary(it) }
            EmptyBlock("课表暂未同步", "连接学校账号后，下拉刷新即可查看本学期全部课程。")
        }
        return
    }

    val currentWeekNum = remember(currentCalendarText, schoolCalendar) {
        schoolCalendar?.currentWeek
            ?: Regex("第(\\d+)周").find(currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
            ?: 1
    }
    val officialCurrentWeek = schoolCalendar?.currentWeek
    var selectedWeek by remember(currentWeekNum) { mutableStateOf(currentWeekNum) }
    var displayMode by remember { mutableStateOf(TimetableDisplayMode.Grid) }
    var selectedCourseDetail by remember { mutableStateOf<CampusCourse?>(null) }

    val totalCourseCount = orderedCourses.map(CampusCourse::courseName).distinct().size
    val currentWeekCourses = remember(orderedCourses, selectedWeek) {
        orderedCourses.filter { course ->
            course.weeks.isEmpty() || selectedWeek in course.weeks
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // 1. 学校校历卡片
        schoolCalendar?.let { AcademicCalendarSummary(it) }

        // 2. 周次选择器与模式切换卡片
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
                            if (officialCurrentWeek != null && selectedWeek == officialCurrentWeek) {
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
                            "全学期 $totalCourseCount 门课程 · ${if (schoolCalendar?.isHoliday == true) "假期" else "本周 ${currentWeekCourses.size} 节安排"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
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
                    val maxTeachingWeeks = schoolCalendar?.teachingWeeks ?: 20
                    (1..maxTeachingWeeks).forEach { week ->
                        val isCurrent = officialCurrentWeek == week
                        val isSelected = week == selectedWeek
                        AppFilterChip(
                            label = if (isCurrent) "第 $week 周 (本周)" else "第 $week 周",
                            selected = isSelected,
                            onClick = { selectedWeek = week },
                        )
                    }
                }
            }
        }

        // 3. 课表主网格 / 列表卡片
        if (displayMode == TimetableDisplayMode.Grid) {
            CourseGridMatrix(
                courses = orderedCourses,
                selectedWeek = selectedWeek,
                currentWeek = currentWeekNum,
                termStartDate = schoolCalendar?.termStartDate,
                onCourseClick = { selectedCourseDetail = it },
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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

private fun getSectionTopOffset(sec: Int, sectionHeight: androidx.compose.ui.unit.Dp, gridGap: androidx.compose.ui.unit.Dp, mealGap: androidx.compose.ui.unit.Dp): androidx.compose.ui.unit.Dp {
    val baseGapCount = (sec - 1).coerceAtLeast(0)
    val mealCount = when {
        sec >= 11 -> 2
        sec >= 6 -> 1
        else -> 0
    }
    return sectionHeight * baseGapCount + gridGap * baseGapCount + mealGap * mealCount
}

@Composable
private fun CourseGridMatrix(
    courses: List<CampusCourse>,
    selectedWeek: Int,
    currentWeek: Int = 1,
    termStartDate: String? = null,
    onCourseClick: (CampusCourse) -> Unit,
) {
    val days = listOf("一", "二", "三", "四", "五", "六", "日")
    val weekDates = remember(selectedWeek, currentWeek, termStartDate) {
        resolveWeekDays(selectedWeek, currentWeek, termStartDate)
    }
    val currentMonthText = remember(weekDates) {
        "${weekDates.firstOrNull()?.monthValue ?: LocalDate.now().monthValue}月"
    }
    val totalSections = remember(courses) {
        maxOf(12, courses.maxOfOrNull { it.endSection } ?: 12)
    }
    val wideGrid = appContentWidth() >= 600.dp
    val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale
    val sectionHeight = (if (wideGrid) 64.dp else 44.dp) * fontScale.coerceAtLeast(1f)
    val gridGap = 2.5.dp
    val mealGap = 12.dp
    val totalGridHeight = getSectionTopOffset(totalSections, sectionHeight, gridGap, mealGap) + sectionHeight
    val todayDate = LocalDate.now()
    val todayDayOfWeek = remember { DayOfWeek.from(todayDate).value }

    AppPanel(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // 顶部星期与日期栏
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(30.dp)
                        .heightIn(min = if (wideGrid) 48.dp else 38.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(1.dp),
                    ) {
                        Text(
                            currentMonthText,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 11.sp else 9.sp, fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            "节次",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 11.sp else 9.5.sp, fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        )
                    }
                }
                days.forEachIndexed { index, day ->
                    val date = weekDates.getOrNull(index)
                    val isToday = date == todayDate
                    val dateText = date?.let { "${it.monthValue}.${it.dayOfMonth}" } ?: ""
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = if (wideGrid) 48.dp else 38.dp)
                            .padding(horizontal = 1.5.dp)
                            .background(
                                if (isToday) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                shape = RoundedCornerShape(6.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(1.dp),
                        ) {
                            if (dateText.isNotBlank()) {
                                Text(
                                    dateText,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 11.sp else 9.sp),
                                    fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                "周$day",
                                style = MaterialTheme.typography.labelMedium.copy(fontSize = if (wideGrid) 13.sp else 11.sp),
                                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Medium,
                                color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            }

            // 课表主网格（左侧节次列 + 7 天课程网格列）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(totalGridHeight),
            ) {
                // 左侧节次序号栏
                Column(
                    modifier = Modifier
                        .width(28.dp)
                        .fillMaxHeight(),
                ) {
                    for (sec in 1..totalSections) {
                        if (sec > 1) {
                            val gap = if (sec == 6 || sec == 11) mealGap + gridGap else gridGap
                            Spacer(Modifier.height(gap))
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(sectionHeight),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "$sec",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                }

                // 7 天课程网格
                for (dayIndex in 1..7) {
                    val isToday = dayIndex == todayDayOfWeek
                    val dayCourses = remember(courses, dayIndex, selectedWeek) {
                        courses
                            .filter { it.day == dayIndex && it.startSection in 1..totalSections }
                            .groupBy { "${it.startSection}-${it.endSection}" }
                            .values
                            .map { list ->
                                list.firstOrNull { it.weeks.isEmpty() || selectedWeek in it.weeks } ?: list.first()
                            }
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(horizontal = 1.5.dp),
                    ) {
                        // 背景网格方格线
                        Column(
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            for (sec in 1..totalSections) {
                                if (sec > 1) {
                                    val gap = if (sec == 6 || sec == 11) mealGap + gridGap else gridGap
                                    Spacer(Modifier.height(gap))
                                }
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(sectionHeight)
                                        .background(
                                            if (isToday) MaterialTheme.colorScheme.primary.copy(alpha = 0.04f)
                                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
                                            shape = RoundedCornerShape(4.dp),
                                        )
                                        .border(
                                            0.5.dp,
                                            if (isToday) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                            else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.25f),
                                            shape = RoundedCornerShape(4.dp),
                                        ),
                                )
                            }
                        }

                        // 真实跨节课程卡片（精确 Y 轴位置与精确节次跨度）
                        dayCourses.forEach { course ->
                            val s = course.startSection.coerceIn(1, totalSections)
                            val e = course.endSection.coerceIn(s, totalSections)
                            val span = e - s + 1
                            val topOffset = getSectionTopOffset(s, sectionHeight, gridGap, mealGap)
                            val bottomOffset = getSectionTopOffset(e, sectionHeight, gridGap, mealGap) + sectionHeight
                            val cardHeight = bottomOffset - topOffset
                            val isThisWeek = course.weeks.isEmpty() || selectedWeek in course.weeks
                            val colorScheme = getCourseColorScheme(course.courseName)

                            Surface(
                                modifier = Modifier
                                    .offset(y = topOffset)
                                    .height(cardHeight)
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable { onCourseClick(course) },
                                color = if (isThisWeek) colorScheme.container.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                                shape = RoundedCornerShape(6.dp),
                                border = BorderStroke(
                                    0.5.dp,
                                    if (isThisWeek) colorScheme.foreground.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f),
                                ),
                                shadowElevation = 0.dp,
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 3.dp, vertical = 3.5.dp),
                                    verticalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                        Text(
                                            text = course.courseName,
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                fontSize = if (wideGrid) 13.sp else 9.5.sp,
                                                lineHeight = if (wideGrid) 16.sp else 11.5.sp,
                                                fontWeight = FontWeight.Bold,
                                            ),
                                            color = if (isThisWeek) colorScheme.foreground else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                                            maxLines = if (span >= 3) 4 else if (span == 2) 3 else 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }

                                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                        if (isThisWeek && course.location.isNotBlank()) {
                                            Text(
                                                text = course.location,
                                                style = MaterialTheme.typography.labelSmall.copy(
                                                    fontSize = if (wideGrid) 11.sp else 8.sp,
                                                    lineHeight = if (wideGrid) 14.sp else 9.5.sp,
                                                ),
                                                color = colorScheme.foreground.copy(alpha = 0.85f),
                                                maxLines = if (span >= 3) 2 else 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        } else if (!isThisWeek) {
                                            Text(
                                                text = "(非本周)",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 10.sp else 7.5.sp),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                                                maxLines = 1,
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
private fun CampusOverviewSection(
    overview: CampusOverview?,
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenLibrarySeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
) {
    if (overview == null) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CampusQuickToolsGrid(
                onOpenFreeClassrooms = onOpenFreeClassrooms,
                onOpenReservation = onOpenReservation,
                onOpenLibrarySeatReservation = onOpenLibrarySeatReservation,
                onOpenWaterValve = onOpenWaterValve,
            )
            EmptyBlock("校园信息正在同步", "连接学校账号后，会显示成绩、空教室、一卡通和宿舍能耗。")
        }
        return
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SmartCardView(
            balance = overview.cardBalance,
            waterCode = overview.waterCode,
        )

        Row(
            modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DormEnergyCard(
                energyBalance = overview.energyBalance,
                roomName = overview.energyRoom ?: overview.dormitory,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
            AcademicGpaCard(
                gpa = overview.gpa,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
        }

        CampusQuickToolsGrid(
            onOpenFreeClassrooms = onOpenFreeClassrooms,
            onOpenReservation = onOpenReservation,
            onOpenLibrarySeatReservation = onOpenLibrarySeatReservation,
            onOpenWaterValve = onOpenWaterValve,
        )
    }
}

@Composable
private fun SmartCardView(
    balance: String?,
    waterCode: String?,
) {
    AppPanel {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconTile(Icons.Outlined.CreditCard, ColorTokens.Blue.foreground, ColorTokens.Blue.container)
                Column(modifier = Modifier.weight(1f)) {
                    Text("校园一卡通", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "校园账户与用水信息",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "卡内可用余额",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    balance?.takeIf(String::isNotBlank)?.let(::formatCampusAmount) ?: "¥ --",
                    style = MaterialTheme.typography.displaySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (!waterCode.isNullOrBlank()) {
                AppDivider()
                AppDetailRow(label = "用水码", value = waterCode, icon = Icons.Outlined.QrCode)
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
    val amountVal = energyBalance?.replace(Regex("[^0-9.\\-]"), "")?.toFloatOrNull()
    val isWarning = amountVal != null && amountVal <= 20f

    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconTile(
                    Icons.Outlined.Bolt,
                    if (isWarning) ColorTokens.Amber.foreground else ColorTokens.Sky.foreground,
                    if (isWarning) ColorTokens.Amber.container else ColorTokens.Sky.container,
                    modifier = Modifier.size(36.dp),
                )
                Text("宿舍电费", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("可用余额", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    energyBalance?.takeIf(String::isNotBlank)?.let(::formatCampusAmount) ?: "¥ --",
                    style = MaterialTheme.typography.headlineMedium,
                    color = if (isWarning) ColorTokens.Amber.foreground else MaterialTheme.colorScheme.onSurface,
                )
            }

            AppDivider()
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    roomName?.takeIf(String::isNotBlank) ?: "暂未同步宿舍",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    when {
                        amountVal == null -> "暂未同步余额"
                        isWarning -> "余额偏低，建议充值"
                        else -> "余额充足"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isWarning) ColorTokens.Amber.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
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
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconTile(Icons.Outlined.School, ColorTokens.Purple.foreground, ColorTokens.Purple.container, modifier = Modifier.size(36.dp))
                Text("学业绩点", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("综合 GPA", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    gpa?.overall?.takeIf(String::isNotBlank) ?: "--",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            AppDivider()
            Column {
                AppDetailRow(label = "核心", value = gpa?.core.orEmpty())
                AppDetailRow(label = "必修", value = gpa?.required.orEmpty())
            }
        }
    }
}

@Composable
private fun CampusQuickToolsGrid(
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenLibrarySeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader("校园快捷服务", "预约、自习与日常用水")
        AppPanel {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QuickToolItem(Icons.Outlined.MeetingRoom, "空闲教室", ColorTokens.Green.foreground, ColorTokens.Green.container, Modifier.weight(1f), onOpenFreeClassrooms)
                QuickToolItem(Icons.Outlined.CalendarMonth, "研讨间预约", ColorTokens.Blue.foreground, ColorTokens.Blue.container, Modifier.weight(1f), onOpenReservation)
                QuickToolItem(Icons.Outlined.Chair, "座位预约", ColorTokens.Teal.foreground, ColorTokens.Teal.container, Modifier.weight(1f), onOpenLibrarySeatReservation)
                QuickToolItem(Icons.Outlined.WaterDrop, "饮水机", MaterialTheme.colorScheme.tertiary, MaterialTheme.colorScheme.tertiaryContainer, Modifier.weight(1f), onOpenWaterValve)
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
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onClick)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        QuickActionGlassTile(icon, accent, accentPale, modifier = Modifier.size(42.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            minLines = 2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CourseCard(
    course: CampusCourse,
    showWeek: Boolean = false,
    selectedWeek: Int? = null,
    tag: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val isThisWeek = selectedWeek == null || course.weeks.isEmpty() || selectedWeek in course.weeks
    val colorScheme = getCourseColorScheme(course.courseName)

    AppPanel(onClick = onClick) {
        Row(
            modifier = Modifier
                .padding(13.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (isThisWeek) colorScheme.container.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                contentColor = if (isThisWeek) colorScheme.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(42.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "${course.startSection}-${course.endSection}",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp),
                        )
                        Text(
                            "节",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                        )
                    }
                }
            }

            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        course.courseName,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.5.sp,
                        ),
                        color = if (isThisWeek) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (tag != null) {
                        Surface(
                            color = ColorTokens.Purple.foreground.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                tag,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = ColorTokens.Purple.foreground,
                            )
                        }
                    }
                    if (!isThisWeek) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
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
                            Text(course.weekText, style = MaterialTheme.typography.bodySmall, color = colorScheme.foreground, fontWeight = FontWeight.Medium)
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
        iconTint = colorScheme.foreground,
        iconBackground = colorScheme.container,
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
    AppDetailRow(label = label, value = value, icon = icon)
}

private fun weekdayLabel(day: Int): String = listOf("", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")
    .getOrElse(day) { "未排定日期" }

private fun formatCampusAmount(value: String): String = value
    .takeIf { it.startsWith("¥") || it.startsWith("￥") }
    ?: "¥$value"

@Composable
private fun TodoCard(task: TodoTask, onToggle: (String) -> Unit, onEdit: () -> Unit, onDelete: (String) -> Unit) {
    AppListCard(
        title = task.title,
        subtitle = todoMeta(task),
        leading = {
            IconButton(onClick = { onToggle(task.id) }) {
                Icon(
                    if (task.completed) Icons.Outlined.CheckCircle else Icons.Outlined.Schedule,
                    if (task.completed) "标记未完成" else "标记完成",
                    tint = if (task.completed) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary,
                )
            }
        },
        trailing = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            IconButton(onClick = onEdit) { Icon(Icons.Outlined.Edit, "编辑") }
            IconButton(onClick = { onDelete(task.id) }) { Icon(Icons.Outlined.DeleteOutline, "删除") }
            }
        }
    )
}

@Composable
private fun AttentionCard(label: String, value: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    AppPanel(onClick = onClick, modifier = modifier) {
        Column(Modifier.padding(13.dp)) {
            Text(
                value.toString(),
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                ),
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ResourceExpiryCard(resource: ResourceExpiry, days: Int) {
    AppPanel {
        Row(Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            IconTile(Icons.Outlined.Event, if (days <= 7) ColorTokens.Red.foreground else ColorTokens.Amber.foreground, if (days <= 7) ColorTokens.Red.container else ColorTokens.Amber.container)
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
                color = if (days <= 7) MaterialTheme.colorScheme.error else ColorTokens.Amber.foreground,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}


@Composable
private fun SceneCard(
    scene: IotScene,
    busy: Boolean,
    enabled: Boolean,
    onRun: (String) -> Unit,
    onEdit: () -> Unit,
    onDelete: (String) -> Unit,
    onWriteNfc: () -> Unit,
    onSetQuickScene: () -> Unit,
    quickScene: Boolean,
) {
    AppPanel {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconTile(Icons.Outlined.Tune, ColorTokens.Green.foreground, ColorTokens.Green.container)
                Column(Modifier.weight(1f)) {
                    Text(scene.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${scene.actionCount} 个设备动作", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onEdit, enabled = enabled && !busy) { Icon(Icons.Outlined.Edit, "编辑") }
                IconButton(onClick = { onDelete(scene.id) }, enabled = enabled && !busy) { Icon(Icons.Outlined.DeleteOutline, "删除") }
            }
            AppButton(
                text = "执行场景",
                icon = Icons.Outlined.PlayArrow,
                onClick = { onRun(scene.id) },
                enabled = enabled && !busy,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppSecondaryButton(
                    text = "写入 NFC",
                    icon = Icons.Outlined.Nfc,
                    onClick = onWriteNfc,
                    enabled = enabled && !busy,
                    modifier = Modifier.weight(1f),
                )
                AppSecondaryButton(
                    text = if (quickScene) "当前磁贴" else "设为磁贴",
                    icon = Icons.Outlined.DashboardCustomize,
                    onClick = onSetQuickScene,
                    enabled = enabled && !busy,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun TodoEditorDialog(
    task: TodoTask?,
    initialTitle: String = "",
    courses: List<CampusCourse>,
    onDismiss: () -> Unit,
    onSave: (TodoTask) -> Unit,
) {
    var title by rememberSaveable(task?.id, initialTitle) { mutableStateOf(task?.title ?: initialTitle) }
    var priority by rememberSaveable(task?.id) { mutableStateOf(task?.priority ?: "normal") }
    var recurrence by rememberSaveable(task?.id) { mutableStateOf(task?.recurrence ?: "none") }
    var duePreset by rememberSaveable(task?.id) { mutableStateOf(if (task?.dueAt != null) "keep" else "none") }
    var courseId by rememberSaveable(task?.id) { mutableStateOf(task?.courseRef?.id) }
    AppDialogForm(
        onConfirm = {
            val now = System.currentTimeMillis()
            val selectedCourse = courses.firstOrNull { it.id == courseId }
            val dueAt = if (duePreset == "keep") task?.dueAt else dueFromPreset(duePreset)
            val dueChanged = dueAt != task?.dueAt
            onSave(
                (task ?: TodoTask(id = UUID.randomUUID().toString(), title = title.trim())).copy(
                    title = title.trim(),
                    priority = priority,
                    recurrence = recurrence,
                    dueAt = dueAt,
                    reminderAt = if (dueChanged) dueAt?.minus(60 * 60_000L) else task?.reminderAt,
                    reminderStatus = if (dueChanged) "pending" else task?.reminderStatus ?: "pending",
                    remindedAt = if (dueChanged) null else task?.remindedAt,
                    courseRef = selectedCourse?.let { TodoCourseRef(it.id, it.courseName) }
                        ?: task?.courseRef?.takeIf { it.id == courseId },
                    updatedAt = now,
                ),
            )
        },
        enabled = title.isNotBlank(),
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Event,
        title = if (task == null) "添加待办" else "编辑待办",
        subtitle = "离线时也会安全保存在本机",
        modifier = Modifier.heightIn(max = 720.dp),
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogTextField(title, { title = it }, "待办内容")
            val dueOptions = listOfNotNull(task?.dueAt?.let { "keep" to formatMillis(it) }) +
                listOf("none" to "无", "today" to "今天", "tomorrow" to "明天", "week" to "7 天后")
            ChoiceRow("截止", dueOptions, duePreset) { duePreset = it }
            ChoiceRow("优先级", listOf("low" to "低", "normal" to "普通", "high" to "高"), priority) { priority = it }
            ChoiceRow("重复", listOf("none" to "不重复", "daily" to "每天", "weekly" to "每周", "monthly" to "每月"), recurrence) { recurrence = it }
            if (courses.isNotEmpty()) {
                Text("关联课程", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AppFilterChip(label = "无", selected = courseId == null, onClick = { courseId = null })
                    courses.take(8).forEach { course ->
                        AppFilterChip(label = course.courseName, selected = courseId == course.id, onClick = { courseId = course.id })
                    }
                }
            }
        }
    }
}

@Composable
private fun ChoiceRow(title: String, choices: List<Pair<String, String>>, selected: String, enabled: Boolean = true, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            choices.forEach { (value, label) ->
                AppFilterChip(label = label, selected = selected == value, enabled = enabled, onClick = { onSelect(value) })
            }
        }
    }
}


@Composable
private fun SceneEditorDialog(
    scene: IotScene?,
    devices: List<cn.pxyb.mycontrol.data.DeviceInfo>,
    busy: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String?, String, List<IotSceneAction>) -> Unit,
) {
    var name by rememberSaveable(scene?.id) { mutableStateOf(scene?.name.orEmpty()) }
    val actionsSaver = remember {
        listSaver<List<IotSceneAction>, String>(
            save = { actions -> actions.flatMap { listOf(it.deviceId, it.relayId, it.status) } },
            restore = { values -> values.chunked(3).map { IotSceneAction(it[0], it[1], it[2]) } },
        )
    }
    var actions by rememberSaveable(scene?.id, stateSaver = actionsSaver) { mutableStateOf(scene?.actions.orEmpty()) }
    val endpoints = devices.flatMap { device -> device.relays.keys.sorted().map { relay -> Triple(device.id, device.name, relay) } }
    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Tune,
        title = if (scene == null) "新建智能场景" else "编辑智能场景",
        subtitle = "只显示后端已确认的真实设备与继电器",
        modifier = Modifier.heightIn(max = 760.dp),
        onConfirm = { onSave(scene?.id, name.trim(), actions) },
        enabled = name.isNotBlank() && actions.isNotEmpty(),
        loading = busy,
        errorMessage = error,
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogTextField(name, { name = it }, "场景名称", enabled = !busy)
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
                                AppSwitch(
                                    checked = current != null,
                                    enabled = !busy,
                                    onCheckedChange = { checked ->
                                        actions = if (checked) actions + IotSceneAction(deviceId, relayId, "ON")
                                        else actions.filterNot { it.deviceId == deviceId && it.relayId == relayId }
                                    },
                                )
                            }
                            if (current != null) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    AppFilterChip(label = "打开", selected = current.status == "ON", enabled = !busy, onClick = { actions = actions.map { if (it.deviceId == deviceId && it.relayId == relayId) it.copy(status = "ON") else it } })
                                    AppFilterChip(label = "关闭", selected = current.status == "OFF", enabled = !busy, onClick = { actions = actions.map { if (it.deviceId == deviceId && it.relayId == relayId) it.copy(status = "OFF") else it } })
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

private fun dueFromPreset(preset: String): Long? {
    val date = when (preset) {
        "today" -> LocalDate.now()
        "tomorrow" -> LocalDate.now().plusDays(1)
        "week" -> LocalDate.now().plusDays(7)
        else -> return null
    }
    return date.atTime(20, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

internal fun formatMillis(value: Long): String = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(value))

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
                    tint = if (rule.enabled) ColorTokens.Blue.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                    background = if (rule.enabled) ColorTokens.Blue.container else MaterialTheme.colorScheme.surfaceContainerLow,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(rule.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        automationConditionLabel(rule, devices),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppSwitch(checked = rule.enabled, onCheckedChange = onToggle, enabled = !busy)
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
                IconTile(Icons.Outlined.PlayArrow, ColorTokens.Blue.foreground, ColorTokens.Blue.container)
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
    busy: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String?, String, Boolean, AutomationCondition, List<IotSceneAction>, Int) -> Unit,
) {
    val initialSceneId = remember(rule?.id, scenes) {
        scenes.firstOrNull { it.actions == rule?.actions }?.id ?: if (rule == null) scenes.firstOrNull()?.id else null
    }
    var name by rememberSaveable(rule?.id) { mutableStateOf(rule?.name.orEmpty()) }
    var deviceId by rememberSaveable(rule?.id) { mutableStateOf(rule?.condition?.deviceId ?: devices.firstOrNull()?.id.orEmpty()) }
    var metric by rememberSaveable(rule?.id) { mutableStateOf(rule?.condition?.metric ?: "temperature") }
    var operator by rememberSaveable(rule?.id) { mutableStateOf(rule?.condition?.operator ?: "gte") }
    var value by rememberSaveable(rule?.id) { mutableStateOf(rule?.condition?.value ?: "30") }
    var relayId by rememberSaveable(rule?.id) { mutableStateOf(rule?.condition?.relayId) }
    var sceneId by rememberSaveable(rule?.id) { mutableStateOf(initialSceneId) }
    var cooldownSeconds by rememberSaveable(rule?.id) { mutableStateOf(rule?.cooldownSeconds ?: 300) }
    val selectedDevice = devices.firstOrNull { it.id == deviceId }
    val selectedActions = scenes.firstOrNull { it.id == sceneId }?.actions ?: rule?.actions.orEmpty()
    val stateMetric = metric in setOf("online", "relay")
    val effectiveOperator = if (stateMetric) "eq" else operator
    val effectiveRelayId = relayId?.takeIf { metric == "relay" && it in selectedDevice?.relays.orEmpty() }
    val valid = name.isNotBlank() && selectedDevice != null && selectedActions.isNotEmpty() &&
        (metric !in setOf("temperature", "humidity") || value.toDoubleOrNull() != null) &&
        (metric != "relay" || effectiveRelayId != null)

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.AutoAwesome,
        title = if (rule == null) "新建自动化规则" else "编辑自动化规则",
        subtitle = "条件由 IoT 服务持续判断，命中后执行所选场景的动作快照",
        modifier = Modifier.heightIn(max = 760.dp),
        onConfirm = {
            onSave(
                rule?.id,
                name.trim(),
                rule?.enabled ?: true,
                AutomationCondition(deviceId, metric, effectiveOperator, value, effectiveRelayId),
                selectedActions,
                cooldownSeconds,
            )
        },
        enabled = valid,
        loading = busy,
        errorMessage = error,
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogTextField(name, { name = it }, "规则名称", enabled = !busy)
            Text("监控设备", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                devices.forEach { device ->
                    AppFilterChip(
                        label = device.name,
                        selected = device.id == deviceId,
                        enabled = !busy,
                        onClick = {
                            deviceId = device.id
                            relayId = device.relays.keys.firstOrNull()
                        },
                    )
                }
            }
            ChoiceRow(
                "监控指标",
                listOf("temperature" to "温度", "humidity" to "湿度", "online" to "在线状态", "relay" to "继电器"),
                metric,
                enabled = !busy,
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
                        enabled = !busy,
                    ) { operator = it }
                    DialogTextField(value, { value = it.filter { char -> char.isDigit() || char in ".-" } }, "阈值", enabled = !busy)
                }
                "online" -> ChoiceRow("目标状态", listOf("ONLINE" to "在线", "OFFLINE" to "离线"), value.uppercase(), enabled = !busy) { value = it }
                "relay" -> {
                    Text("监控继电器", style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        selectedDevice?.relays?.keys.orEmpty().sorted().forEach { id ->
                            AppFilterChip(label = id, selected = relayId == id, enabled = !busy, onClick = { relayId = id })
                        }
                    }
                    ChoiceRow("目标状态", listOf("ON" to "开启", "OFF" to "关闭"), value.uppercase(), enabled = !busy) { value = it }
                }
            }
            Text("命中后执行", style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                scenes.forEach { scene ->
                    AppFilterChip(label = scene.name, selected = scene.id == sceneId, enabled = !busy, onClick = { sceneId = scene.id })
                }
            }
            if (sceneId == null && rule?.actions.orEmpty().isNotEmpty()) {
                DialogInfoText("当前规则的动作与已有场景不完全一致；不重新选择场景时将保留现有动作。")
            }
            ChoiceRow(
                "触发冷却",
                listOf("60" to "1 分钟", "300" to "5 分钟", "900" to "15 分钟", "3600" to "1 小时"),
                cooldownSeconds.toString(),
                enabled = !busy,
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
