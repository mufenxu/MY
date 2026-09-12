package cn.pxyb.mycontrol.ui.feature.campus.water

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import cn.pxyb.mycontrol.data.CampusWaterValveDevice
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import java.time.YearMonth
import kotlin.math.abs
import kotlinx.coroutines.delay

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
    var hasInitialLoaded by remember { mutableStateOf(state.valve.devices.isNotEmpty()) }

    LaunchedEffect(Unit) {
        onRefresh(true)
    }
    LaunchedEffect(billMonth) {
        onQueryBill(billMonth.toString(), true)
    }
    LaunchedEffect(state.valve.devices) {
        if (draggingKey == null) devices = state.valve.devices
        if (state.valve.devices.isNotEmpty()) {
            hasInitialLoaded = true
        }
    }
    LaunchedEffect(state.refreshing) {
        if (!state.refreshing) {
            hasInitialLoaded = true
        }
    }

    // 官方系统没有“设备正在出水”的查询接口，设备端手动停水不会回传，
    // 出水期间定时刷新，让超过时限的出水状态自动回到待机。
    val anyDeviceRunning = state.valve.devices.any { it.running }
    val currentOnRefresh by rememberUpdatedState(onRefresh)
    LaunchedEffect(anyDeviceRunning) {
        while (anyDeviceRunning) {
            delay(60_000)
            currentOnRefresh(true)
        }
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
                    AppFeedbackBanner(
                        message = state.error,
                        error = true,
                        onRetry = { onRefresh(true) },
                    )
                }
            }
            if (state.message != null) {
                item(key = "water-valve-message", contentType = "banner") {
                    AppFeedbackBanner(message = state.message, error = false)
                }
            }

            val isInitialLoading = !hasInitialLoaded || (state.refreshing && devices.isEmpty())

            if (isInitialLoading) {
                item(key = "water-valve-loading", contentType = "loading") {
                    WaterValveSkeletonList(count = 2)
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
                    AnimatedVisibility(
                        visible = true,
                        enter = fadeIn(animationSpec = tween(380)) + slideInVertically(
                            animationSpec = tween(380),
                            initialOffsetY = { 35 },
                        ),
                    ) {
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
