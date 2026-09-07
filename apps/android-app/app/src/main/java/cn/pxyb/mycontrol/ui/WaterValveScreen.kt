package cn.pxyb.mycontrol.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DragHandle
import androidx.compose.material.icons.outlined.Opacity
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.data.CampusWaterBill
import cn.pxyb.mycontrol.data.CampusWaterValveDevice
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import java.time.YearMonth
import kotlin.math.abs

private enum class WaterValveAction { Open, Close }

@Composable
fun WaterValveScreen(
    state: WaterValveUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: (Boolean) -> Unit,
    onBind: (String) -> Unit,
    onOpen: (String) -> Unit,
    onClose: (String) -> Unit,
    onUnbind: (String) -> Unit,
    onReorder: (List<String>) -> Unit,
    onQueryBill: (String, Boolean) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var scannerOpen by remember { mutableStateOf(false) }
    var pendingAction by remember { mutableStateOf<Pair<WaterValveAction, CampusWaterValveDevice>?>(null) }
    var pendingDelete by remember { mutableStateOf<CampusWaterValveDevice?>(null) }
    var billMonth by remember { mutableStateOf(YearMonth.now()) }
    val listState = rememberLazyListState()
    var devices by remember { mutableStateOf(state.valve.devices) }
    var draggingKey by remember { mutableStateOf<Any?>(null) }
    var draggingOffset by remember { mutableStateOf(0f) }
    val currentOnReorder by rememberUpdatedState(onReorder)

    LaunchedEffect(Unit) {
        onRefresh(true)
    }
    LaunchedEffect(billMonth) {
        onQueryBill(billMonth.toString(), true)
    }
    LaunchedEffect(state.valve.devices) {
        if (draggingKey == null) devices = state.valve.devices
    }

    fun moveDevice(fromKey: Any, toKey: Any) {
        val fromIndex = devices.indexOfFirst { device -> "water-valve-device-${device.seqNo}" == fromKey }
        val toIndex = devices.indexOfFirst { device -> "water-valve-device-${device.seqNo}" == toKey }
        if (fromIndex < 0 || toIndex < 0 || fromIndex == toIndex) return
        devices = devices.toMutableList().apply { add(toIndex, removeAt(fromIndex)) }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AppSubPage(
            title = "饮水机控制",
            subtitle = "多设备开关 · 用水账单",
            onBack = onBack,
            contentPadding = contentPadding,
            refreshing = state.refreshing,
            onRefresh = { onRefresh(true) },
            listState = listState,
            actions = {
                AppHeaderIconButton(
                    icon = Icons.Outlined.Refresh,
                    contentDescription = "刷新饮水机状态",
                    onClick = { onRefresh(true) },
                    enabled = !state.refreshing,
                    loading = state.refreshing,
                )
                AppHeaderIconButton(
                    icon = Icons.Outlined.QrCodeScanner,
                    contentDescription = "扫码绑定饮水机",
                    onClick = {
                        onClearFeedback()
                        scannerOpen = true
                    },
                    enabled = !state.busy,
                )
            },
        ) {
            if (state.error != null) {
                item(key = "water-valve-error", contentType = "banner") {
                    FeedbackBanner(
                        message = state.error,
                        error = true,
                        onRetry = { onRefresh(true) },
                    )
                }
            }
            if (state.message != null) {
                item(key = "water-valve-message", contentType = "banner") {
                    FeedbackBanner(message = state.message, error = false)
                }
            }

            if (state.refreshing && devices.isEmpty()) {
                item(key = "water-valve-loading", contentType = "loading") {
                    GlassShimmerList(itemCount = 2, itemHeight = 168.dp)
                }
            } else if (devices.isEmpty()) {
                item(key = "water-valve-empty", contentType = "empty") {
                    AppEmptyState(
                        title = "尚未绑定饮水机",
                        detail = "扫描饮水机机身二维码，可绑定多台设备并远程开关阀门。",
                        icon = Icons.Outlined.WaterDrop,
                        actionText = "扫码绑定",
                        onAction = {
                            onClearFeedback()
                            scannerOpen = true
                        },
                    )
                }
            } else {
                items(
                    items = devices,
                    key = { device -> "water-valve-device-${device.seqNo}" },
                    contentType = { "water-valve-device" },
                ) { device ->
                    Box(
                        modifier = Modifier.fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        val itemKey = "water-valve-device-${device.seqNo}"
                        val dragging = draggingKey == itemKey
                        val dragModifier = if (dragging) {
                            Modifier.graphicsLayer {
                                translationY = draggingOffset
                                scaleX = 1.02f
                                scaleY = 1.02f
                            }
                        } else {
                            Modifier
                        }
                        WaterValveDeviceCard(
                            device = device,
                            busy = state.busy,
                            dragging = dragging,
                            modifier = dragModifier.pointerInput(device.seqNo) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { offset ->
                                        val visibleItems = listState.layoutInfo.visibleItemsInfo
                                        val current = visibleItems.firstOrNull { info ->
                                            offset.y >= 0f && offset.y <= info.size.toFloat() && info.key == itemKey
                                        } ?: return@detectDragGesturesAfterLongPress
                                        draggingKey = current.key
                                        draggingOffset = 0f
                                    },
                                    onDrag = { change, dragAmount ->
                                        change.consume()
                                        draggingOffset += dragAmount.y
                                        val visibleItems = listState.layoutInfo.visibleItemsInfo
                                        val currentInfo = visibleItems.firstOrNull { it.key == draggingKey } ?: return@detectDragGesturesAfterLongPress
                                        val draggedCenter = currentInfo.offset + currentInfo.size / 2f + draggingOffset
                                        val targetInfo = visibleItems
                                            .filter { it.key != draggingKey }
                                            .minByOrNull { info -> abs(draggedCenter - (info.offset + info.size / 2f)) }
                                            ?: return@detectDragGesturesAfterLongPress
                                        if (abs(draggedCenter - (targetInfo.offset + targetInfo.size / 2f)) < targetInfo.size * 0.62f) {
                                            moveDevice(draggingKey ?: return@detectDragGesturesAfterLongPress, targetInfo.key)
                                            draggingOffset = 0f
                                        }
                                    },
                                    onDragEnd = {
                                        val seqNos = devices.mapNotNull { it.seqNo }
                                        val originalSeqNos = state.valve.devices.mapNotNull { it.seqNo }
                                        if (seqNos != originalSeqNos) currentOnReorder(seqNos)
                                        draggingKey = null
                                        draggingOffset = 0f
                                    },
                                    onDragCancel = {
                                        draggingKey = null
                                        draggingOffset = 0f
                                    },
                                )
                            },
                            onToggle = { wanted ->
                                pendingAction = if (wanted) WaterValveAction.Open to device else WaterValveAction.Close to device
                                onClearFeedback()
                            },
                            onDelete = {
                                pendingDelete = device
                                onClearFeedback()
                            },
                        )
                    }
                }
            }

            item(key = "water-valve-bill", contentType = "bill") {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    WaterValveBillCard(
                        bill = state.bill,
                        loading = state.billLoading,
                        month = billMonth,
                        onPreviousMonth = { billMonth = billMonth.minusMonths(1) },
                        onNextMonth = { billMonth = billMonth.plusMonths(1) },
                        onRetry = { onQueryBill(billMonth.toString(), true) },
                    )
                }
            }
        }

        if (scannerOpen) {
            WaterValveScannerOverlay(
                onCodeDetected = { rawCode ->
                    scannerOpen = false
                    onClearFeedback()
                    onBind(rawCode)
                },
                onClose = { scannerOpen = false },
            )
        }

        pendingAction?.let { (action, device) ->
            AppDialogForm(
                title = if (action == WaterValveAction.Open) "开启饮水机" else "关闭饮水机",
                subtitle = if (action == WaterValveAction.Open) {
                    "开启后将立即出水，请确认饮水机旁有人照看。"
                } else {
                    "关闭后会结束本次用水，请确认现场可以安全关阀。"
                },
                icon = if (action == WaterValveAction.Open) Icons.Outlined.PlayArrow else Icons.Outlined.Stop,
                onDismissRequest = {
                    pendingAction = null
                    onClearFeedback()
                },
                onConfirm = {
                    val seqNo = device.seqNo.orEmpty()
                    pendingAction = null
                    onClearFeedback()
                    if (action == WaterValveAction.Open) onOpen(seqNo) else onClose(seqNo)
                },
                confirmText = if (action == WaterValveAction.Open) "开启" else "关闭",
                cancelText = "取消",
                danger = action == WaterValveAction.Close,
            ) {
                Text(
                    text = "设备：${device.deviceName.orEmpty().ifBlank { device.seqNo.orEmpty() }}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        pendingDelete?.let { device ->
            AppDialogForm(
                title = "删除饮水机绑定",
                subtitle = "仅从本系统移除该设备，不影响学校账号和设备本身。",
                icon = Icons.Outlined.DeleteOutline,
                onDismissRequest = {
                    pendingDelete = null
                    onClearFeedback()
                },
                onConfirm = {
                    val seqNo = device.seqNo.orEmpty()
                    pendingDelete = null
                    onClearFeedback()
                    onUnbind(seqNo)
                },
                confirmText = "删除绑定",
                cancelText = "取消",
                danger = true,
            ) {
                Text(
                    text = "设备：${device.deviceName.orEmpty().ifBlank { device.seqNo.orEmpty() }}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun WaterValveDeviceCard(
    device: CampusWaterValveDevice,
    busy: Boolean,
    dragging: Boolean,
    modifier: Modifier = Modifier,
    onToggle: (Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    AppPanel(
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 620.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 13.dp),
            verticalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            // 顶部 Header：设备信息 + 状态胶囊 + 现代化磨砂删除按钮
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.DragHandle,
                    contentDescription = "长按拖动排序",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                    modifier = Modifier.size(19.dp),
                )
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = if (device.running) {
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.8f)
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                    },
                    modifier = Modifier.size(32.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.WaterDrop,
                            contentDescription = null,
                            tint = if (device.running) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.size(17.dp),
                        )
                    }
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(1.dp),
                ) {
                    Text(
                        text = device.deviceName.orEmpty().ifBlank { device.seqNo.orEmpty() },
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "编号 ${device.seqNo.orEmpty()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                // 状态指示小胶囊（纯原生样式）
                Surface(
                    shape = CircleShape,
                    color = if (device.running) {
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.85f)
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                    },
                    border = androidx.compose.foundation.BorderStroke(
                        width = 0.8.dp,
                        color = if (device.running) {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.28f)
                        } else {
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                        },
                    ),
                    modifier = Modifier.heightIn(min = 26.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(
                                    color = if (device.running) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                    shape = CircleShape,
                                ),
                        )
                        Text(
                            text = if (device.running) "出水中" else "待命中",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 11.sp),
                            color = if (device.running) {
                                MaterialTheme.colorScheme.onPrimaryContainer
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }

                // 现代化微晶磨砂删除按钮（优雅低反差，符合App整体设计）
                val deleteInteractionSource = remember { MutableInteractionSource() }
                val isDeletePressed by deleteInteractionSource.collectIsPressedAsState()
                Surface(
                    shape = CircleShape,
                    color = if (isDeletePressed) {
                        MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f)
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                    },
                    border = androidx.compose.foundation.BorderStroke(
                        width = 0.8.dp,
                        color = if (isDeletePressed) {
                            MaterialTheme.colorScheme.error.copy(alpha = 0.35f)
                        } else {
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
                        },
                    ),
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .size(31.dp)
                        .clickable(
                            interactionSource = deleteInteractionSource,
                            indication = LocalIndication.current,
                            enabled = !busy,
                            onClick = onDelete,
                        ),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Outlined.DeleteOutline,
                            contentDescription = "删除绑定",
                            tint = if (isDeletePressed) {
                                MaterialTheme.colorScheme.error
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                            },
                            modifier = Modifier.size(15.dp),
                        )
                    }
                }
            }

            // 主体区域：左右分栏（左侧数据矩阵，右侧超大仪表按钮，完全对齐方案二）
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // 左侧数据指标列
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    WaterValveMetricTile(
                        label = "钱包余额",
                        tag = "即时可用",
                        value = device.balance.orEmpty().ifBlank { "--" },
                        prefix = "¥ ",
                        icon = Icons.Outlined.AccountBalanceWallet,
                        running = device.running,
                    )
                    WaterValveMetricTile(
                        label = "设定流量",
                        tag = "定额出水",
                        value = device.defaultValue.orEmpty().ifBlank { "--" },
                        unit = "mL",
                        icon = Icons.Outlined.Opacity,
                        running = device.running,
                    )
                    Text(
                        text = if (device.running) "设备状态：高速供水中" else "设备状态：阀门已就绪",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = if (device.running) FontWeight.Bold else FontWeight.Medium,
                        ),
                        color = if (device.running) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
                        },
                        modifier = Modifier.padding(start = 2.dp),
                    )
                }

                // 右侧大环形控制罗盘（方案二核心样式）
                WaterValveRingDialButton(
                    running = device.running,
                    busy = busy,
                    defaultValue = device.defaultValue,
                    onToggle = onToggle,
                )
            }

            if (device.error != null) {
                FeedbackBanner(message = device.error, error = true)
            }
            Text(
                text = "同步于 ${formatPlatformTime(device.updatedAt)}",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                modifier = Modifier.align(Alignment.End),
            )
        }
    }
}

