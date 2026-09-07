package cn.pxyb.mycontrol.ui.components.dialog

import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import cn.pxyb.mycontrol.ui.AppDialogDangerButton
import cn.pxyb.mycontrol.ui.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.BrandBlue
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.DarkSurface
import cn.pxyb.mycontrol.ui.theme.ForestSoft
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.Surface
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import kotlinx.coroutines.delay

/** 操作状态类型定义 */
enum class OperationStatus {
    Success,
    Error,
    Warning,
    Info,
}

/**
 * 方案二：毛玻璃流光模态卡片 (Glassmorphic Modal Card)
 * 
 * 适用于操作成功、操作失败、安全警告等核心状态的强聚焦反馈。
 * 1. 材质：严格对齐毛玻璃拟态（96% 磨砂底色 + 顶部高光渐变 + 1dp 发丝描边 + 0 脏阴影）；
 * 2. 徽章：56dp 3D 拟态微光呼吸徽标；
 * 3. 按钮：完全复用 App 规范中的全圆角胶囊流光按钮族；
 * 4. 触觉：成功伴随轻柔微震，失败伴随二次警示重震。
 */
@Composable
fun AppStatusDialog(
    status: OperationStatus,
    title: String,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
    details: List<Pair<String, String>>? = null,
    primaryButtonText: String = "我知道了",
    onPrimaryClick: () -> Unit = onDismissRequest,
    secondaryButtonText: String? = null,
    onSecondaryClick: (() -> Unit)? = null,
    primaryButtonBusy: Boolean = false,
    autoDismissMillis: Long? = if (status == OperationStatus.Success) 3000L else null,
    content: (@Composable () -> Unit)? = null,
) {
    var visible by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current

    LaunchedEffect(Unit) {
        visible = true
        when (status) {
            OperationStatus.Success -> AppHaptics.tick(haptics)
            OperationStatus.Error -> AppHaptics.heavy(haptics)
            OperationStatus.Warning -> AppHaptics.heavy(haptics)
            OperationStatus.Info -> AppHaptics.tick(haptics)
        }
    }

    if (autoDismissMillis != null && autoDismissMillis > 0) {
        LaunchedEffect(Unit) {
            delay(autoDismissMillis)
            if (visible) {
                visible = false
                delay(MotionTokens.DurationShort.toLong())
                onDismissRequest()
            }
        }
    }

    Dialog(
        onDismissRequest = {
            visible = false
            onDismissRequest()
        },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
    ) {
        val view = LocalView.current
        val dark = isAppInDarkTheme()
        val dimAlpha = if (dark) 0.45f else 0.30f

        SideEffect {
            val window = (view.parent as? DialogWindowProvider)?.window ?: return@SideEffect
            WindowCompat.setDecorFitsSystemWindows(window, false)
            window.setBackgroundDrawable(ColorDrawable(android.graphics.Color.TRANSPARENT))
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            window.setDimAmount(dimAlpha)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
            }
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }

        val adaptive = LocalAdaptiveWindow.current
        val isTablet = adaptive.isTabletOrExpanded
        val maxCardWidth = if (isTablet) 420.dp else 348.dp

        val accentColor = when (status) {
            OperationStatus.Success -> ForestSoft
            OperationStatus.Error -> Coral
            OperationStatus.Warning -> Amber
            OperationStatus.Info -> BrandBlue
        }

        val cardBg = if (dark) DarkSurface.copy(alpha = 0.96f) else Surface.copy(alpha = 0.97f)
        val cardBorder = if (dark) Color.White.copy(alpha = 0.14f) else Color.Black.copy(alpha = 0.08f)
        val cardShape = RoundedCornerShape(26.dp)

        val topHighlight = Brush.verticalGradient(
            colorStops = arrayOf(
                0.0f to (if (dark) Color.White.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.40f)),
                0.12f to Color.Transparent,
                1.0f to Color.Transparent,
            ),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {
                        visible = false
                        onDismissRequest()
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = scaleIn(
                    initialScale = 0.92f,
                    animationSpec = tween(MotionTokens.DurationMedium, easing = MotionTokens.EmphasizedDecelerate),
                ) + fadeIn(animationSpec = tween(MotionTokens.DurationShort)),
                exit = scaleOut(
                    targetScale = 0.94f,
                    animationSpec = tween(MotionTokens.DurationShort),
                ) + fadeOut(animationSpec = tween(MotionTokens.DurationShort)),
            ) {
                Surface(
                    modifier = modifier
                        .padding(horizontal = 24.dp)
                        .widthIn(max = maxCardWidth)
                        .shadow(
                            elevation = 16.dp,
                            shape = cardShape,
                            spotColor = accentColor.copy(alpha = if (dark) 0.25f else 0.18f),
                            ambientColor = Color.Transparent,
                        )
                        .border(1.dp, cardBorder, cardShape)
                        .clip(cardShape)
                        .background(cardBg, cardShape)
                        .background(topHighlight, cardShape)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {}, // 拦截卡片内部点击
                        ),
                    shape = cardShape,
                    color = Color.Transparent,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 22.dp, vertical = 22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        // 1. 3D 拟态微光状态徽标
                        StatusGlowBadge(
                            status = status,
                            accentColor = accentColor,
                            dark = dark,
                        )

                        Spacer(Modifier.height(16.dp))

                        // 2. 标题
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.2.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        // 3. 详细描述
                        if (!description.isNullOrBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = description,
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontSize = 13.sp,
                                    lineHeight = 19.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                                textAlign = TextAlign.Center,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 6.dp),
                            )
                        }

                        // 4. 自定义内容或键值对详细卡片
                        if (content != null) {
                            Spacer(Modifier.height(14.dp))
                            content()
                        } else if (!details.isNullOrEmpty()) {
                            Spacer(Modifier.height(14.dp))
                            StatusDetailsCard(details = details, dark = dark)
                        }

                        Spacer(Modifier.height(20.dp))

                        // 5. 胶囊流光按钮组
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            if (!secondaryButtonText.isNullOrBlank()) {
                                AppDialogSecondaryButton(
                                    text = secondaryButtonText,
                                    onClick = {
                                        visible = false
                                        onSecondaryClick?.invoke()
                                    },
                                    modifier = Modifier.weight(1f),
                                    enabled = !primaryButtonBusy,
                                )
                            }

                            if (status == OperationStatus.Error && secondaryButtonText != null) {
                                // 失败且提供次按钮（取消）时，主按钮通常为重试
                                AppDialogDangerButton(
                                    text = primaryButtonText,
                                    onClick = {
                                        onPrimaryClick()
                                    },
                                    modifier = Modifier.weight(1f),
                                    busy = primaryButtonBusy,
                                )
                            } else {
                                AppDialogPrimaryButton(
                                    text = primaryButtonText,
                                    onClick = {
                                        visible = false
                                        onPrimaryClick()
                                    },
                                    modifier = Modifier.weight(1f),
                                    busy = primaryButtonBusy,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 56dp 3D 拟态微光徽标 */
@Composable
private fun StatusGlowBadge(
    status: OperationStatus,
    accentColor: Color,
    dark: Boolean,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "statusGlow")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.10f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = MotionTokens.EmphasizedDecelerate),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "glowPulse",
    )

    val icon: ImageVector = when (status) {
        OperationStatus.Success -> Icons.Outlined.CheckCircle
        OperationStatus.Error -> Icons.Outlined.ErrorOutline
        OperationStatus.Warning -> Icons.Outlined.WarningAmber
        OperationStatus.Info -> Icons.Outlined.Info
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.size(68.dp),
    ) {
        // 外层柔光微光晕
        Box(
            modifier = Modifier
                .size((56 * pulseScale).dp)
                .background(accentColor.copy(alpha = if (dark) 0.18f else 0.12f), CircleShape),
        )

        // 内层徽标实体
        Surface(
            shape = CircleShape,
            color = accentColor.copy(alpha = if (dark) 0.22f else 0.14f),
            border = BorderStroke(1.5.dp, accentColor.copy(alpha = if (dark) 0.45f else 0.35f)),
            modifier = Modifier.size(54.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(28.dp),
                )
            }
        }
    }
}

