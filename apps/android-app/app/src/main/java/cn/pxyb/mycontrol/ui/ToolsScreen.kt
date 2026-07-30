package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoMode
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Router
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale

private sealed interface ToolConfirmation {
    data object Ct8 : ToolConfirmation
    data class Scene(val scene: IotScene) : ToolConfirmation
}

@Composable
fun ToolsScreen(
    state: AppUiState,
    contentPadding: PaddingValues,
    onTriggerCt8: () -> Unit,
    onRunScene: (String) -> Unit,
    onRefresh: () -> Unit,
) {
    var confirmation by remember { mutableStateOf<ToolConfirmation?>(null) }
    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val iot = state.iot
    val ct8 = state.ct8
    val modules = remember(state.overview?.services) {
        state.overview?.services.orEmpty().filter { service ->
            service.id in setOf("core", "exam", "campus", "mqtt", "notify") ||
                service.name.lowercase() in setOf("core", "exam", "campus", "iot", "notification")
        }
    }

    LazyColumn(
        modifier = screenPadding(contentPadding),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ImmersiveHeader(
                title = "平台工具",
                refreshing = state.refreshing,
                onRefresh = onRefresh
            )
        }
        item { SectionHeader("IoT 实时状态", "设备和自动化场景") }
        item {
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(
                            if (iot?.mqttConnected == true) Icons.Outlined.Router else Icons.Outlined.WifiOff,
                            if (iot?.mqttConnected == true) Forest else Amber,
                            if (iot?.mqttConnected == true) MintPale else AmberPale,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(if (iot?.mqttConnected == true) "MQTT 已连接" else "MQTT 状态异常", style = MaterialTheme.typography.titleMedium)
                            Text(
                                iot?.connectionState ?: "等待 IoT 状态",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        StatusBadge(if (iot?.mqttConnected == true) "healthy" else "degraded")
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        MetricCell("在线设备", iot?.devices?.count { it.online }?.toString() ?: "--", Modifier.weight(1f), Forest)
                        MetricCell("设备总数", iot?.devices?.size?.toString() ?: "--", Modifier.weight(1f), Ocean)
                        MetricCell("接收消息", iot?.messagesReceived?.toString() ?: "--", Modifier.weight(1f))
                    }
                }
            }
        }

        if (!iot?.devices.isNullOrEmpty()) {
            item { SectionHeader("设备", "最近遥测") }
            item {
                AppPanel {
                    iot!!.devices.forEachIndexed { index, device ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(11.dp),
                        ) {
                            IconTile(Icons.Outlined.Sensors, if (device.online) Forest else Amber, if (device.online) MintPale else AmberPale)
                            Column(modifier = Modifier.weight(1f)) {
                                Text(device.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    device.temperature?.let {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Outlined.Thermostat, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                            Text(" ${"%.1f".format(it)}°", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    device.humidity?.let {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Outlined.WaterDrop, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                            Text(" ${"%.0f".format(it)}%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }
                            }
                            StatusBadge(if (device.online) "online" else "offline", if (device.online) "在线" else "离线")
                        }
                        if (index < iot.devices.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                    }
                }
            }
        }

        if (!iot?.scenes.isNullOrEmpty()) {
            item { SectionHeader("快捷场景", "IoT 自动化") }
            item {
                AppPanel {
                    iot!!.scenes.forEachIndexed { index, scene ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(11.dp),
                        ) {
                            IconTile(Icons.Outlined.AutoMode, Ocean, OceanPale)
                            Column(modifier = Modifier.weight(1f)) {
                                Text(scene.name, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "${scene.actionCount} 个动作 · ${formatPlatformTime(scene.updatedAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            FilledTonalButton(
                                onClick = { confirmation = ToolConfirmation.Scene(scene) },
                                enabled = canOperate && state.busyAction == null,
                                shape = MaterialTheme.shapes.medium,
                            ) {
                                Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text("运行", modifier = Modifier.padding(start = 5.dp))
                            }
                        }
                        if (index < iot.scenes.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                    }
                }
            }
        }

        item { SectionHeader("CT8 自动化", "GitHub Actions 执行状态") }
        item {
            AppPanel {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        IconTile(Icons.Outlined.AutoMode, Ocean, OceanPale)
                        Column(modifier = Modifier.weight(1f)) {
                            Text("最近任务 ${ct8?.latestRunId?.let { "#${it.takeLast(10)}" } ?: "--"}", style = MaterialTheme.typography.titleMedium)
                            Text(formatPlatformTime(ct8?.lastRunAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        StatusBadge(ct8?.activeStatus?.takeIf { it != "idle" } ?: ct8?.latestStatus ?: "unknown")
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        MetricCell("主机总数", ct8?.totalHosts?.toString() ?: "--", Modifier.weight(1f))
                        MetricCell("成功", ct8?.successHosts?.toString() ?: "--", Modifier.weight(1f), Forest)
                        MetricCell("失败", ct8?.failedHosts?.toString() ?: "--", Modifier.weight(1f), Amber)
                    }
                    Button(
                        onClick = { confirmation = ToolConfirmation.Ct8 },
                        enabled = canOperate && state.busyAction == null && ct8?.activeStatus !in setOf("running", "queued", "in_progress"),
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        if (state.busyAction == "ct8") CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(19.dp))
                        Text("触发 CT8 任务", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }

        item { SectionHeader("业务模块", "统一平台服务可用性") }
        item {
            AppPanel {
                if (modules.isEmpty()) {
                    EmptyBlock("等待模块状态", "完成平台同步后显示")
                } else {
                    modules.forEachIndexed { index, service ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(11.dp),
                        ) {
                            IconTile(moduleIcon(service.id), Ocean, OceanPale)
                            Column(modifier = Modifier.weight(1f)) {
                                Text(service.name, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    service.latencyMs?.let { "响应 $it ms" } ?: "等待响应数据",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            StatusBadge(service.state)
                        }
                        if (index < modules.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp))
                    }
                }
            }
        }
    }

    when (val pending = confirmation) {
        ToolConfirmation.Ct8 -> ToolConfirmDialog(
            title = "触发 CT8 自动化？",
            detail = "任务将提交到 GitHub Actions，并由平台持续记录执行状态。",
            confirmLabel = "确认触发",
            onDismiss = { confirmation = null },
            onConfirm = { confirmation = null; onTriggerCt8() },
        )
        is ToolConfirmation.Scene -> ToolConfirmDialog(
            title = "运行“${pending.scene.name}”？",
            detail = "场景包含 ${pending.scene.actionCount} 个设备动作，执行结果将写入 IoT 审计记录。",
            confirmLabel = "确认运行",
            onDismiss = { confirmation = null },
            onConfirm = { confirmation = null; onRunScene(pending.scene.id) },
        )
        null -> Unit
    }
}

@Composable
private fun ToolConfirmDialog(
    title: String,
    detail: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.medium,
        icon = { Icon(Icons.Outlined.AutoMode, contentDescription = null) },
        title = { Text(title) },
        text = { Text(detail) },
        confirmButton = { Button(onClick = onConfirm, shape = MaterialTheme.shapes.medium) { Text(confirmLabel) } },
        dismissButton = { OutlinedButton(onClick = onDismiss, shape = MaterialTheme.shapes.medium) { Text("取消") } },
    )
}

private fun moduleIcon(id: String) = when (id) {
    "mqtt", "iot" -> Icons.Outlined.Router
    "campus" -> Icons.Outlined.CloudQueue
    "exam" -> Icons.Outlined.CheckCircle
    "core" -> Icons.Outlined.Memory
    else -> Icons.Outlined.Devices
}
