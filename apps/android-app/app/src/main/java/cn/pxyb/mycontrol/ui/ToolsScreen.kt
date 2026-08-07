package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoMode
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Router
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.DeviceInfo
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.Mint
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale

private sealed interface ToolConfirmation {
    data object Ct8 : ToolConfirmation
    data class Scene(val scene: IotScene) : ToolConfirmation
}

private data class RelayTarget(
    val deviceId: String,
    val relayId: String,
    val name: String,
    val description: String,
    val icon: ImageVector,
    val accent: Color,
    val accentPale: Color,
)

private val relayTargets = listOf(
    RelayTarget(
        deviceId = "esp8266_living",
        relayId = "relay1",
        name = "客厅灯光",
        description = "客厅监控设备 · 通道 1",
        icon = Icons.Outlined.Lightbulb,
        accent = Forest,
        accentPale = MintPale,
    ),
    RelayTarget(
        deviceId = "relay_balcony",
        relayId = "relay2",
        name = "阳台插座",
        description = "阳台继电器 · 通道 2",
        icon = Icons.Outlined.PowerSettingsNew,
        accent = Coral,
        accentPale = CoralPale,
    ),
)

@Composable
fun ToolsScreen(
    state: ToolsUiState,
    contentPadding: PaddingValues,
    currentTab: MainTab,
    onTriggerCt8: () -> Unit,
    onRunScene: (String) -> Unit,
    onControlRelay: (String, String, Boolean) -> Unit,
    onRefresh: () -> Unit,
) {
    var confirmation by remember { mutableStateOf<ToolConfirmation?>(null) }

    // 切换底部页面时自动收起本页确认弹窗
    LaunchedEffect(currentTab) {
        confirmation = null
    }

    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val iot = state.iot
    val ct8 = state.ct8
    val modules = remember(state.overview?.services) {
        state.overview?.services.orEmpty().filter { service ->
            service.id in setOf("core", "exam", "campus", "mqtt", "notify") ||
                service.name.lowercase() in setOf("core", "exam", "campus", "iot", "notification")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = contentPadding.calculateTopPadding() + 4.dp,
                bottom = contentPadding.calculateBottomPadding() + 16.dp,
            ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ImmersiveHeader(
            title = "设备与自动化",
            refreshing = state.refreshing,
            onRefresh = onRefresh,
        )
        state.sectionError?.let { message ->
            FeedbackBanner("设备数据暂不可用：$message", error = true)
        }

        ToolSectionHeader("IoT 实时状态", "设备与自动化场景", Ocean)
        MqttStatusPanel(
            mqttConnected = iot?.mqttConnected == true,
            connectionState = iot?.connectionState ?: "等待 IoT 状态",
            onlineDevices = iot?.devices?.count { it.online } ?: 0,
            totalDevices = iot?.devices?.size ?: 0,
            messagesReceived = iot?.messagesReceived ?: 0,
        )

        ToolSectionHeader("环境监测", "实时温湿度", Forest)
        val sensorDevice = iot?.devices?.firstOrNull { it.temperature != null || it.humidity != null }
        EnvironmentCard(sensorDevice)

        ToolSectionHeader("继电器控制", "两路设备 · 实时开关", Coral)
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            relayTargets.forEach { target ->
                RelayCard(
                    target = target,
                    device = iot?.devices?.firstOrNull { it.id == target.deviceId },
                    mqttConnected = iot?.mqttConnected == true,
                    canOperate = canOperate,
                    busy = state.busyAction == "relay:${target.deviceId}:${target.relayId}",
                    onControlRelay = onControlRelay,
                )
            }
        }

        if (!iot?.scenes.isNullOrEmpty()) {
            ToolSectionHeader("快捷场景", "IoT 自动化", Color(0xFF7C3AED))
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                color = Color(0xFFFCFCFA),
                border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
                shadowElevation = 2.dp,
            ) {
                Column {
                    iot!!.scenes.forEachIndexed { index, scene ->
                        SceneRow(
                            scene = scene,
                            canOperate = canOperate,
                            busy = state.busyAction == "scene",
                            enabled = state.busyAction == null,
                            onRun = { confirmation = ToolConfirmation.Scene(scene) },
                        )
                        if (index < iot.scenes.lastIndex) {
                            HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = Color(0xFFF1F5F9))
                        }
                    }
                }
            }
        }

        ToolSectionHeader("CT8 自动化", "GitHub Actions 执行状态", Color(0xFF0EA5E9))
        Ct8Panel(
            ct8 = ct8,
            canOperate = canOperate,
            busy = state.busyAction == "ct8",
            enabled = state.busyAction == null,
            onTrigger = { confirmation = ToolConfirmation.Ct8 },
        )

        ToolSectionHeader("业务模块", "统一平台服务可用性", Color(0xFF64748B))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = Color(0xFFFCFCFA),
            border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
            shadowElevation = 2.dp,
        ) {
            Column {
                if (modules.isEmpty()) {
                    EmptyBlock("等待模块状态", "完成平台同步后显示")
                } else {
                    modules.forEachIndexed { index, service ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 13.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
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
                        if (index < modules.lastIndex) {
                            HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = Color(0xFFF1F5F9))
                        }
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
            onConfirm = {
                confirmation = null
                onTriggerCt8()
            },
        )
        is ToolConfirmation.Scene -> ToolConfirmDialog(
            title = "运行“${pending.scene.name}”？",
            detail = "场景包含 ${pending.scene.actionCount} 个设备动作，执行结果将写入 IoT 审计记录。",
            confirmLabel = "确认运行",
            onDismiss = { confirmation = null },
            onConfirm = {
                confirmation = null
                onRunScene(pending.scene.id)
            },
        )
        null -> Unit
    }
}

