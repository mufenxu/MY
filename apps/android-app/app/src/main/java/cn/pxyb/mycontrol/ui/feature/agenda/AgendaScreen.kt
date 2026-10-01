package cn.pxyb.mycontrol.ui.feature.agenda

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal fun agendaTime(value: Long): String = Instant.ofEpochMilli(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm"))

internal fun LazyListScope.agendaItems(
    state: AgendaUiState,
    timetable: CampusTimetable?,
    todos: List<TodoTask>,
    date: LocalDate,
    onDateChange: (LocalDate) -> Unit,
    onRefresh: () -> Unit,
    onOpen: (String) -> Unit,
) {
    val courseWarning = agendaCourseWarning(timetable, date)
    val items = buildAgenda(date, timetable, todos, state.rooms, state.seats)
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppSecondaryButton(text = "前一天", onClick = { onDateChange(date.minusDays(1)) }, modifier = Modifier.weight(1f))
                AppSecondaryButton(text = "今天", onClick = { onDateChange(LocalDate.now()) }, modifier = Modifier.weight(1f))
                AppSecondaryButton(text = "后一天", onClick = { onDateChange(date.plusDays(1)) }, modifier = Modifier.weight(1f))
            }
        }
        item { Text("$date · ${listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")[date.dayOfWeek.value - 1]}", style = MaterialTheme.typography.titleMedium) }
        if (courseWarning != null || state.errors.isNotEmpty()) item {
            AppFeedbackBanner("日程可能不完整或含缓存数据，请刷新后确认。" + (listOfNotNull(courseWarning) + state.errors).joinToString("\n", prefix = "\n"), error = true, onRetry = onRefresh)
        }
        if (state.loading && !state.loaded) item { AppSkeletonList() }
        items(items, key = { it.id }) { item ->
            val conflicts = agendaConflicts(items, item.start, item.end, item.id)
            AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${agendaTime(item.start)}${if (item.blocksTime) "—${agendaTime(item.end)}" else " 截止"} · ${item.kind}", style = MaterialTheme.typography.labelLarge)
                Text(item.title, style = MaterialTheme.typography.titleMedium)
                if (item.location.isNotBlank()) Text(item.location)
                if (conflicts.isNotEmpty()) Text("时间重叠：${conflicts.joinToString("、") { it.title }}", color = MaterialTheme.colorScheme.error)
                AppSecondaryButton(text = "查看${item.kind}", onClick = { onOpen(item.kind) })
            }
        }
        }
        if (items.isEmpty() && !state.loading) item { Text("这一天暂无已加载的日程。") }
        item {
            AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("可安排时段（08:00—22:00）", style = MaterialTheme.typography.titleMedium)
                Text(if (courseWarning != null || !state.loaded || state.errors.isNotEmpty() || state.loading) "数据尚未完整，暂不推算空闲时间。"
                    else agendaFreeWindows(items, date).joinToString("\n") { "${agendaTime(it.first)}—${agendaTime(it.second)}" }.ifBlank { "没有连续 30 分钟以上的空闲时段。" })
                Text("仅按已加载的课程和预约推算；待办截止时间不占用整段时间。", style = MaterialTheme.typography.bodySmall)
            }
        }
        }
}
