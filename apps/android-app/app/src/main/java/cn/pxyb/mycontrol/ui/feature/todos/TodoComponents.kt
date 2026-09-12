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
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.util.DateTimeUtils.formatLocalDateTime
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

@Composable
internal fun TodoCard(task: TodoTask, onToggle: (String) -> Unit, onEdit: () -> Unit, onDelete: (String) -> Unit) {
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
internal fun TodoEditorDialog(
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
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            AppTextField(value = title, onValueChange = { title = it }, label = "待办内容")
            val dueOptions = listOfNotNull(task?.dueAt?.let { "keep" to formatLocalDateTime(it) }) +
                listOf("none" to "无", "today" to "今天", "tomorrow" to "明天", "week" to "7 天后")
            AppChoiceRow("截止", dueOptions, duePreset) { duePreset = it }
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
}

private fun todoMeta(task: TodoTask): String = listOfNotNull(
    when (task.priority) { "high" -> "高优先级"; "low" -> "低优先级"; else -> "普通" },
    task.dueAt?.let { "截止 ${formatLocalDateTime(it)}" },
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