@Composable
private fun ToolSectionHeader(title: String, subtitle: String, accent: Color) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(accent, CircleShape),
        )
        Column {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MqttStatusPanel(
    mqttConnected: Boolean,
    connectionState: String,
    onlineDevices: Int,
    totalDevices: Int,
    messagesReceived: Long,
) {
    val online = mqttConnected
    val accent = if (online) Forest else Amber
    val accentPale = if (online) MintPale else AmberPale
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color(0xFFFCFCFA),
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
        shadowElevation = 2.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconTile(
                    if (online) Icons.Outlined.Router else Icons.Outlined.WifiOff,
                    accent,
                    accentPale,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (online) "MQTT 已连接" else "MQTT 状态异常",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        connectionState,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(if (online) "healthy" else "degraded")
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MetricPanel(
                    label = "在线设备",
                    value = onlineDevices.toString(),
                    modifier = Modifier.weight(1f),
                    color = Color(0xFF10B981),
                )
                MetricPanel(
                    label = "设备总数",
                    value = totalDevices.toString(),
                    modifier = Modifier.weight(1f),
                    color = Color(0xFF3B82F6),
                )
                MetricPanel(
                    label = "接收消息",
                    value = messagesReceived.toString(),
                    modifier = Modifier.weight(1f),
                    color = Color(0xFF8B5CF6),
                )
            }
        }
    }
}

@Composable
private fun MetricPanel(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(color, RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = Color.White.copy(alpha = 0.82f),
        )
        Text(
            value,
            style = MaterialTheme.typography.titleLarge.copy(
                fontWeight = FontWeight.Bold,
                color = Color.White,
            ),
        )
    }
}

