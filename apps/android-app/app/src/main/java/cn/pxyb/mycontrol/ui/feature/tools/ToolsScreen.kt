package cn.pxyb.mycontrol.ui.feature.tools

import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoMode
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.PowerSettingsNew
import androidx.compose.material.icons.outlined.Router
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Thermostat
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.DeviceInfo
import cn.pxyb.mycontrol.data.DeviceTelemetryInsight
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.data.TelemetryMetricSummary
import cn.pxyb.mycontrol.data.TelemetrySeriesPoint
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppNotificationButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.PullToRefresh
import cn.pxyb.mycontrol.ui.components.layout.appPageContentPadding
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.components.layout.glassPanel
import cn.pxyb.mycontrol.ui.components.layout.rememberGlassPalette
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.blocksAction
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import cn.pxyb.mycontrol.util.DateTimeUtils.formatPlatformTime

private data class RelayTarget(
    val deviceId: String,
    val relayId: String,
    val name: String,
    val description: String,
    val icon: ImageVector,
    val activeAccent: Color,
    val activeBgGradient: Pair<Color, Color>,
)

@Composable
private fun relayTargets() = listOf(
    RelayTarget(
        deviceId = "esp8266_living",
        relayId = "relay1",
        name = "客厅主灯",
        description = "客厅主控节点 · 通道 1",
        icon = Icons.Outlined.Lightbulb,
        activeAccent = ColorTokens.Amber.foreground, // 暖金暖光
        activeBgGradient = Pair(ColorTokens.Amber.container, ColorTokens.Amber.container),
    ),
    RelayTarget(
        deviceId = "relay_balcony",
        relayId = "relay2",
        name = "阳台智能插座",
        description = "阳台继电器 · 通道 2",
        icon = Icons.Outlined.PowerSettingsNew,
        activeAccent = ColorTokens.Green.foreground, // 极光绿
        activeBgGradient = Pair(ColorTokens.Green.container, ColorTokens.Green.container),
    ),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ToolsScreen(
    state: ToolsUiState,
    contentPadding: PaddingValues,
    currentTab: MainTab,
    onRunScene: (String) -> Unit,
    onControlRelay: (String, String, Boolean) -> Unit,
    onRefresh: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenScenes: () -> Unit,
) {
    var confirmation by remember { mutableStateOf<IotScene?>(null) }
    var showConnectionDetails by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(currentTab) { confirmation = null }
    val targets = relayTargets()
    val canOperate = state.user?.role in setOf("operator", "super_admin")
    val iot = state.iot
    val sensorDevices = remember(iot?.devices) {
        iot?.devices.orEmpty().filter { it.temperature != null || it.humidity != null }
    }
    var selectedSensorId by rememberSaveable { mutableStateOf<String?>(null) }
    val sensorDevice = sensorDevices.firstOrNull { it.id == selectedSensorId } ?: sensorDevices.firstOrNull()
    val telemetryInsight = iot?.insights?.firstOrNull { it.deviceId == sensorDevice?.id }
    val isTablet = useTwoPaneLayout()
    val listState = rememberLazyListState()
    val dark = isAppInDarkTheme()
    val controls: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ToolSectionTitle("设备与开关", "常用灯光与插座", ColorTokens.Amber.foreground)
            targets.forEach { target ->
                ModernRelayCard(
                    target = target,
                    device = iot?.devices?.firstOrNull { it.id == target.deviceId },
                    mqttConnected = iot?.mqttConnected == true,
                    canOperate = canOperate,
                    busy = "relay:${target.deviceId}:${target.relayId}" in state.busyActions,
                    enabled = !state.busyActions.blocksAction("relay:${target.deviceId}:${target.relayId}"),
                    onControlRelay = onControlRelay,
                )
            }
            AppPanel {
                AppActionRow(
                    title = "场景与自动化",
                    subtitle = "管理场景、条件规则与执行记录",
                    icon = Icons.Outlined.AutoMode,
                    onClick = onOpenScenes,
                )
                iot?.scenes.orEmpty().take(3).forEach { scene ->
                    AppDivider()
                    ModernSceneRow(
                        scene = scene,
                        canOperate = canOperate,
                        busy = "scene" in state.busyActions,
                        enabled = !state.busyActions.blocksAction("scene"),
                        onRun = { confirmation = scene },
                    )
                }
            }
        }
    }
    val environment: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ToolSectionTitle("环境感知", "室内温湿度与变化趋势", ColorTokens.Green.foreground)
            if (sensorDevices.size > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    sensorDevices.forEach { device ->
                        AppFilterChip(
                            label = device.name,
                            selected = sensorDevice?.id == device.id,
                            onClick = { selectedSensorId = device.id },
                        )
                    }
                }
            }
            ModernEnvironmentCard(sensorDevice)
            if (telemetryInsight != null) {
                TelemetryInsightPanel(telemetryInsight)
            } else if (sensorDevice != null && !state.refreshing) {
                TelemetryInsightUnavailable()
            }
            AppPanel {
                AppActionRow(
                    title = "连接详情",
                    subtitle = if (showConnectionDetails) "收起连接状态与消息统计" else "查看连接状态与消息统计",
                    icon = Icons.Outlined.Router,
                    onClick = { showConnectionDetails = !showConnectionDetails },
                )
            }
            if (showConnectionDetails) {
                ModernMqttStatusPanel(
                    mqttConnected = iot?.mqttConnected == true,
                    connectionState = iot?.connectionState ?: "等待设备状态",
                    onlineDevices = iot?.devices?.count { it.online } ?: 0,
                    totalDevices = iot?.devices?.size ?: 0,
                    messagesReceived = iot?.messagesReceived ?: 0,
                )
            }
        }
    }
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().auroraBackdrop(dark),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "tools-header") {
                LightweightHeaderBanner(iot?.mqttConnected == true, state.unreadAlerts, onOpenNotifications)
            }
            item(key = "connection-summary") {
                AppPanel {
                    AppActionRow(
                        title = if (iot == null) "正在读取设备状态" else "${iot.devices.count { it.online }} / ${iot.devices.size} 台设备在线",
                        subtitle = if (iot?.mqttConnected == true) "设备控制已连接" else "设备控制暂未连接",
                        icon = Icons.Outlined.Router,
                        trailingContent = null,
                    )
                }
            }
            state.sectionError?.let { message ->
                item(key = "tools-error") { AppFeedbackBanner("设备数据暂不可用：$message", error = true, onRetry = onRefresh) }
            }
            item(key = "device-columns") {
                FlowRow(
                    maxItemsInEachRow = if (isTablet) 2 else 1,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) { controls() }
                    Column(Modifier.weight(1f)) { environment() }
                }
            }
        }
    }
    confirmation?.let { scene ->
        ToolConfirmDialog(
            title = "运行“${scene.name}”？",
            detail = "场景包含 ${scene.actionCount} 个设备动作，执行结果将写入记录。",
            confirmLabel = "确认运行",
            onDismiss = { confirmation = null },
            onConfirm = { confirmation = null; onRunScene(scene.id) },
        )
    }
}

