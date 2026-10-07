package cn.pxyb.mycontrol.ui.components.feedback

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
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.ColorTokens
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

/** 提示刚出现的时间窗口：超出该窗口说明是列表回收后的重建，不再重复触发触觉反馈。 */
private const val HAPTIC_FRESH_WINDOW_MS = 250L

/** 主题反馈横幅：成功短暂显示，持续状态保留；重试与关闭由调用方决定。 */
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
    autoDismissDurationMillis: Long? = if (type == AppFeedbackType.Success) 4000L else null,
    onDismiss: (() -> Unit)? = null,
    shownAtMillis: Long? = null,
) {
    val dark = isAppInDarkTheme()
    val haptics = LocalHapticFeedback.current
    val accessibilityManager = LocalAccessibilityManager.current
    val dismissTimeout = autoDismissDurationMillis?.let {
        accessibilityManager?.calculateRecommendedTimeoutMillis(
            originalTimeoutMillis = it,
            containsIcons = true,
            containsText = true,
            containsControls = showCloseButton || onRetry != null,
        ) ?: it
    }

    val accentColor = when (type) {
        AppFeedbackType.Success -> ColorTokens.Green.foreground
        AppFeedbackType.Error -> ColorTokens.Red.foreground
        AppFeedbackType.Warning -> ColorTokens.Amber.foreground
        AppFeedbackType.Info -> ColorTokens.Blue.foreground
    }

    // 提示通常位于 LazyColumn 的 item 中，滚动时会被回收重建。调用方给出本次提示的生成时间后，
    // 倒计时按固定截止时间推进，重建时接着走完剩余时间，不会重新计时或一直不消失。
    val dismissDeadline = remember(message, type, dismissTimeout, shownAtMillis) {
        if (dismissTimeout != null && dismissTimeout > 0L) {
            (shownAtMillis ?: System.currentTimeMillis()) + dismissTimeout
        } else {
            Long.MAX_VALUE
        }
    }
    val isAutoDismissable = dismissDeadline != Long.MAX_VALUE &&
        type != AppFeedbackType.Error

    // 内部自主控制显示与隐藏
    var isVisible by remember(message, type, dismissDeadline) { mutableStateOf(true) }

    // 倒计时动画（1f -> 0f）：重建时从剩余时间对应的进度继续
    val progressAnim = remember(message, type, dismissDeadline) {
        val initial = if (isAutoDismissable) {
            val remaining = (dismissDeadline - System.currentTimeMillis()).coerceAtLeast(0L)
            (remaining.toFloat() / dismissTimeout!!.toFloat()).coerceIn(0f, 1f)
        } else {
            1f
        }
        Animatable(initial)
    }

    // 截止时间已过（提示被滚出屏幕很久后才重新出现）时不再展示
    val expired = isAutoDismissable && dismissDeadline <= System.currentTimeMillis()

    // 触觉反馈联动：同一条提示被回收重建时不重复震动
    val hapticDue = remember(message, type, dismissDeadline) {
        !isAutoDismissable ||
            System.currentTimeMillis() - (dismissDeadline - dismissTimeout!!) < HAPTIC_FRESH_WINDOW_MS
    }
    LaunchedEffect(message, type, hapticDue) {
        if (!hapticDue) return@LaunchedEffect
        if (type == AppFeedbackType.Error) {
            AppHaptics.heavy(haptics)
        } else {
            AppHaptics.tick(haptics)
        }
    }

    // 自动倒计时：走完剩余时间后平滑收起
    LaunchedEffect(message, type, isVisible, dismissDeadline) {
        if (!isVisible || !isAutoDismissable) return@LaunchedEffect
        val remaining = (dismissDeadline - System.currentTimeMillis()).coerceAtLeast(0L)
        if (remaining > 0L) {
            progressAnim.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = remaining.coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
                    easing = LinearEasing,
                ),
            )
        }
        // 倒计时结束，触发平滑关闭与回调
        isVisible = false
        onDismiss?.invoke()
    }

    val handleDismiss: () -> Unit = {
        AppHaptics.tick(haptics)
        isVisible = false
        onDismiss?.invoke()
    }

    val shape = RoundedCornerShape(20.dp)

    val surfaceColor = MaterialTheme.colorScheme.surface
    val borderStrokeColor = MaterialTheme.colorScheme.outlineVariant

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
        visible = isVisible && !expired,
        enter = expandVertically(
            animationSpec = cn.pxyb.mycontrol.ui.theme.MotionTokens.standardTween(),
        ) + fadeIn(cn.pxyb.mycontrol.ui.theme.MotionTokens.fastTween()),
        exit = shrinkVertically(
            animationSpec = cn.pxyb.mycontrol.ui.theme.MotionTokens.standardTween(),
        ) + fadeOut(cn.pxyb.mycontrol.ui.theme.MotionTokens.fastTween()),
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(surfaceColor, shape)
                .border(0.5.dp, borderStrokeColor, shape)
                .clip(shape)
                .padding(horizontal = 14.dp, vertical = 12.dp),
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
                            interactionSource = retryInteraction,
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
    shownAtMillis: Long? = null,
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
        shownAtMillis = shownAtMillis,
    )
}
