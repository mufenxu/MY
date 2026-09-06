package cn.pxyb.mycontrol.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState

private enum class WaterValveAction { Open, Close }

@Composable
fun WaterValveScreen(
    state: WaterValveUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: (Boolean) -> Unit,
    onBind: (String) -> Unit,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    onClearFeedback: () -> Unit,
) {
    var scannerOpen by remember { mutableStateOf(false) }
    var pendingAction by remember { mutableStateOf<WaterValveAction?>(null) }

    LaunchedEffect(Unit) {
        onRefresh(true)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AppSubPage(
            title = "饮水机控制",
            subtitle = "校园生活用水在线开关",
            onBack = onBack,
            contentPadding = contentPadding,
            refreshing = state.refreshing,
            onRefresh = { onRefresh(true) },
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

            if (state.refreshing && !state.valve.bound) {
                item(key = "water-valve-loading", contentType = "loading") {
                    GlassShimmerList(itemCount = 2, itemHeight = 92.dp)
                }
            } else if (!state.valve.bound) {
                item(key = "water-valve-empty", contentType = "empty") {
                    AppEmptyState(
                        title = "尚未绑定饮水机",
                        detail = "扫描饮水机机身上的二维码，绑定后即可远程开关阀门。",
                        icon = Icons.Outlined.WaterDrop,
                        actionText = "扫码绑定",
                        onAction = {
                            onClearFeedback()
                            scannerOpen = true
                        },
                    )
                }
            } else {
                item(key = "water-valve-device", contentType = "card") {
                    WaterValveDeviceCard(
                        state = state,
                        onToggle = { wanted ->
                            pendingAction = if (wanted) WaterValveAction.Open else WaterValveAction.Close
                            onClearFeedback()
                        },
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

        pendingAction?.let { action ->
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
                    pendingAction = null
                    onClearFeedback()
                    if (action == WaterValveAction.Open) onOpen() else onClose()
                },
                confirmText = if (action == WaterValveAction.Open) "开启" else "关闭",
                cancelText = "取消",
                danger = action == WaterValveAction.Close,
            ) {
                Text(
                    text = "设备：${state.valve.deviceName.orEmpty().ifBlank { state.valve.seqNo.orEmpty() }}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun WaterValveDeviceCard(
    state: WaterValveUiState,
    onToggle: (Boolean) -> Unit,
) {
    val valve = state.valve
    AppPanel {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            AppSwitchRow(
                title = if (valve.running) "饮水机运行中" else "饮水机已关闭",
                subtitle = if (state.busy) "正在执行开关操作……" else "切换前会进行二次确认",
                checked = valve.running,
                onCheckedChange = onToggle,
                icon = Icons.Outlined.WaterDrop,
                enabled = !state.busy,
            )
            AppDetailRow(label = "设备名称", value = valve.deviceName.orEmpty(), icon = Icons.Outlined.WaterDrop)
            AppDetailRow(label = "设备编号", value = valve.seqNo.orEmpty(), icon = Icons.Outlined.QrCodeScanner)
            AppDetailRow(label = "默认水量", value = valve.defaultValue.orEmpty())
            AppDetailRow(label = "钱包余额", value = valve.balance.orEmpty())
            AppDetailRow(label = "同步时间", value = formatPlatformTime(valve.updatedAt))
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
