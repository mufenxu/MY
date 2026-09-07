package cn.pxyb.mycontrol.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.LockClock
import androidx.compose.material.icons.outlined.Password
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.data.Authenticator
import cn.pxyb.mycontrol.data.AuthenticatorEntry
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import kotlinx.coroutines.delay
import java.util.UUID

@Composable
fun AuthenticatorScreen(
    state: AuthenticatorUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    pendingQrUri: String?,
    onAddFromUri: (String) -> Unit,
    onAddManual: (String, String, String) -> Unit,
    onDelete: (String) -> Unit,
    onPendingQrUriConsumed: () -> Unit,
) {
    var scannerOpen by remember { mutableStateOf(false) }
    var manualOpen by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<AuthenticatorEntry?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val currentMillis by produceState(initialValue = System.currentTimeMillis(), lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                val now = System.currentTimeMillis()
                value = now
                delay(1000L - now % 1000L)
            }
        }
    }

    LaunchedEffect(pendingQrUri) {
        if (pendingQrUri != null) {
            onAddFromUri(pendingQrUri)
            onPendingQrUriConsumed()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AppSubPage(
            title = "本地验证器",
            subtitle = "离线生成 TOTP 动态验证码",
            onBack = onBack,
            contentPadding = contentPadding,
            actions = {
                AppHeaderIconButton(
                    icon = Icons.Outlined.QrCodeScanner,
                    contentDescription = "扫码添加验证器",
                    onClick = { scannerOpen = true },
                )
                Spacer(Modifier.width(6.dp))
                AppHeaderIconButton(
                    icon = Icons.Outlined.Key,
                    contentDescription = "手动添加验证器",
                    onClick = { manualOpen = true },
                )
            },
        ) {
            item(key = "security-notice", contentType = "notice") {
                AppPanel {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Icon(
                            Icons.Outlined.Security,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp),
                        )
                        Text(
                            text = "密钥仅保存在本机 Android Keystore 加密存储中，不上传服务器，也不会参与云备份。卸载或清除应用数据后无法恢复。",
                            style = MaterialTheme.typography.bodySmall.copy(lineHeight = 19.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            if (state.error != null) {
                item(key = "authenticator-error", contentType = "banner") {
                    FeedbackBanner(state.error, error = true)
                }
            }
            if (state.message != null) {
                item(key = "authenticator-message", contentType = "banner") {
                    FeedbackBanner(state.message, error = false)
                }
            }

            if (state.loading) {
                item(key = "authenticator-loading", contentType = "loading") {
                    AppPanel {
                        Text(
                            text = "正在读取本地加密数据……",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }
            } else if (state.entries.isEmpty()) {
                item(key = "authenticator-empty", contentType = "empty") {
                    AppEmptyState(
                        title = "还没有验证器条目",
                        detail = "扫描第三方网站提供的 otpauth 二维码，或手动输入 Base32 密钥。",
                        icon = Icons.Outlined.LockClock,
                        actionText = "扫码添加",
                        onAction = { scannerOpen = true },
                        secondaryActionText = "手动添加",
                        onSecondaryAction = { manualOpen = true },
                    )
                }
            } else {
                items(
                    count = state.entries.size,
                    key = { state.entries[it].id },
                    contentType = { "authenticator-entry" },
                ) { index ->
                    AuthenticatorEntryCard(
                        entry = state.entries[index],
                        currentMillis = currentMillis,
                        onDelete = { pendingDelete = state.entries[index] },
                    )
                }
            }
        }

        if (scannerOpen) {
            AuthenticatorScannerOverlay(
                onCodeDetected = {
                    scannerOpen = false
                    onAddFromUri(it)
                },
                onClose = { scannerOpen = false },
            )
        }
    }

    if (manualOpen) {
        AuthenticatorManualDialog(
            busy = state.busy,
            onDismiss = { manualOpen = false },
            onAdd = { issuer, account, secret ->
                onAddManual(issuer, account, secret)
                manualOpen = false
            },
        )
    }

    pendingDelete?.let { entry ->
        AppConfirmDialog(
            title = "删除验证器",
            detail = "将删除 ${entry.issuer}（${entry.account}）的本地密钥。删除后需要重新扫码绑定，且无法恢复。",
            confirmLabel = "删除",
            dismissLabel = "取消",
            icon = Icons.Outlined.Delete,
            danger = true,
            busy = state.busy,
            onDismiss = { pendingDelete = null },
            onConfirm = {
                onDelete(entry.id)
                pendingDelete = null
            },
        )
    }
}

@Composable
private fun AuthenticatorEntryCard(
    entry: AuthenticatorEntry,
    currentMillis: Long,
    onDelete: () -> Unit,
) {
    val context = LocalContext.current
    var copied by remember(entry.id) { mutableStateOf(false) }
    val timeStep = currentMillis / (entry.periodSeconds * 1000L)
    val code = remember(entry, timeStep) { Authenticator.generate(entry, currentMillis) }
    val remainingSeconds = Authenticator.remainingSeconds(entry, currentMillis)
    val progress by animateFloatAsState(
        targetValue = remainingSeconds.toFloat() / entry.periodSeconds,
        animationSpec = tween(durationMillis = 1000, easing = LinearEasing),
        label = "totp-progress",
    )

    LaunchedEffect(copied) {
        if (copied) {
            delay(1400)
            copied = false
        }
    }

    AppPanel(
        onClick = {
            val now = System.currentTimeMillis()
            copyAuthenticatorCode(context, Authenticator.generate(entry, now), Authenticator.remainingSeconds(entry, now) * 1000L)
            copied = true
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = entry.issuer,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = entry.account,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                AppHeaderIconButton(
                    icon = Icons.Outlined.Delete,
                    contentDescription = "删除 ${entry.issuer} 验证器",
                    onClick = onDelete,
                )
            }

            Text(
                text = formatTotpCode(code),
                style = MaterialTheme.typography.displaySmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp,
                ),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )

            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(50)),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )

            Text(
                text = if (copied) "已复制验证码" else "$remainingSeconds 秒后刷新",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

private fun copyAuthenticatorCode(context: Context, code: String, lifetimeMillis: Long) {
    val clipboard = context.getSystemService(ClipboardManager::class.java)
    val clipId = UUID.randomUUID().toString()
    val idKey = "cn.pxyb.mycontrol.clip_id"
    val sensitiveKey = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ClipDescription.EXTRA_IS_SENSITIVE
    } else "android.content.extra.IS_SENSITIVE"
    val clip = ClipData.newPlainText("动态验证码", code).apply {
        description.extras = PersistableBundle().apply {
            putBoolean(sensitiveKey, true)
            putString(idKey, clipId)
        }
    }
    clipboard.setPrimaryClip(clip)
    Handler(Looper.getMainLooper()).postDelayed({
        // 仅清理这次复制的验证码，保留用户随后复制的内容。
        if (clipboard.primaryClipDescription?.extras?.getString(idKey) == clipId) clipboard.clearPrimaryClip()
    }, lifetimeMillis.coerceIn(1000L, 60_000L))
}

private fun formatTotpCode(code: String): String = when (code.length) {
    6 -> code.chunked(3).joinToString(" ")
    7 -> "${code.take(3)} ${code.drop(3)}"
    8 -> code.chunked(4).joinToString(" ")
    else -> code
}

@Composable
private fun AuthenticatorManualDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onAdd: (String, String, String) -> Unit,
) {
    var issuer by remember { mutableStateOf("") }
    var account by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }

    fun submit() {
        localError = when {
            issuer.isBlank() -> "请输入服务名称。"
            account.isBlank() -> "请输入账号名称。"
            else -> runCatching { Authenticator.decodeBase32(secret) }
                .fold(
                    onSuccess = { decoded ->
                        if (decoded.size < 16) "密钥强度不足，至少需要 128 位。" else null
                    },
                    onFailure = { it.message },
                )
        }
        if (localError == null) onAdd(issuer, account, secret)
    }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Password,
        title = "手动添加验证器",
        subtitle = "请从服务提供商的二次验证页面复制 Base32 密钥",
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(
                    value = issuer,
                    onValueChange = { issuer = it },
                    label = "服务名称",
                    placeholder = "例如 GitHub",
                    leadingIcon = Icons.Outlined.Security,
                )
                AppTextField(
                    value = account,
                    onValueChange = { account = it },
                    label = "账号名称",
                    placeholder = "例如 user@example.com",
                    leadingIcon = Icons.Outlined.Person,
                )
                AppTextField(
                    value = secret,
                    onValueChange = {
                        secret = it
                        localError = null
                    },
                    label = "Base32 密钥",
                    placeholder = "输入 16 字节以上密钥",
                    leadingIcon = Icons.Outlined.Key,
                    isPassword = true,
                )
                localError?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
                AppDialogPrimaryButton(
                    text = "添加",
                    onClick = ::submit,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun AuthenticatorScannerOverlay(
    onCodeDetected: (String) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    var cameraGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var permissionRequested by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        cameraGranted = it
        permissionRequested = true
    }

    BackHandler(onBack = onClose)
    LaunchedEffect(Unit) {
        if (!cameraGranted) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.scrim),
    ) {
        if (cameraGranted) {
            QrCameraPreview(onCodeDetected, Modifier.fillMaxSize())
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(248.dp)
                    .border(2.dp, Color.White.copy(alpha = 0.9f), RoundedCornerShape(18.dp)),
            )
        } else {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    Icons.Outlined.CenterFocusWeak,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(42.dp),
                )
                Text(
                    text = "需要相机权限才能扫描验证器二维码",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                )
                AppSecondaryButton(
                    text = "重新授权",
                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
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
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppHeaderIconButton(
                icon = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = "返回",
                onClick = onClose,
                iconTint = Color.White,
                containerColor = Color.Black.copy(alpha = 0.46f),
                borderColor = Color.White.copy(alpha = 0.20f),
            )
            Text(
                text = "扫描验证器二维码",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
                modifier = Modifier.padding(start = 12.dp),
            )
        }

        Text(
            text = "将网站提供的 otpauth 二维码放入取景框",
            color = Color.White,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 20.dp, vertical = 28.dp),
        )
    }
}
