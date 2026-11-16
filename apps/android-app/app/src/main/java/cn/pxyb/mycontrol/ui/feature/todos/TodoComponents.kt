package cn.pxyb.mycontrol.ui.feature.todos

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.TodoCourseRef
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.display.AppListCard
import cn.pxyb.mycontrol.ui.components.filter.AppChoiceRow
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.input.AppPickerField
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.interaction.AppSwipeAction
import cn.pxyb.mycontrol.ui.components.interaction.AppSwipeActions
import cn.pxyb.mycontrol.ui.components.picker.AppDatePickerModal
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.util.DateTimeUtils.formatLocalDateTime
import cn.pxyb.mycontrol.util.DateTimeUtils.formatMinutesToTime
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@Composable
internal fun TodoCard(task: TodoTask, onToggle: (String) -> Unit, onEdit: () -> Unit, onDelete: (String) -> Unit) {
    // 删除不再弹确认：调用方把它排进可撤销的延迟删除，误触可在提示里撤回。
    AppSwipeActions(
        itemKey = task.id,
        startAction = AppSwipeAction(
            icon = if (task.completed) Icons.Outlined.Schedule else Icons.Outlined.CheckCircle,
            label = if (task.completed) "右滑标为未完成" else "右滑完成",
            releaseLabel = if (task.completed) "松开标为未完成" else "松开完成",
            containerColor = ColorTokens.Green.container,
            contentColor = ColorTokens.Green.foreground,
            onTrigger = { onToggle(task.id) },
        ),
    ) { AppListCard(
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
    ) }
}

@Composable
internal fun TodoEditorDialog(
    task: TodoTask?,
    initialTitle: String = "",
    courses: List<CampusCourse>,
    onDismiss: () -> Unit,
    onSave: (TodoTask) -> Unit,
) {
    val zone = remember { ZoneId.systemDefault() }
    val today = remember { LocalDate.now() }
    val initialDue = remember(task?.id) { task?.dueAt?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalDateTime() } }
    val initialLead = remember(task?.id) { todoReminderLeadMinutes(task) }
    val leadChoices = remember(task?.id) { todoReminderLeadChoices(initialLead) }
    var title by rememberSaveable(task?.id, initialTitle) { mutableStateOf(task?.title ?: initialTitle) }
    var priority by rememberSaveable(task?.id) { mutableStateOf(task?.priority ?: "normal") }
    var recurrence by rememberSaveable(task?.id) { mutableStateOf(task?.recurrence ?: "none") }
    var dueDate by rememberSaveable(task?.id) { mutableStateOf(initialDue?.toLocalDate()?.toString()) }
    var dueTime by rememberSaveable(task?.id) {
        mutableStateOf(initialDue?.let { formatMinutesToTime(it.hour * 60 + it.minute) } ?: TODO_DEFAULT_DUE_TIME)
    }
    var leadMinutes by rememberSaveable(task?.id) { mutableStateOf(initialLead) }
    // 没动过截止与提醒时，保存必须原样带回这条待办当前的字段，哪怕它在编辑期间被其他设备改过。
    var scheduleTouched by rememberSaveable(task?.id) { mutableStateOf(false) }
    var courseId by rememberSaveable(task?.id) { mutableStateOf(task?.courseRef?.id) }
    var pickingDate by remember { mutableStateOf(false) }
    var pickingTime by remember { mutableStateOf(false) }
    val selectedDueAt = todoDueAtMillis(dueDate, dueTime, zone)
    AppDialogForm(
        onConfirm = {
            val now = System.currentTimeMillis()
            val selectedCourse = courses.firstOrNull { it.id == courseId }
            val schedule = if (task != null && !scheduleTouched) {
                TodoSchedule(task.dueAt, task.reminderAt, task.reminderStatus, task.remindedAt)
            } else {
                resolveTodoSchedule(task, selectedDueAt, leadMinutes)
            }
            onSave(
                (task ?: TodoTask(id = UUID.randomUUID().toString(), title = title.trim())).copy(
                    title = title.trim(),
                    priority = priority,
                    recurrence = recurrence,
                    dueAt = schedule.dueAt,
                    reminderAt = schedule.reminderAt,
                    reminderStatus = schedule.reminderStatus,
                    remindedAt = schedule.remindedAt,
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
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            task?.id?.let { TodoSourcePreview(it) }
            AppTextField(value = title, onValueChange = { title = it }, label = "待办内容")
            val quickDates = listOf("today" to today, "tomorrow" to today.plusDays(1), "week" to today.plusDays(7))
            AppChoiceRow(
                title = "截止",
                choices = listOf("none" to "无", "today" to "今天", "tomorrow" to "明天", "week" to "7 天后"),
                selected = if (dueDate == null) "none" else quickDates.firstOrNull { it.second.toString() == dueDate }?.first.orEmpty(),
            ) { key ->
                dueDate = quickDates.firstOrNull { it.first == key }?.second?.toString()
                scheduleTouched = true
            }
            AppPickerField(
                label = "截止日期",
                value = todoDueDateLabel(dueDate, today),
                onClick = { pickingDate = true },
                placeholder = "未设置",
                icon = Icons.Outlined.CalendarMonth,
            )
            if (dueDate != null) {
                AppPickerField(
                    label = "截止时间",
                    value = dueTime,
                    onClick = { pickingTime = true },
                    icon = Icons.Outlined.AccessTime,
                )
                AppChoiceRow(
                    title = "提醒",
                    choices = leadChoices.map { (it?.toString() ?: "none") to todoReminderLeadLabel(it) },
                    selected = leadMinutes?.toString() ?: "none",
                ) { key ->
                    leadMinutes = key.toIntOrNull()
                    scheduleTouched = true
                }
                if (scheduleTouched && selectedDueAt != null && selectedDueAt < System.currentTimeMillis()) {
                    Text(
                        "所选截止时间已早于当前时间。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            AppChoiceRow("优先级", listOf("low" to "低", "normal" to "普通", "high" to "高"), priority) { priority = it }
            AppChoiceRow("重复", listOf("none" to "不重复", "daily" to "每天", "weekly" to "每周", "monthly" to "每月"), recurrence) { recurrence = it }
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
    if (pickingDate) {
        AppDatePickerModal(
            title = "截止日期",
            currentDate = dueDate ?: today.toString(),
            today = today,
            daysCount = 366,
            pastDaysCount = 0,
            onDismiss = { pickingDate = false },
            onConfirm = {
                dueDate = it
                scheduleTouched = true
            },
        )
    }
    if (pickingTime) {
        AppTimePickerModal(
            title = "截止时间",
            currentTime = dueTime,
            onDismiss = { pickingTime = false },
            onConfirm = {
                dueTime = it
                scheduleTouched = true
            },
        )
    }
}

private fun todoDueDateLabel(date: String?, today: LocalDate): String {
    val day = date?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return ""
    val weekday = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")[day.dayOfWeek.value - 1]
    val year = if (day.year == today.year) "" else "${day.year}年"
    return "$year${day.monthValue}月${day.dayOfMonth}日 $weekday"
}

private fun todoMeta(task: TodoTask): String = listOfNotNull(
    when (task.priority) { "high" -> "高优先级"; "low" -> "低优先级"; else -> "普通" },
    task.dueAt?.let { "截止 ${formatLocalDateTime(it)}" },
    task.courseRef?.name,
    when (task.recurrence) { "daily" -> "每天"; "weekly" -> "每周"; "monthly" -> "每月"; else -> null },
).joinToString(" · ")
