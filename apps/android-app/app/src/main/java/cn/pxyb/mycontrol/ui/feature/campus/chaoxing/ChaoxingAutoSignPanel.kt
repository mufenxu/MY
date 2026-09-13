package cn.pxyb.mycontrol.ui.feature.campus.chaoxing

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.ChaoxingAutoSign
import cn.pxyb.mycontrol.data.ChaoxingAutoSignResult
import cn.pxyb.mycontrol.data.ChaoxingCourse
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.util.DateTimeUtils

private const val AUTO_SIGN_TIME_LIMIT = 12

/**
 * 定时签到卡片：开关、签到时刻、签到课程、签到位置与最近一次执行结果。
 */
@Composable
internal fun ChaoxingAutoSignPanel(
    state: ChaoxingUiState,
    onToggleAutoSign: (Boolean) -> Unit,
    onRequestAddTime: () -> Unit,
    onRemoveAutoSignTime: (String) -> Unit,
    onSelectAutoSignCourse: (ChaoxingCourse?) -> Unit,
    onRequestLocation: () -> Unit,
    onRunAutoSign: () -> Unit,
) {
    val autoSign = state.autoSign
    val busy = state.busy
    var courseExpanded by remember { mutableStateOf(false) }

    AppPanel {
        Column(Modifier.fillMaxWidth()) {
            AppSwitchRow(
                title = "定时签到",
                subtitle = autoSignSubtitle(autoSign),
                icon = Icons.Outlined.Schedule,
                checked = autoSign.enabled,
                onCheckedChange = onToggleAutoSign,
                enabled = !busy,
            )
            AppDivider()
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AutoSignFieldLabel("签到时刻", "每天到点检查一次")
                    if (autoSign.times.isEmpty()) {
                        Text("还没有签到时刻，添加后才会自动执行。", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        autoSign.times.forEach { time ->
                            AutoSignTimeRow(time, enabled = !busy) { onRemoveAutoSignTime(time) }
                        }
                    }
                    AppSecondaryButton("添加签到时刻", onRequestAddTime, icon = Icons.Outlined.Add,
                        modifier = Modifier.fillMaxWidth(), enabled = !busy && autoSign.times.size < AUTO_SIGN_TIME_LIMIT)
                    if (autoSign.times.size >= AUTO_SIGN_TIME_LIMIT) {
                        Text("最多可设置 $AUTO_SIGN_TIME_LIMIT 个签到时刻。", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AutoSignFieldLabel("签到课程", "只在该课程里查找待签到活动")
                    AppSelectField("签到课程", autoSign.course?.key, autoSignCourseOptions(state, autoSign),
                        onValueChange = { key ->
                            courseExpanded = false
                            val picked = state.courses.firstOrNull { it.key == key }
                            if (picked != null || key == null) onSelectAutoSignCourse(picked)
                        },
                        expanded = courseExpanded, onExpandedChange = { courseExpanded = it },
                        enabled = !busy, modifier = Modifier.fillMaxWidth())
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AutoSignFieldLabel("签到位置", "自动签到使用该位置提交")
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(Icons.Outlined.LocationOn, contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                            Text(
                                text = autoSign.location?.address ?: "尚未保存签到位置",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (autoSign.location == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    AppSecondaryButton(
                        text = if (autoSign.location == null) "使用当前位置保存" else "更新签到位置",
                        onClick = onRequestLocation,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                        loading = state.operation == "auto-sign-location",
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AutoSignFieldLabel("最近一次")
                    AutoSignResultCard(autoSign)
                    if (!autoSign.notifyConfigured) {
                        Text("尚未关联失败提醒收件人，签到失败时可能收不到企业微信消息，请先在提醒设置中填写企业微信成员账号。",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                    AppSecondaryButton("立即执行一次", onRunAutoSign, icon = Icons.Outlined.PlayArrow,
                        modifier = Modifier.fillMaxWidth(), enabled = !busy && autoSign.enabled,
                        loading = state.operation == "auto-sign-run")
                    Text("在设定的时刻检查所选课程里最新的未签到活动，用保存的位置调用帮你签服务；失败会通过企业微信与通知中心提醒。",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun AutoSignFieldLabel(title: String, hint: String? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
        if (!hint.isNullOrBlank()) {
            Text(hint, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun AutoSignTimeRow(time: String, enabled: Boolean, onRemove: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Outlined.Schedule, contentDescription = null,
                tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(time, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                Text("每天", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.size(2.dp))
            IconButton(onClick = onRemove, enabled = enabled) {
                Icon(Icons.Outlined.Close, contentDescription = "移除 $time",
                    tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun AutoSignResultCard(autoSign: ChaoxingAutoSign) {
    val result = autoSign.lastResult
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                AppStatusBadge(label = autoSignResultLabel(result), semantic = autoSignResultSemantic(result))
                Spacer(Modifier.weight(1f))
                autoSign.lastRunAt?.let { time ->
                    Text(DateTimeUtils.formatPlatformTime(time), style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                text = listOfNotNull(result?.activityName, result?.courseName).filter(String::isNotBlank).joinToString(" · ")
                    .ifBlank { if (result == null) "等待第一次自动执行。" else "未记录具体活动。" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (!result?.message.isNullOrBlank()) {
                Text(result.message, style = MaterialTheme.typography.bodySmall,
                    color = if (result.failed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun autoSignCourseOptions(state: ChaoxingUiState, autoSign: ChaoxingAutoSign): List<AppSelectOption<String?>> = buildList {
    add(AppSelectOption(null, "全部课程", "在全部课程中查找待签到活动"))
    state.courses.forEach { course ->
        add(AppSelectOption(course.key, course.name,
            listOf(course.teacher, course.className).filter(String::isNotBlank).joinToString(" · ")))
    }
    val saved = autoSign.course
    if (saved != null && state.courses.none { it.key == saved.key }) {
        add(AppSelectOption(saved.key, saved.name.ifBlank { "已选课程" }, "该课程当前不在课程列表中"))
    }
}

private fun autoSignSubtitle(autoSign: ChaoxingAutoSign): String {
    val base = when {
        autoSign.enabled && autoSign.times.isNotEmpty() -> "已开启 · ${autoSign.times.joinToString("、")}"
        autoSign.enabled -> "已开启"
        autoSign.times.isNotEmpty() -> "未开启 · ${autoSign.times.joinToString("、")}"
        else -> "未开启"
    }
    val course = autoSign.course?.name?.takeIf { it.isNotBlank() } ?: return base
    return "$base · $course"
}

private fun autoSignResultLabel(result: ChaoxingAutoSignResult?): String = when (result?.status) {
    "success" -> "签到成功"
    "failed" -> "签到失败"
    "skipped" -> "本次跳过"
    else -> "尚未执行"
}

private fun autoSignResultSemantic(result: ChaoxingAutoSignResult?): AppStatusSemantic = when (result?.status) {
    "success" -> AppStatusSemantic.Success
    "failed" -> AppStatusSemantic.Error
    "skipped" -> AppStatusSemantic.Neutral
    else -> AppStatusSemantic.Info
}
