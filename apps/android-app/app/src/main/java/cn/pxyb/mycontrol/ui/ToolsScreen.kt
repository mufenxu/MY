package cn.pxyb.mycontrol.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.width
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
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.DeviceInfo
import cn.pxyb.mycontrol.data.DeviceTelemetryInsight
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.data.TelemetryMetricSummary
import cn.pxyb.mycontrol.data.TelemetrySeriesPoint
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.Forest
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
    val activeAccent: Color,
    val activeBgGradient: Pair<Color, Color>,
)

private val relayTargets = listOf(
    RelayTarget(
        deviceId = "esp8266_living",
        relayId = "relay1",
        name = "客厅主灯",
        description = "客厅主控节点 · 通道 1",
        icon = Icons.Outlined.Lightbulb,
        activeAccent = Color(0xFFD97706), // 暖金暖光
        activeBgGradient = Pair(Color(0xFFFFFBEB), Color(0xFFFEF3C7)),
    ),
    RelayTarget(
        deviceId = "relay_balcony",
        relayId = "relay2",
        name = "阳台智能插座",
        description = "阳台继电器 · 通道 2",
        icon = Icons.Outlined.PowerSettingsNew,
        activeAccent = Color(0xFF059669), // 极光绿
        activeBgGradient = Pair(Color(0xFFECFDF5), Color(0xFFD1FAE5)),
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

    LaunchedEffect(currentTab) {
        confirmation = null
    }

    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val iot = state.iot
    val ct8 = state.ct8
    val sensorDevices = iot?.devices.orEmpty().filter { it.temperature != null || it.humidity != null }
    var selectedSensorId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(sensorDevices.map(DeviceInfo::id)) {
        if (selectedSensorId !in sensorDevices.map(DeviceInfo::id)) {
            selectedSensorId = sensorDevices.firstOrNull()?.id
        }
    }

    val scrollState = rememberScrollState()
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { scrollState.value == 0 },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(appPageContentPadding(contentPadding, topSpacing = 4.dp)),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 1. 全新通透极简顶部标题（无黑色包覆块，无刷新按钮）
            LightweightHeaderBanner(
                mqttConnected = iot?.mqttConnected == true,
            )

            state.sectionError?.let { message ->
                FeedbackBanner("设备数据暂不可用：$message", error = true)
            }

            // 2. Bento Grid 核心 IoT 状态
            ToolSectionTitle(title = "IoT 实时状态", subtitle = "智控节点与全网数据吞吐", accent = Color(0xFF2563EB))
            ModernMqttStatusPanel(
                mqttConnected = iot?.mqttConnected == true,
                connectionState = iot?.connectionState ?: "等待 IoT 状态",
                onlineDevices = iot?.devices?.count { it.online } ?: 0,
                totalDevices = iot?.devices?.size ?: 0,
                messagesReceived = iot?.messagesReceived ?: 0,
            )

            // 3. 智能环境监测
            ToolSectionTitle(title = "环境感知", subtitle = "多维度室内环境指标", accent = Color(0xFF059669))
            if (sensorDevices.size > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    sensorDevices.forEach { device ->
                        FilterChip(
                            selected = selectedSensorId == device.id,
                            onClick = { selectedSensorId = device.id },
                            label = { Text(device.name, maxLines = 1) },
                        )
                    }
                }
            }
            val sensorDevice = sensorDevices.firstOrNull { it.id == selectedSensorId } ?: sensorDevices.firstOrNull()
            ModernEnvironmentCard(sensorDevice)
            val telemetryInsight = iot?.insights?.firstOrNull { it.deviceId == sensorDevice?.id }
            if (telemetryInsight != null) {
                TelemetryInsightPanel(telemetryInsight)
            } else if (sensorDevice != null && !state.refreshing) {
                TelemetryInsightUnavailable()
            }

            // 4. 智能继电器开关
            ToolSectionTitle(title = "设备与开关", subtitle = "低延迟 MQTT 实时触控", accent = Color(0xFFD97706))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                relayTargets.forEach { target ->
                    ModernRelayCard(
                        target = target,
                        device = iot?.devices?.firstOrNull { it.id == target.deviceId },
                        mqttConnected = iot?.mqttConnected == true,
                        canOperate = canOperate,
                        busy = state.busyAction == "relay:${target.deviceId}:${target.relayId}",
                        onControlRelay = onControlRelay,
                    )
                }
            }

            // 5. 快捷场景
            if (!iot?.scenes.isNullOrEmpty()) {
                ToolSectionTitle(title = "快捷自动化", subtitle = "一键触发预设联动场景", accent = Color(0xFF7C3AED))
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                    shadowElevation = 1.dp,
                ) {
                    Column {
                        iot!!.scenes.forEachIndexed { index, scene ->
                            ModernSceneRow(
                                scene = scene,
                                canOperate = canOperate,
                                busy = state.busyAction == "scene",
                                enabled = state.busyAction == null,
                                onRun = { confirmation = ToolConfirmation.Scene(scene) },
                            )
                            if (index < iot.scenes.lastIndex) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
                                )
                            }
                        }
                    }
                }
            }

            // 6. CT8 自动化
            ToolSectionTitle(title = "CT8 自动化执行", subtitle = "GitHub Actions 任务流水线", accent = Color(0xFF0284C7))
            ModernCt8Panel(
                ct8 = ct8,
                canOperate = canOperate,
                busy = state.busyAction == "ct8",
                enabled = state.busyAction == null,
                onTrigger = { confirmation = ToolConfirmation.Ct8 },
            )

            Spacer(Modifier.height(16.dp))
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
private fun TelemetryInsightPanel(insight: DeviceTelemetryInsight) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("24 小时环境趋势", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "${insight.sampleCount} 个真实采样 · ${insight.series.size} 个聚合时段",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(
                    status = when (insight.state) {
                        "healthy" -> "healthy"
                        "degraded" -> "warning"
                        else -> "offline"
                    },
                    label = when (insight.state) {
                        "healthy" -> "运行健康"
                        "degraded" -> "发现异常"
                        else -> "设备离线"
                    },
                )
            }
            TelemetryMetricChart(
                label = "温度",
                summary = insight.temperature,
                points = insight.series,
                value = TelemetrySeriesPoint::temperature,
                suffix = "°C",
                color = Color(0xFFF97316),
            )
            TelemetryMetricChart(
                label = "湿度",
                summary = insight.humidity,
                points = insight.series,
                value = TelemetrySeriesPoint::humidity,
                suffix = "%",
                color = Color(0xFF0284C7),
            )
            Text(
                if (insight.anomalyCount == 0) "当前范围未发现明显异常" else "检测到 ${insight.anomalyCount} 个异常采样，请结合设备状态检查。",
                style = MaterialTheme.typography.bodySmall,
                color = if (insight.anomalyCount == 0) Forest else Amber,
            )
        }
    }
}

