package cn.pxyb.mycontrol.ui.feature.workspace

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.material.icons.outlined.Refresh
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.feature.campus.CampusOverviewSection
import cn.pxyb.mycontrol.ui.feature.campus.timetable.CourseCard
import cn.pxyb.mycontrol.ui.feature.campus.timetable.TermTimetable
import cn.pxyb.mycontrol.ui.feature.todos.TodoCard
import cn.pxyb.mycontrol.ui.feature.todos.TodoEditorDialog
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.LocalDate
import java.time.temporal.ChronoUnit

private enum class CampusWorkspaceSection { Today, Timetable, Campus, Todos }

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
    val timetableState = rememberSaveableStateHolder()
    val workspaceTabs: @Composable () -> Unit = {
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
    val timetableContent: @Composable (Modifier, Boolean) -> Unit = { modifier, bounded ->
        timetableState.SaveableStateProvider("timetable") {
            TermTimetable(
                courses = state.timetable?.courses.orEmpty(),
                currentCalendarText = state.timetable?.currentCalendarText,
                schoolCalendar = state.timetable?.schoolCalendar,
                modifier = modifier,
                bounded = bounded,
            )
        }
    }
    val wideTimetable = campusSection == CampusWorkspaceSection.Timetable && isTablet

    val todoItems: androidx.compose.foundation.lazy.LazyListScope.() -> Unit = {
        item(key = "todos-title", contentType = "section") {
            AppSectionHeader(
                title = "个人待办",
                subtitle = "${activeTodos.size} 项未完成",
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
                        AppIconTile(Icons.Outlined.Add, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
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

    AppSubPage(
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
        onRefresh = if (wideTimetable) null else onRefresh,
        actions = {
            if (wideTimetable) {
                AppHeaderIconButton(
                    icon = Icons.Outlined.Refresh,
                    contentDescription = "刷新课表",
                    onClick = onRefresh,
                    loading = state.refreshing,
                )
            }
            AppHeaderIconButton(
                icon = Icons.Outlined.CalendarMonth,
                contentDescription = "同步到 Android 日历",
                onClick = onSyncCalendar,
                enabled = !state.calendarSyncing,
                loading = state.calendarSyncing,
            )
        },
        body = if (wideTimetable) {
            {
                Column(
                    Modifier.fillMaxSize().padding(horizontal = AppPageHorizontalPadding),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    workspaceTabs()
                    state.sectionError?.let { message ->
                        AppFeedbackBanner(message, error = true, onRetry = onRefresh)
                    }
                    if (state.offlineMode) {
                        AppFeedbackBanner("当前展示离线课表，联网后可刷新。", error = false)
                    }
                    timetableContent(Modifier.weight(1f), true)
                }
            }
        } else null,
    ) {
        if (state.offlineMode || state.pendingTodoMutations > 0) {
            item(key = "today-offline", contentType = "banner") {
                AppFeedbackBanner(
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
                AppFeedbackBanner("部分今日数据暂不可用：$message", error = true)
            }
        }

        item(key = "workspace-sections", contentType = "filter") {
            workspaceTabs()
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
                                AppSectionHeader(title = "今天的课程", subtitle = state.timetable?.currentCalendarText)
                                if (state.refreshing && courses.isEmpty()) {
                                    AppSkeletonList(
                                        rowCount = 2,
                                        leadingSize = 32.dp,
                                        lineWidths = listOf(0.36f, 0.62f),
                                    )
                                } else if (courses.isEmpty()) {
                                    AppEmptyState("今天没有课程", detail = "可以把时间留给个人待办或需要处理的事项。")
                                } else {
                                    courses.forEach { course ->
                                        CourseCard(course)
                                    }
                                }

                                AppSectionHeader(
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
                                            AppIconTile(
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
                                AppSectionHeader(
                                    title = "个人待办",
                                    subtitle = "${activeTodos.size} 项未完成",
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
                                            AppIconTile(Icons.Outlined.Add, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
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

                                AppSectionHeader(title = "需要处理", subtitle = "系统提醒统一进入通知中心")
                                AttentionCard(
                                    label = "系统通知",
                                    value = state.unreadAlerts,
                                    onClick = onOpenNotifications,
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                if (expiringResources.isNotEmpty()) {
                                    AppSectionHeader(title = "即将到期", subtitle = "脱敏资源摘要，不包含密码或连接凭据")
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
                        AppSectionHeader(title = "今天的课程", subtitle = state.timetable?.currentCalendarText)
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
                            AppEmptyState("今天没有课程", detail = "可以把时间留给个人待办或需要处理的事项。")
                        }
                    } else {
                        items(courses, key = CampusCourse::id, contentType = { "course" }) { course ->
                            CourseCard(course)
                        }
                    }

                    todoItems()

                    // 🌟 明日课程预告
                    item(key = "tomorrow-courses-title", contentType = "section") {
                        AppSectionHeader(
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
                                    AppIconTile(
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
                        AppSectionHeader(title = "需要处理", subtitle = "系统提醒统一进入通知中心")
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
                            AppSectionHeader(title = "即将到期", subtitle = "脱敏资源摘要，不包含密码或连接凭据")
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
                timetableContent(Modifier, false)
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
