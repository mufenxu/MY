package cn.pxyb.mycontrol.ui.feature.todos

import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.*
import cn.pxyb.mycontrol.ui.components.button.*
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.*
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.*
import cn.pxyb.mycontrol.ui.components.picker.*
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID

@Composable
fun ScreenshotTodoScreen(state: ScreenshotUiState, contentPadding: PaddingValues, onBack: () -> Unit,
    onRecognize: (Uri) -> Unit, onSave: (TodoTask, String) -> Unit, onOpenTodos: () -> Unit) {
    var title by rememberSaveable(state.text) { mutableStateOf(state.suggestion.title) }
    var date by rememberSaveable(state.text) { mutableStateOf(state.suggestion.date.ifBlank { LocalDate.now().toString() }) }
    var time by rememberSaveable(state.text) { mutableStateOf(state.suggestion.time.ifBlank { "18:00" }) }
    var location by rememberSaveable(state.text) { mutableStateOf(state.suggestion.location) }
    var hasDue by rememberSaveable(state.text) { mutableStateOf(state.suggestion.date.isNotBlank()) }
    var datePicker by remember { mutableStateOf(false) }
    var timePicker by remember { mutableStateOf(false) }
    val taskId = remember(state.text) { UUID.randomUUID().toString() }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(onRecognize) }
    if (datePicker) AppDatePickerModal(currentDate = date, onDismiss = { datePicker = false }, onConfirm = { date = it; datePicker = false }, daysCount = 366, pastDaysCount = 30)
    if (timePicker) AppTimePickerModal(currentTime = time, onDismiss = { timePicker = false }, onConfirm = { time = it; timePicker = false })
    AppSubPage("截图转待办", onBack, contentPadding, subtitle = "本地识别，确认后保存") {
        if (state.text.isBlank() && !state.loading) item {
            AppPanel {
                AppEmptyState("从截图开始", detail = "选择课程或事项截图，在本机识别后核对内容，再保存为待办。",
                    actionText = "选择截图", onAction = { picker.launch(arrayOf("image/*")) })
            }
        } else item {
            AppSecondaryButton(text = "重新选择截图", onClick = { picker.launch(arrayOf("image/*")) }, enabled = !state.loading)
        }
        state.error?.let { item { AppFeedbackBanner(it, true) } }
        if (state.loading) item { AppSkeletonList() }
        if (state.savedTaskId != null) item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("待办与本机原图已保存，联网后会同步待办。")
            AppButton(text = "查看待办", onClick = onOpenTodos)
        }
        } }
        if (state.text.isNotBlank()) {
            item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("请核对识别结果", style = MaterialTheme.typography.titleMedium)
                AppTextField(title, { title = it }, label = "待办标题", singleLine = false)
                AppTextField(location, { location = it }, label = "地点（保存在本机原始资料中）")
                AppSwitchRow("设置截止时间", hasDue, { hasDue = it })
                if (hasDue) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppSecondaryButton(text = date, onClick = { datePicker = true })
                    AppSecondaryButton(text = time, onClick = { timePicker = true })
                }
                Text("识别出的日期仅为建议；未识别到时刻时默认 18:00，请核对后保存。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AppButton(modifier = Modifier.fillMaxWidth(), text = "确认创建待办", onClick = {
                    val due = if (hasDue) LocalDate.parse(date).atTime(LocalTime.parse(time)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() else null
                    onSave(TodoTask(id = taskId, title = title.trim(), dueAt = due, reminderAt = due?.minus(30 * 60_000)), location)
                }, enabled = title.isNotBlank(), loading = state.loading)
            }
        } }
            item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("识别原文", style = MaterialTheme.typography.titleMedium)
                Text(state.text)
                AsyncImage(state.bytes, "待办来源截图", modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp))
                Text("原图仅在本机加密保存，不上传、不随待办跨设备同步。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } }
        }
    }
}

@Composable
internal fun TodoSourcePreview(taskId: String) {
    val context = LocalContext.current
    val username = SessionStore(context).readActiveUsername()
    val source by produceState<org.json.JSONObject?>(null, taskId, username) {
        value = withContext(Dispatchers.IO) {
            runCatching { username?.let { TodoSourceStore(context, it).read(taskId) } }
                .getOrElse { org.json.JSONObject().put("error", "原图读取失败，待办内容仍可编辑。") }
        }
    }
    source?.let { data ->
        if (data.has("error")) {
            Text(data.getString("error"), color = MaterialTheme.colorScheme.error)
            return@let
        }
        Text("来源截图（仅本机）", style = MaterialTheme.typography.titleMedium)
        if (data.optString("location").isNotBlank()) Text("地点：${data.optString("location")}")
        val bytes = remember(data) { Base64.decode(data.getString("image"), Base64.NO_WRAP) }
        AsyncImage(bytes, "待办来源截图", modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp))
    }
}