@Composable
private fun TelemetryMetricChart(
    label: String,
    summary: TelemetryMetricSummary,
    points: List<TelemetrySeriesPoint>,
    value: (TelemetrySeriesPoint) -> Double?,
    suffix: String,
    color: Color,
) {
    val values = points.mapNotNull(value)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(
                summary.average?.let { "均值 %.1f%s".format(it, suffix) } ?: "暂无有效采样",
                style = MaterialTheme.typography.labelMedium,
                color = color,
                fontWeight = FontWeight.Bold,
            )
        }
        if (values.size < 2) {
            Text("当前时段数据不足，暂时无法生成曲线。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            TelemetrySparkline(values, color)
            Text(
                "最低 %.1f%s · 最高 %.1f%s".format(summary.minimum ?: values.min(), suffix, summary.maximum ?: values.max(), suffix),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TelemetrySparkline(values: List<Double>, color: Color) {
    val gridColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)
    Canvas(Modifier.fillMaxWidth().height(76.dp)) {
        val minimum = values.min()
        val maximum = values.max()
        val span = (maximum - minimum).takeIf { it > 0.0001 } ?: 1.0
        val step = size.width / (values.size - 1).coerceAtLeast(1)
        val path = Path()
        values.forEachIndexed { index, sample ->
            val x = index * step
            val y = size.height - ((sample - minimum) / span * size.height).toFloat()
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawLine(
            color = gridColor,
            start = androidx.compose.ui.geometry.Offset(0f, size.height),
            end = androidx.compose.ui.geometry.Offset(size.width, size.height),
            strokeWidth = 1.dp.toPx(),
        )
        drawPath(path = path, color = color, style = Stroke(width = 2.5.dp.toPx()))
    }
}

@Composable
private fun TelemetryInsightUnavailable() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Text(
            "历史趋势暂不可用；实时温湿度与设备控制不受影响。",
            modifier = Modifier.padding(14.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ------------------------------------------------------------------------------------------------
// 清新通透现代化组件
// ------------------------------------------------------------------------------------------------

/** 极简通透 Header Banner (根据用户反馈：无黑色卡片背景，无刷新按钮) */
@Composable
private fun LightweightHeaderBanner(
    mqttConnected: Boolean,
) {
    val dotAlpha = if (mqttConnected) {
        val infiniteTransition = rememberInfiniteTransition(label = "pulse")
        val alphaPulse by infiniteTransition.animateFloat(
            initialValue = 0.4f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(1200, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "pulse-alpha",
        )
        alphaPulse
    } else {
        1f
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // 清爽小胶囊 Badge
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (mqttConnected) Color(0xFFECFDF5) else Color(0xFFFEF2F2),
            border = BorderStroke(0.5.dp, if (mqttConnected) Color(0xFFA7F3D0) else Color(0xFFFECACA)),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .graphicsLayer { alpha = dotAlpha }
                        .background(
                            color = if (mqttConnected) Color(0xFF10B981) else Color(0xFFEF4444),
                            shape = CircleShape,
                        )
                )
                Text(
                    text = if (mqttConnected) "LIVE · 智控中心" else "OFFLINE · 离线模式",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp,
                    ),
                    color = if (mqttConnected) Color(0xFF047857) else Color(0xFFB91C1C),
                )
            }
        }

        // 清爽优雅大标题
        Text(
            text = "设备与自动化",
            style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onBackground,
            ),
        )
    }
}

/** 分组标题 */
@Composable
private fun ToolSectionTitle(title: String, subtitle: String, accent: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(18.dp)
                .background(accent, RoundedCornerShape(2.dp))
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

/** Bento Grid IoT 状态面板 (清爽马卡龙配色) */
@Composable
private fun ModernMqttStatusPanel(
    mqttConnected: Boolean,
    connectionState: String,
    onlineDevices: Int,
    totalDevices: Int,
    messagesReceived: Long,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 通道 Status Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconTile(
                    if (mqttConnected) Icons.Outlined.Router else Icons.Outlined.WifiOff,
                    if (mqttConnected) Forest else Amber,
                    if (mqttConnected) MintPale else AmberPale,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        if (mqttConnected) "MQTT 消息总线 (已连接)" else "MQTT 异常断开",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        connectionState,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(if (mqttConnected) "healthy" else "degraded")
            }

            // Bento 三格指标 (清爽极浅彩底 + 亮色加粗数字)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                LightBentoMetricCard(
                    label = "在线设备",
                    value = onlineDevices.toString(),
                    subText = "正常运行",
                    valueColor = Color(0xFF047857),
                    bgColor = Color(0xFFECFDF5),
                    borderColor = Color(0xFFA7F3D0),
                    modifier = Modifier.weight(1f),
                )
                LightBentoMetricCard(
                    label = "设备总数",
                    value = totalDevices.toString(),
                    subText = "全网注册",
                    valueColor = Color(0xFF1D4ED8),
                    bgColor = Color(0xFFEFF6FF),
                    borderColor = Color(0xFFBFDBFE),
                    modifier = Modifier.weight(1f),
                )
                LightBentoMetricCard(
                    label = "接收消息",
                    value = if (messagesReceived > 9999) "${messagesReceived / 1000}k" else messagesReceived.toString(),
                    subText = "数据包",
                    valueColor = Color(0xFF6D28D9),
                    bgColor = Color(0xFFF5F3FF),
                    borderColor = Color(0xFFDDD6FE),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** 清新 Light Bento 卡片 */
@Composable
private fun LightBentoMetricCard(
    label: String,
    value: String,
    subText: String,
    valueColor: Color,
    bgColor: Color,
    borderColor: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = bgColor,
        border = BorderStroke(0.5.dp, borderColor),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelMedium.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium,
                ),
            )
            Text(
                value,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = valueColor,
                    fontSize = 22.sp,
                ),
            )
            Text(
                subText,
                style = MaterialTheme.typography.labelSmall.copy(
                    color = valueColor.copy(alpha = 0.8f),
                    fontSize = 10.sp,
                ),
            )
        }
    }
}