@Composable
private fun TelemetryInsightPanel(insight: DeviceTelemetryInsight) {
    val temperatureValues = remember(insight.series) {
        insight.series.mapNotNull(TelemetrySeriesPoint::temperature)
    }
    val humidityValues = remember(insight.series) {
        insight.series.mapNotNull(TelemetrySeriesPoint::humidity)
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 0.dp,
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("24 小时环境趋势", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "${insight.sampleCount} 个真实采样 · ${insight.series.size} 个聚合时段",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppStatusBadge(
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
                values = temperatureValues,
                suffix = "°C",
                color = ColorTokens.Orange.foreground,
            )
            TelemetryMetricChart(
                label = "湿度",
                summary = insight.humidity,
                values = humidityValues,
                suffix = "%",
                color = ColorTokens.Sky.foreground,
            )
            Text(
                if (insight.anomalyCount == 0) "当前范围未发现明显异常" else "检测到 ${insight.anomalyCount} 个异常采样，请结合设备状态检查。",
                style = MaterialTheme.typography.bodySmall,
                color = if (insight.anomalyCount == 0) ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
            )
        }
    }
}

@Composable
private fun TelemetryMetricChart(
    label: String,
    summary: TelemetryMetricSummary,
    values: List<Double>,
    suffix: String,
    color: Color,
) {
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
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(76.dp)
            .drawWithCache {
                val minimum = values.minOrNull() ?: 0.0
                val maximum = values.maxOrNull() ?: minimum
                val span = (maximum - minimum).takeIf { it > 0.0001 } ?: 1.0
                val step = size.width / (values.size - 1).coerceAtLeast(1)
                val path = Path()
                values.forEachIndexed { index, sample ->
                    val x = index * step
                    val y = size.height - ((sample - minimum) / span * size.height).toFloat()
                    if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }
                val strokeWidth = 2.5.dp.toPx()
                val baselineWidth = 1.dp.toPx()
                onDrawBehind {
                    drawLine(
                        color = gridColor,
                        start = androidx.compose.ui.geometry.Offset(0f, size.height),
                        end = androidx.compose.ui.geometry.Offset(size.width, size.height),
                        strokeWidth = baselineWidth,
                    )
                    drawPath(path = path, color = color, style = Stroke(width = strokeWidth))
                }
            },
    )
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

