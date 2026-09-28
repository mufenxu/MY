package cn.pxyb.mycontrol.ui.feature.study

import android.os.SystemClock
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.*
import cn.pxyb.mycontrol.ui.components.layout.*
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.ZoneId
import java.time.Instant
import java.time.format.DateTimeFormatter

@Composable
fun StudyScreen(state: StudyUiState, courses: List<CampusCourse>, todos: List<TodoTask>, contentPadding: PaddingValues,
    onBack: () -> Unit, onLoad: () -> Unit, onStart: (String, String?) -> Unit, onFinish: (String) -> Unit) {
    var subject by rememberSaveable { mutableStateOf("") }
    var taskId by rememberSaveable { mutableStateOf<String?>(null) }
    var note by rememberSaveable { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var elapsed by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) { onLoad() }
    LaunchedEffect(state.running) { while (state.running != null) { elapsed = (SystemClock.elapsedRealtime() - state.running.elapsedStart).coerceAtLeast(0); delay(1000) } }
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now()
    val weekStart = today.minusDays((today.dayOfWeek.value - 1).toLong()).atStartOfDay(zone).toInstant().toEpochMilli()
    val todayStart = today.atStartOfDay(zone).toInstant().toEpochMilli()
    fun durationSince(start: Long, session: StudySession) = (session.start + session.duration - maxOf(session.start, start)).coerceIn(0, session.duration)
    val options = courses.distinctBy { it.courseName }.map { AppSelectOption("course:${it.id}", it.courseName) } +
        todos.filterNot { it.completed }.map { AppSelectOption("todo:${it.id}", it.title, it.courseRef?.name) }
    AppSubPage("学习计时", onBack, contentPadding, subtitle = "记录课程与待办的实际学习时间", pinHeader = true) {
        state.error?.let { item { AppFeedbackBanner(it, error = true, onRetry = onLoad) } }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("今日 ${state.sessions.sumOf { durationSince(todayStart, it) } / 60_000} 分钟 · 本周 ${state.sessions.sumOf { durationSince(weekStart, it) } / 60_000} 分钟", style = MaterialTheme.typography.titleMedium)
            if (state.running != null) {
                Text(state.running.subject, style = MaterialTheme.typography.titleLarge)
                Text("%02d:%02d:%02d".format(elapsed / 3_600_000, elapsed / 60_000 % 60, elapsed / 1000 % 60), style = MaterialTheme.typography.headlineLarge)
                AppTextField(note, { note = it }, label = "本次学了什么", singleLine = false)
                AppButton(text = "结束并保存", onClick = { onFinish(note) }, loading = state.loading)
                Text("退出页面、锁屏后仍会计时；重启手机会停止本次计时。", style = MaterialTheme.typography.bodySmall)
            } else {
                AppSelectField("关联课程或待办", taskId, options, { key ->
                    taskId = key
                    subject = options.first { it.value == key }.label
                }, expanded, { expanded = it })
                AppTextField(subject, { subject = it; taskId = null }, label = "学习内容")
                AppButton(text = "开始学习", onClick = { onStart(subject, taskId) }, enabled = state.loaded && subject.isNotBlank(), loading = state.loading)
            }
        }
        } }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("本周科目投入", style = MaterialTheme.typography.titleMedium)
            val grouped = state.sessions.filter { it.start + it.duration > weekStart }.groupBy { it.subject }
            if (grouped.isEmpty()) Text("开始一次学习后，这里会显示按科目统计的时间。")
            grouped.entries.sortedByDescending { it.value.sumOf { row -> durationSince(weekStart, row) } }.forEach { (subject, records) ->
                Text("$subject · ${records.sumOf { durationSince(weekStart, it) } / 60_000} 分钟")
            }
        }
        } }
        items(state.sessions.sortedByDescending { it.start }, key = { it.id }) { row -> AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(row.subject, style = MaterialTheme.typography.titleMedium)
            Text("${Instant.ofEpochMilli(row.start).atZone(zone).format(DateTimeFormatter.ofPattern("MM-dd HH:mm"))} · ${row.duration / 60_000} 分钟")
            if (row.note.isNotBlank()) Text(row.note)
            AppSecondaryButton(text = "继续学习", onClick = { subject = row.subject; taskId = row.taskId; onStart(row.subject, row.taskId) }, enabled = state.running == null && !state.loading)
        }
        } }
    }
}