/** 环境监测卡片 */
@Composable
private fun ModernEnvironmentCard(device: DeviceInfo?) {
    val online = device?.online == true
    val temp = device?.temperature
    val tempStr = temp?.let { "%.1f".format(it) } ?: "--"
    val hum = device?.humidity
    val humStr = hum?.let { "%.0f".format(it) } ?: "--"

    val comfortLabel = when {
        temp == null -> "温湿度传感器"
        temp in 18.0..26.0 -> "环境宜人 · 舒适度极佳 🌿"
        temp < 18.0 -> "环境偏冷 · 适度保暖 ❄️"
        else -> "环境偏热 · 注意降温 ☀️"
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
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
                        "客厅环境监测",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        comfortLabel,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        color = if (online) Forest else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusBadge(
                    if (online) "online" else "unknown",
                    if (online) "实时连线" else "未同步",
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ModernSensorCell(
                    label = "室内温度",
                    value = if (tempStr != "--") "$tempStr°C" else "--",
                    icon = Icons.Outlined.Thermostat,
                    accentColor = Color(0xFF0284C7),
                    bgColor = Color(0xFFF0F9FF),
                    modifier = Modifier.weight(1f),
                )
                ModernSensorCell(
                    label = "相对湿度",
                    value = if (humStr != "--") "$humStr%" else "--",
                    icon = Icons.Outlined.WaterDrop,
                    accentColor = Color(0xFF059669),
                    bgColor = Color(0xFFECFDF5),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ModernSensorCell(
    label: String,
    value: String,
    icon: ImageVector,
    accentColor: Color,
    bgColor: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = bgColor,
        border = BorderStroke(0.5.dp, accentColor.copy(alpha = 0.2f)),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .background(accentColor.copy(alpha = 0.12f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = accentColor, modifier = Modifier.size(20.dp))
            }
            Column {
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    value,
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        color = accentColor,
                    ),
                )
            }
        }
    }
}