/** 玻璃 Header Banner（与「我的」页一致） */
@Composable
private fun LightweightHeaderBanner(
    mqttConnected: Boolean,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
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

    val isDark = isAppInDarkTheme()
    val glass = rememberGlassPalette(radius = 22.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "设备与自动化",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 21.sp,
                            letterSpacing = (-0.3).sp,
                            color = MaterialTheme.colorScheme.onBackground,
                        ),
                    )
                    Surface(
                        shape = CircleShape,
                        color = if (mqttConnected) {
                            if (isDark) ColorTokens.GreenDark.container.copy(alpha = 0.5f) else ColorTokens.Green.container.copy(alpha = 0.85f)
                        } else {
                            if (isDark) ColorTokens.RedDark.container.copy(alpha = 0.5f) else ColorTokens.Red.container.copy(alpha = 0.85f)
                        },
                        border = BorderStroke(
                            0.6.dp,
                            if (mqttConnected) {
                                if (isDark) ColorTokens.GreenDark.border else ColorTokens.Green.border
                            } else {
                                if (isDark) ColorTokens.RedDark.border else ColorTokens.Red.border
                            },
                        ),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .graphicsLayer { alpha = dotAlpha }
                                    .background(
                                        color = if (mqttConnected) ColorTokens.Green.foreground else ColorTokens.Red.foreground,
                                        shape = CircleShape,
                                    ),
                            )
                            Text(
                                text = if (mqttConnected) "LIVE · 智控" else "OFFLINE",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (mqttConnected) ColorTokens.Green.foreground else ColorTokens.Red.foreground,
                                ),
                            )
                        }
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(if (mqttConnected) ColorTokens.Green.foreground else ColorTokens.Red.foreground, CircleShape),
                    )
                    Text(
                        text = if (mqttConnected) "连接正常 · IoT 场景自动化联动" else "离线模式 · 等待网关连接恢复",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            AppNotificationButton(
                unreadCount = unreadCount,
                onClick = onOpenNotifications,
                shape = CircleShape,
            )
        }
    }
}