@Composable
private fun WaterValveMetricTile(
    label: String,
    tag: String,
    value: String,
    icon: ImageVector,
    running: Boolean,
    modifier: Modifier = Modifier,
    prefix: String? = null,
    unit: String? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = if (running) 0.42f else 0.28f),
        border = androidx.compose.foundation.BorderStroke(
            width = 0.8.dp,
            color = if (running) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
            } else {
                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = tag,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    color = if (running) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                )
            }
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                if (!prefix.isNullOrBlank() && value != "--") {
                    Text(
                        text = prefix,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(bottom = 1.dp),
                    )
                }
                Text(
                    text = value,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Black,
                        fontSize = 17.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!unit.isNullOrBlank() && value != "--") {
                    Text(
                        text = unit,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        modifier = Modifier.padding(bottom = 1.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun WaterValveRingDialButton(
    running: Boolean,
    busy: Boolean,
    defaultValue: String?,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val transition = rememberInfiniteTransition(label = "ringDialTransition")
    val sweepAngle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "ringSweepAngle",
    )
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ringPulseAlpha",
    )

    val dialInteractionSource = remember { MutableInteractionSource() }

    val runningGradient = Brush.linearGradient(
        colors = listOf(Color(0xFF2563EB), Color(0xFF4F46E5)),
    )

    Box(
        modifier = modifier
            .size(108.dp)
            .pressFeedback(dialInteractionSource, pressedScale = 0.94f)
            .clickable(
                enabled = !busy,
                indication = null,
                interactionSource = dialInteractionSource,
            ) {
                AppHaptics.tick(haptics)
                onToggle(!running)
            },
        contentAlignment = Alignment.Center,
    ) {
        // 出水状态下的外圈动态旋转跑马灯光环（方案二原型 ringGlow）
        if (running) {
            Canvas(modifier = Modifier.size(108.dp)) {
                val strokeWidth = 2.dp.toPx()
                val sweepBrush = Brush.sweepGradient(
                    colors = listOf(
                        Color(0xFF38BDF8),
                        Color(0xFF818CF8),
                        Color(0xFF38BDF8).copy(alpha = 0.15f),
                        Color(0xFF38BDF8),
                    ),
                )
                rotate(sweepAngle) {
                    drawCircle(
                        brush = sweepBrush,
                        style = Stroke(
                            width = strokeWidth,
                            pathEffect = PathEffect.dashPathEffect(
                                floatArrayOf(16f, 12f),
                                0f,
                            ),
                        ),
                    )
                }
            }
        }

        // 大圆盘按钮实体主体（方案二原型 circleBtn 结构）
        Box(
            modifier = Modifier
                .size(100.dp)
                .shadow(
                    elevation = if (running) 8.dp else 2.dp,
                    shape = CircleShape,
                    spotColor = if (running) Color(0xFF2563EB).copy(alpha = 0.5f) else Color.Black.copy(alpha = 0.08f),
                )
                .then(
                    if (running) {
                        Modifier
                            .background(runningGradient, CircleShape)
                            .border(2.dp, Color(0xFF67E8F9).copy(alpha = pulseAlpha), CircleShape)
                    } else {
                        Modifier
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f), CircleShape)
                            .border(2.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.75f), CircleShape)
                    }
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    strokeWidth = 2.5.dp,
                    color = if (running) Color.White else MaterialTheme.colorScheme.primary,
                )
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    // 1. 顶部图标
                    Icon(
                        imageVector = if (running) Icons.Outlined.Stop else Icons.Outlined.WaterDrop,
                        contentDescription = if (running) "点击停水" else "轻触出水",
                        tint = if (running) Color.White else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(26.dp),
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    // 2. 中间主标题（方案二同款：轻触出水 / 点击停水）
                    Text(
                        text = if (running) "点击停水" else "轻触出水",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                        ),
                        color = if (running) Color.White else MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    // 3. 底部副标题（方案二同款：500 mL / 出水中...）
                    Text(
                        text = if (running) "出水中..." else (defaultValue?.ifBlank { "500 mL" } ?: "500 mL"),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Medium,
                            fontSize = 10.sp,
                        ),
                        color = if (running) Color(0xFFA5F3FC) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                    )
                }
            }
        }
    }
}

