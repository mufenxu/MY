package cn.pxyb.mycontrol.ui.feature.scenes

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Tune
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AutomationCondition
import cn.pxyb.mycontrol.data.AutomationEngine
import cn.pxyb.mycontrol.data.AutomationRule
import cn.pxyb.mycontrol.data.AutomationRun
import cn.pxyb.mycontrol.data.DeviceInfo
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.dialog.DialogInfoText
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.filter.AppChoiceRow
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.util.DateTimeUtils.formatLocalDateTime

@Composable
internal fun AutomationRuleCard(
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
                AppIconTile(
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
                AppStatusBadge(
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
internal fun AutomationRunCard(run: AutomationRun) {
    AppPanel {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppIconTile(Icons.Outlined.PlayArrow, ColorTokens.Blue.foreground, ColorTokens.Blue.container)
                Column(Modifier.weight(1f)) {
                    Text(run.sourceName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        listOfNotNull(
                            if (run.sourceType == "rule") "规则触发" else "手动场景",
                            run.createdAt?.let(::formatLocalDateTime),
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppStatusBadge(run.state, automationRunStateLabel(run.state))
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
internal fun AutomationRuleEditorDialog(
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
            AppTextField(value = name, onValueChange = { name = it }, label = "规则名称", enabled = !busy)
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
            AppChoiceRow(
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
                    AppChoiceRow(
                        "比较方式",
                        listOf("gt" to "大于", "gte" to "大于等于", "lt" to "小于", "lte" to "小于等于"),
                        operator,
                        enabled = !busy,
                    ) { operator = it }
                    AppTextField(value = value, onValueChange = { value = it.filter { char -> char.isDigit() || char in ".-" } }, label = "阈值", enabled = !busy)
                }
                "online" -> AppChoiceRow("目标状态", listOf("ONLINE" to "在线", "OFFLINE" to "离线"), value.uppercase(), enabled = !busy) { value = it }
                "relay" -> {
                    Text("监控继电器", style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        selectedDevice?.relays?.keys.orEmpty().sorted().forEach { id ->
                            AppFilterChip(label = id, selected = relayId == id, enabled = !busy, onClick = { relayId = id })
                        }
                    }
                    AppChoiceRow("目标状态", listOf("ON" to "开启", "OFF" to "关闭"), value.uppercase(), enabled = !busy) { value = it }
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
            AppChoiceRow(
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