/** 分组标题：灵动微岛毛玻璃浮标 (Dynamic Floating Island Pill) */
@Composable
private fun ToolSectionTitle(
    title: String,
    subtitle: String,
    accent: Color,
    trailing: (@Composable () -> Unit)? = null,
) {
    AppSectionHeader(
        title = title,
        subtitle = subtitle,
        accent = accent,
        trailing = trailing,
    )
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
        shape = RoundedCornerShape(18.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 通道 Status Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppIconTile(
                    if (mqttConnected) Icons.Outlined.Router else Icons.Outlined.WifiOff,
                    if (mqttConnected) ColorTokens.Green.foreground else ColorTokens.Amber.foreground,
                    if (mqttConnected) ColorTokens.Green.container else ColorTokens.Amber.container,
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
                AppStatusBadge(if (mqttConnected) "healthy" else "degraded")
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
                    valueColor = ColorTokens.Green.foreground,
                    bgColor = ColorTokens.Green.container,
                    borderColor = ColorTokens.Green.border,
                    modifier = Modifier.weight(1f),
                )
                LightBentoMetricCard(
                    label = "设备总数",
                    value = totalDevices.toString(),
                    subText = "全网注册",
                    valueColor = ColorTokens.Blue.foreground,
                    bgColor = ColorTokens.Blue.container,
                    borderColor = ColorTokens.Blue.border,
                    modifier = Modifier.weight(1f),
                )
                LightBentoMetricCard(
                    label = "接收消息",
                    value = if (messagesReceived > 9999) "${messagesReceived / 1000}k" else messagesReceived.toString(),
                    subText = "数据包",
                    valueColor = ColorTokens.Purple.foreground,
                    bgColor = ColorTokens.Purple.container,
                    borderColor = ColorTokens.Purple.border,
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
        color = bgColor.copy(alpha = 0.55f),
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
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppIconTile(
                    if (online) Icons.Outlined.Sensors else Icons.Outlined.WifiOff,
                    if (online) ColorTokens.Blue.foreground else ColorTokens.Amber.foreground,
                    if (online) ColorTokens.Blue.container else ColorTokens.Amber.container,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "客厅环境监测",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        comfortLabel,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                        color = if (online) ColorTokens.Green.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppStatusBadge(
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
                    accentColor = ColorTokens.Sky.foreground,
                    bgColor = ColorTokens.Sky.container,
                    modifier = Modifier.weight(1f),
                )
                ModernSensorCell(
                    label = "相对湿度",
                    value = if (humStr != "--") "$humStr%" else "--",
                    icon = Icons.Outlined.WaterDrop,
                    accentColor = ColorTokens.Green.foreground,
                    bgColor = ColorTokens.Green.container,
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
        color = bgColor.copy(alpha = 0.55f),
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
    enabled: Boolean,
    onControlRelay: (String, String, Boolean) -> Unit,
) {
    val status = device?.relays?.get(target.relayId)?.uppercase()
    val isKnown = status == "ON" || status == "OFF"
    val isOn = status == "ON"
    val available = device?.online == true && mqttConnected
    val switchEnabled = enabled && canOperate && available && isKnown && !busy

    val interactionSource = remember { MutableInteractionSource() }

    val targetBg = if (isOn) target.activeBgGradient.first.copy(alpha = 0.55f) else glassCardColor()
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
        shadowElevation = 0.dp,
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
                            color = if (isOn) target.activeAccent else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            shape = RoundedCornerShape(14.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = target.icon,
                        contentDescription = null,
                        tint = if (isOn) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
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

                AppSwitch(
                    checked = isOn,
                    onCheckedChange = if (switchEnabled) {
                        { enabled -> onControlRelay(target.deviceId, target.relayId, enabled) }
                    } else null,
                    enabled = switchEnabled,
                    tint = target.activeAccent,
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
                                color = if (isOn) target.activeAccent else MaterialTheme.colorScheme.onSurfaceVariant,
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
                    AppStatusBadge(
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
        AppIconTile(Icons.Outlined.AutoMode, ColorTokens.Purple.foreground, ColorTokens.Purple.container)
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
        AppButton(
            text = "触发场景",
            icon = Icons.Outlined.PlayArrow,
            onClick = onRun,
            enabled = canOperate && enabled,
            loading = busy,
        )
    }
}

/** CT8 自动化面板 */
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