@Composable
private fun WaterValveBillCard(
    bill: CampusWaterBill?,
    loading: Boolean,
    month: YearMonth,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onRetry: () -> Unit,
) {
    AppPanel(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 620.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.ReceiptLong,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "生活用水账单",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        text = "${month.year}年${month.monthValue}月 · ${bill?.totalAmount ?: "--"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppHeaderIconButton(
                    icon = Icons.Outlined.ChevronLeft,
                    contentDescription = "上一月账单",
                    onClick = onPreviousMonth,
                )
                AppHeaderIconButton(
                    icon = Icons.Outlined.ChevronRight,
                    contentDescription = "下一月账单",
                    onClick = onNextMonth,
                )
            }

            if (loading) {
                GlassShimmerList(itemCount = 2, itemHeight = 72.dp)
            } else if (bill?.error != null && bill.records.isEmpty()) {
                FeedbackBanner(message = bill.error, error = true, onRetry = onRetry)
            } else if (bill == null || bill.records.isEmpty()) {
                Text(
                    text = "本月暂无用水记录",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                bill.records.forEach { record ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.38f),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(
                                    text = record.title,
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = "${record.time} · ${record.detail}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Text(
                                text = record.amount,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WaterValveScannerOverlay(
    onCodeDetected: (String) -> Unit,
    onClose: () -> Unit,
) {
    BackHandler(onBack = onClose)
    val context = LocalContext.current
    var cameraGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    var permissionRequested by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        cameraGranted = granted
        permissionRequested = true
    }

    LaunchedEffect(Unit) {
        if (!cameraGranted) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.scrim),
    ) {
        if (cameraGranted) {
            QrCameraPreview(
                onCodeDetected = onCodeDetected,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(248.dp)
                    .border(
                        width = 2.dp,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.9f),
                        shape = RoundedCornerShape(18.dp),
                    ),
            )
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 20.dp)
                    .navigationBarsPadding(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "将饮水机二维码放入框内，识别后自动绑定",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.86f),
                    textAlign = TextAlign.Center,
                )
                AppSecondaryButton(text = "关闭扫码", onClick = onClose)
            }
        } else {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp)
                    .widthIn(max = 420.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.QrCodeScanner,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(42.dp),
                )
                Text(
                    text = "需要相机权限",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (permissionRequested) {
                        "相机权限未开启，请重新授权或前往系统设置。"
                    } else {
                        "授权后即可扫描饮水机二维码"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f),
                    textAlign = TextAlign.Center,
                )
                AppButton(
                    text = if (permissionRequested) "再次授权" else "授权相机",
                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                    modifier = Modifier.padding(top = 8.dp),
                )
                if (permissionRequested) {
                    AppSecondaryButton(
                        text = "打开系统设置",
                        onClick = {
                            context.startActivity(
                                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                    data = Uri.parse("package:${context.packageName}")
                                },
                            )
                        },
                    )
                }
                AppSecondaryButton(text = "返回", onClick = onClose)
            }
        }
    }
}