/** 键值对详细卡片 */
@Composable
private fun StatusDetailsCard(
    details: List<Pair<String, String>>,
    dark: Boolean,
) {
    val panelBg = if (dark) Color.White.copy(alpha = 0.04f) else Color.Black.copy(alpha = 0.03f)
    val panelBorder = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(panelBg)
            .border(1.dp, panelBorder, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        details.forEach { (label, value) ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        fontSize = 11.5.sp,
                    ),
                )
                Text(
                    text = value,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 12.sp,
                    ),
                )
            }
        }
    }
}

/** 快捷操作成功弹窗 */
@Composable
fun AppSuccessModalCard(
    title: String = "操作成功",
    message: String,
    onDismiss: () -> Unit,
    confirmText: String = "我知道了",
    details: List<Pair<String, String>>? = null,
    autoDismissMillis: Long? = 3000L,
) {
    AppStatusDialog(
        status = OperationStatus.Success,
        title = title,
        description = message,
        onDismissRequest = onDismiss,
        primaryButtonText = confirmText,
        onPrimaryClick = onDismiss,
        details = details,
        autoDismissMillis = autoDismissMillis,
    )
}

/** 快捷操作失败弹窗 */
@Composable
fun AppErrorModalCard(
    title: String = "操作未完成",
    error: String,
    onDismiss: () -> Unit,
    onRetry: (() -> Unit)? = null,
    confirmText: String = if (onRetry != null) "重试" else "我知道了",
    cancelText: String? = if (onRetry != null) "取消" else null,
    details: List<Pair<String, String>>? = null,
) {
    AppStatusDialog(
        status = OperationStatus.Error,
        title = title,
        description = error,
        onDismissRequest = onDismiss,
        primaryButtonText = confirmText,
        onPrimaryClick = {
            onDismiss()
            onRetry?.invoke()
        },
        secondaryButtonText = cancelText,
        onSecondaryClick = onDismiss,
        details = details,
        autoDismissMillis = null,
    )
}
