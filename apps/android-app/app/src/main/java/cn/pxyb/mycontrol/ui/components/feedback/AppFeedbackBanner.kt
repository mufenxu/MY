package cn.pxyb.mycontrol.ui.components.feedback

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/**
 * 页面内嵌反馈提示类型
 */
enum class AppFeedbackType {
    Success,
    Error,
    Warning,
    Info,
}

/**
 * 标准页面内嵌操作反馈横幅 (AppFeedbackBanner)
 *
 * 采用 2026 视觉规范【极光微光毛玻璃胶囊 (Aurora Glass Capsule)】+【方案 D 灵动倒计时微光圆环】：
 * - 20dp 饱满圆角 + 75% 半透明磨砂毛玻璃底座，透出底层极光光斑；
 * - 顶部纳米级高光渐变 + 1dp 发丝级状态微光描边（翠绿 ColorTokens.Green.foreground / 珊瑚红 ColorTokens.Red.foreground）；
 * - 左侧 32dp 同心光环 3D 拟态微徽标舱，立体透亮；
 * - 右侧方案 D 倒计时微光进度圆环：成功类通知支持 4 秒平滑倒计时收窄并在结束时自动向上折叠淡出；
 * - 随时支持点击叉号手动立即关闭，满足 48×48 dp 无障碍判定热区与弹性触控微震动；
 * - 内置自主状态控制，即使外层 ViewModel 未显式清空，用户点击关闭即可就地平滑消失。
 */