@Composable
private fun EnvironmentCard(device: DeviceInfo?) {
    val online = device?.online == true
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color(0xFFFCFCFA),
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
        shadowElevation = 2.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconTile(
                    if (online) Icons.Outlined.Sensors else Icons.Outlined.WifiOff,
                    if (online) Ocean else Amber,
                    if (online) OceanPale else AmberPale,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "客厅环境",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        device?.name ?: "等待传感器数据",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(
                    if (online) "online" else "unknown",
                    if (online) "实时" else "等待数据",
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SensorMetric(
                    label = "温度",
                    value = device?.temperature?.let { "${"%.1f".format(it)}°C" } ?: "--",
                    icon = Icons.Outlined.Thermostat,
                    tint = Ocean,
                    background = OceanPale,
                    modifier = Modifier.weight(1f),
                )
                SensorMetric(
                    label = "湿度",
                    value = device?.humidity?.let { "${"%.0f".format(it)}%" } ?: "--",
                    icon = Icons.Outlined.WaterDrop,
                    tint = Forest,
                    background = MintPale,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun SensorMetric(
    label: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    background: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(background, RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = tint)
            Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            value,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = tint,
        )
    }
}

@Composable
private fun RelayCard(
    target: RelayTarget,
    device: DeviceInfo?,
    mqttConnected: Boolean,
    canOperate: Boolean,
    busy: Boolean,
    onControlRelay: (String, String, Boolean) -> Unit,
) {
    val status = device?.relays?.get(target.relayId)?.uppercase()
    val isKnown = status == "ON" || status == "OFF"
    val isOn = status == "ON"
    val available = device?.online == true && mqttConnected
    val switchEnabled = canOperate && available && isKnown && !busy
    val statusType: String
    val statusLabel: String
    val stateLabel: String
    val helper: String

    when {
        device == null -> {
            statusType = "unknown"
            statusLabel = "未发现"
            stateLabel = "等待设备"
            helper = "等待设备上线后同步状态"
        }
        !mqttConnected -> {
            statusType = "degraded"
            statusLabel = "连接异常"
            stateLabel = "暂不可控"
            helper = "MQTT 未连接，暂时无法发送指令"
        }
        !device.online -> {
            statusType = "offline"
            statusLabel = "离线"
            stateLabel = "暂不可控"
            helper = "设备离线，恢复在线后即可操作"
        }
        !isKnown -> {
            statusType = "unknown"
            statusLabel = "同步中"
            stateLabel = "状态同步中"
            helper = "正在等待继电器回报状态"
        }
        isOn -> {
            statusType = "online"
            statusLabel = "已开启"
            stateLabel = "已开启"
            helper = "通过 MQTT 实时控制"
        }
        else -> {
            statusType = "healthy"
            statusLabel = "已关闭"
            stateLabel = "已关闭"
            helper = "通过 MQTT 实时控制"
        }
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color(0xFFFCFCFA),
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.height(44.dp),
            ) {
                IconTile(
                    target.icon,
                    if (isOn) target.accent else Ocean,
                    if (isOn) target.accentPale else OceanPale,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        target.name,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        target.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = isOn,
                    onCheckedChange = if (switchEnabled) {
                        { enabled -> onControlRelay(target.deviceId, target.relayId, enabled) }
                    } else {
                        null
                    },
                    enabled = switchEnabled,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = target.accent,
                    ),
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.height(56.dp),
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        stateLabel,
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = if (isOn) target.accent else MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                    )
                    Box(modifier = Modifier.height(22.dp)) {
                        if (busy) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(12.dp),
                                    strokeWidth = 2.dp,
                                    color = target.accent,
                                )
                                Text(
                                    "指令发送中",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = target.accent,
                                    maxLines = 1,
                                )
                            }
                        } else {
                            Text(
                                helper,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
                StatusBadge(statusType, statusLabel)
            }
        }
    }
}

@Composable
private fun SceneRow(
    scene: IotScene,
    canOperate: Boolean,
    busy: Boolean,
    enabled: Boolean,
    onRun: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconTile(Icons.Outlined.AutoMode, Color(0xFF7C3AED), Color(0xFFEDE9FE))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                scene.name,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                "${scene.actionCount} 个动作 · ${formatPlatformTime(scene.updatedAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Button(
            onClick = onRun,
            enabled = canOperate && enabled,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF7C3AED)),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
        ) {
            if (busy) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
            } else {
                Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                Text("运行", modifier = Modifier.padding(start = 5.dp))
            }
        }
    }
}

@Composable
private fun Ct8Panel(
    ct8: Ct8Data?,
    canOperate: Boolean,
    busy: Boolean,
    enabled: Boolean,
    onTrigger: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color(0xFFFCFCFA),
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
        shadowElevation = 2.dp,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconTile(Icons.Outlined.AutoMode, Color(0xFF0EA5E9), Color(0xFFE0F2FE))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "最近任务 ${ct8?.latestRunId?.let { "#${it.takeLast(10)}" } ?: "--"}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        formatPlatformTime(ct8?.lastRunAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(ct8?.activeStatus?.takeIf { it != "idle" } ?: ct8?.latestStatus ?: "unknown")
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MetricCell("主机总数", ct8?.totalHosts?.toString() ?: "--", Modifier.weight(1f))
                MetricCell("成功", ct8?.successHosts?.toString() ?: "--", Modifier.weight(1f), Forest)
                MetricCell("失败", ct8?.failedHosts?.toString() ?: "--", Modifier.weight(1f), Amber)
            }
            Button(
                onClick = onTrigger,
                enabled = canOperate && enabled && ct8?.activeStatus !in setOf("running", "queued", "in_progress"),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0EA5E9)),
            ) {
                if (busy) {
                    CircularProgressIndicator(Modifier.size(17.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(19.dp))
                    Text("触发 CT8 任务", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
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
    AppConfirmDialog(
        title = title,
        detail = detail,
        confirmLabel = confirmLabel,
        onDismiss = onDismiss,
        onConfirm = onConfirm,
        icon = Icons.Outlined.AutoMode,
    )
}

private fun moduleIcon(id: String) = when (id) {
    "mqtt", "iot" -> Icons.Outlined.Router
    "campus" -> Icons.Outlined.CloudQueue
    "exam" -> Icons.Outlined.CheckCircle
    "core" -> Icons.Outlined.Memory
    else -> Icons.Outlined.Devices
}