/** 继电器控制卡片 (清爽通透) */
@Composable
private fun ModernRelayCard(
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

    val interactionSource = remember { MutableInteractionSource() }

    val targetBg = if (isOn) target.activeBgGradient.first else MaterialTheme.colorScheme.surface
    val animatedBg by animateColorAsState(
        targetValue = targetBg,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "relay-bg",
    )

    val targetBorder = if (isOn) target.activeAccent.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
    val animatedBorder by animateColorAsState(
        targetValue = targetBorder,
        animationSpec = tween(300, easing = FastOutSlowInEasing),
        label = "relay-border",
    )

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .pressFeedback(interactionSource)
            .clickable(enabled = switchEnabled) {
                onControlRelay(target.deviceId, target.relayId, !isOn)
            },
        shape = RoundedCornerShape(24.dp),
        color = animatedBg,
        border = BorderStroke(1.dp, animatedBorder),
        shadowElevation = if (isOn) 2.dp else 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .background(
                            color = if (isOn) target.activeAccent else MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(14.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = target.icon,
                        contentDescription = null,
                        tint = if (isOn) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp),
                    )
                }

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
                    } else null,
                    enabled = switchEnabled,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = target.activeAccent,
                    ),
                )
            }

            HorizontalDivider(color = animatedBorder.copy(alpha = 0.3f))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(
                                color = if (isOn) target.activeAccent else Color.Gray,
                                shape = CircleShape,
                            )
                    )
                    Text(
                        text = if (isOn) "已开启 (ON)" else "已关闭 (OFF)",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = if (isOn) target.activeAccent else MaterialTheme.colorScheme.onSurface,
                    )
                }

                if (busy) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(14.dp),
                            strokeWidth = 2.dp,
                            color = target.activeAccent,
                        )
                        Text(
                            "发送中...",
                            style = MaterialTheme.typography.labelSmall,
                            color = target.activeAccent,
                        )
                    }
                } else {
                    StatusBadge(
                        status = if (isOn) "online" else "healthy",
                        label = if (isOn) "工作中" else "待命",
                    )
                }
            }
        }
    }
}

/** 快捷场景行 */
@Composable
private fun ModernSceneRow(
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
                "${scene.actionCount} 个设备动作联动 · ${formatPlatformTime(scene.updatedAt)}",
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
                Text("触发场景", modifier = Modifier.padding(start = 5.dp), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** CT8 自动化面板 */
@Composable
private fun ModernCt8Panel(
    ct8: Ct8Data?,
    canOperate: Boolean,
    busy: Boolean,
    enabled: Boolean,
    onTrigger: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                IconTile(Icons.Outlined.AutoMode, Color(0xFF0284C7), Color(0xFFE0F2FE))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "流水线 ${ct8?.latestRunId?.let { "#${it.takeLast(8)}" } ?: "--"}",
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
                MetricCell("目标主机", ct8?.totalHosts?.toString() ?: "--", Modifier.weight(1f))
                MetricCell("成功节点", ct8?.successHosts?.toString() ?: "--", Modifier.weight(1f), Forest)
                MetricCell("异常节点", ct8?.failedHosts?.toString() ?: "--", Modifier.weight(1f), Amber)
            }

            Button(
                onClick = onTrigger,
                enabled = canOperate && enabled && ct8?.activeStatus !in setOf("running", "queued", "in_progress"),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                contentPadding = PaddingValues(vertical = 10.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(Icons.Outlined.PlayArrow, contentDescription = null, modifier = Modifier.size(19.dp))
                    Text("立即触发 GitHub Actions 任务", modifier = Modifier.padding(start = 8.dp), style = MaterialTheme.typography.titleSmall)
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