@Composable
fun AppFeedbackBanner(
    message: String,
    modifier: Modifier = Modifier,
    type: AppFeedbackType = AppFeedbackType.Success,
    title: String? = null,
    icon: ImageVector? = null,
    onRetry: (() -> Unit)? = null,
    retryText: String = "重试",
    showCloseButton: Boolean = true,
    autoDismissDurationMillis: Long? = 4000L,
    onDismiss: (() -> Unit)? = null,
) {
    val dark = isAppInDarkTheme()
    val haptics = LocalHapticFeedback.current

    val accentColor = when (type) {
        AppFeedbackType.Success -> ColorTokens.Green.foreground
        AppFeedbackType.Error -> ColorTokens.Red.foreground
        AppFeedbackType.Warning -> ColorTokens.Amber.foreground
        AppFeedbackType.Info -> ColorTokens.Blue.foreground
    }

    // 内部自主控制显示与隐藏
    var isVisible by remember(message, type) { mutableStateOf(true) }

    // 倒计时动画（1f -> 0f）
    val progressAnim = remember(message, type) { Animatable(1f) }
    val isAutoDismissable = autoDismissDurationMillis != null &&
        autoDismissDurationMillis > 0L &&
        type != AppFeedbackType.Error

    // 触觉反馈联动（当提示刷新出现时给用户细腻触感）
    LaunchedEffect(message, type) {
        if (type == AppFeedbackType.Error) {
            AppHaptics.heavy(haptics)
        } else {
            AppHaptics.tick(haptics)
        }
    }

    // 4 秒自动倒计时平滑收起
    LaunchedEffect(message, type, isVisible) {
        if (!isVisible) return@LaunchedEffect
        if (isAutoDismissable) {
            progressAnim.snapTo(1f)
            progressAnim.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = autoDismissDurationMillis.toInt(),
                    easing = LinearEasing,
                ),
            )
            // 倒计时结束，触发平滑关闭与回调
            isVisible = false
            onDismiss?.invoke()
        }
    }

    val handleDismiss: () -> Unit = {
        AppHaptics.tick(haptics)
        isVisible = false
        onDismiss?.invoke()
    }

    val shape = RoundedCornerShape(20.dp)

    // 半透明磨砂底色（透出底层动态极光）
    val surfaceColor = if (dark) {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)
    } else {
        MaterialTheme.colorScheme.surface.copy(alpha = 0.96f)
    }

    // 顶部纳米高光微渐变
    val highlightBrush = Brush.verticalGradient(
        listOf(
            if (dark) Color.White.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.35f),
            Color.Transparent,
        ),
    )

    // 1dp 发丝级微描边
    val borderStrokeColor = accentColor.copy(alpha = if (dark) 0.35f else 0.45f)

    // 主文本与次文本颜色
    val primaryTextColor = MaterialTheme.colorScheme.onSurface
    val secondaryTextColor = MaterialTheme.colorScheme.onSurfaceVariant

    // 解析左侧图标
    val defaultIcon = when (type) {
        AppFeedbackType.Success -> Icons.Outlined.CheckCircle
        AppFeedbackType.Error -> Icons.Outlined.ErrorOutline
        AppFeedbackType.Warning -> Icons.Outlined.WarningAmber
        AppFeedbackType.Info -> Icons.Outlined.Info
    }
    val finalIcon = icon ?: defaultIcon

    AnimatedVisibility(
        visible = isVisible,
        enter = expandVertically(
            animationSpec = spring(
                dampingRatio = Spring.DampingRatioMediumBouncy,
                stiffness = Spring.StiffnessMediumLow,
            ),
        ) + fadeIn(tween(240)),
        exit = shrinkVertically(
            animationSpec = tween(300, easing = FastOutSlowInEasing),
        ) + fadeOut(tween(200)),
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(
                    elevation = 2.dp,
                    shape = shape,
                    spotColor = accentColor.copy(alpha = 0.16f),
                    ambientColor = Color.Transparent,
                )
                .background(surfaceColor, shape)
                .background(highlightBrush, shape)
                .border(1.dp, borderStrokeColor, shape)
                .clip(shape)
                .padding(horizontal = 14.dp, vertical = 11.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // 左侧 3D 同心徽标底座
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(accentColor.copy(alpha = if (dark) 0.16f else 0.12f), CircleShape)
                        .border(1.dp, accentColor.copy(alpha = if (dark) 0.32f else 0.25f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = finalIcon,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp),
                    )
                }

                // 中间文本排版
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.Center,
                ) {
                    if (!title.isNullOrBlank()) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = primaryTextColor,
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall,
                            color = secondaryTextColor,
                        )
                    } else {
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                            color = primaryTextColor,
                        )
                    }
                }

                // 右侧操作区：可选重试 + 方案 D 倒计时关闭按钮
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    // 重试微胶囊按钮
                    if (onRetry != null) {
                        val retryInteraction = remember { MutableInteractionSource() }
                        Surface(
                            onClick = {
                                AppHaptics.tick(haptics)
                                onRetry()
                            },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .pressFeedback(retryInteraction, pressedScale = 0.94f),
                            shape = RoundedCornerShape(50),
                            color = accentColor.copy(alpha = if (dark) 0.15f else 0.10f),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                accentColor.copy(alpha = if (dark) 0.32f else 0.26f),
                            ),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Refresh,
                                    contentDescription = retryText,
                                    tint = accentColor,
                                    modifier = Modifier.size(13.dp),
                                )
                                Text(
                                    text = retryText,
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                    color = accentColor,
                                )
                            }
                        }
                    }

                    // 方案 D：灵动倒计时微光圆环关闭按钮
                    if (showCloseButton) {
                        val closeInteraction = remember { MutableInteractionSource() }
                        val currentProgress = if (isAutoDismissable) progressAnim.value else 0f

                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .minimumInteractiveComponentSize()
                                .pressFeedback(closeInteraction, pressedScale = 0.90f)
                                .clickable(
                                    interactionSource = closeInteraction,
                                    indication = null,
                                    onClick = handleDismiss,
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Canvas(modifier = Modifier.size(26.dp)) {
                                val strokeWidth = 1.6.dp.toPx()
                                val radius = (size.minDimension - strokeWidth) / 2f
                                val center = Offset(size.width / 2f, size.height / 2f)

                                // 绘制底轨圆环
                                drawCircle(
                                    color = if (dark) Color.White.copy(alpha = 0.14f) else Color.Black.copy(alpha = 0.09f),
                                    radius = radius,
                                    center = center,
                                    style = Stroke(width = strokeWidth),
                                )

                                // 绘制 4 秒平滑倒计时收缩圆弧
                                if (isAutoDismissable && currentProgress > 0f) {
                                    drawArc(
                                        color = accentColor,
                                        startAngle = -90f,
                                        sweepAngle = currentProgress * 360f,
                                        useCenter = false,
                                        topLeft = Offset(center.x - radius, center.y - radius),
                                        size = Size(radius * 2f, radius * 2f),
                                        style = Stroke(
                                            width = strokeWidth + 0.4.dp.toPx(),
                                            cap = StrokeCap.Round,
                                        ),
                                    )
                                }
                            }

                            Icon(
                                imageVector = Icons.Outlined.Close,
                                contentDescription = "关闭提示",
                                tint = if (dark) Color.White.copy(alpha = 0.85f) else Color.Black.copy(alpha = 0.70f),
                                modifier = Modifier.size(13.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 兼容已有 error: Boolean 签名的快捷重载
 */
@Composable
fun AppFeedbackBanner(
    message: String,
    error: Boolean,
    modifier: Modifier = Modifier,
    title: String? = null,
    icon: ImageVector? = null,
    onRetry: (() -> Unit)? = null,
    retryText: String = "重试",
    showCloseButton: Boolean = true,
    autoDismissDurationMillis: Long? = 4000L,
    onDismiss: (() -> Unit)? = null,
) {
    AppFeedbackBanner(
        message = message,
        modifier = modifier,
        type = if (error) AppFeedbackType.Error else AppFeedbackType.Success,
        title = title,
        icon = icon,
        onRetry = onRetry,
        retryText = retryText,
        showCloseButton = showCloseButton,
        autoDismissDurationMillis = autoDismissDurationMillis,
        onDismiss = onDismiss,
    )
}

