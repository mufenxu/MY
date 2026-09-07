package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.pressFeedback
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.BrandBlue
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.DarkMuted
import cn.pxyb.mycontrol.ui.theme.DarkText
import cn.pxyb.mycontrol.ui.theme.ForestSoft
import cn.pxyb.mycontrol.ui.theme.Ink
import cn.pxyb.mycontrol.ui.theme.InkMuted
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
 * 采用 2026 视觉规范【极光微光毛玻璃胶囊 (Aurora Glass Capsule)】：
 * - 20dp 饱满圆角 + 75% 半透明磨砂毛玻璃底座，透出底层极光光斑；
 * - 顶部纳米级高光渐变 + 1dp 发丝级状态微光描边（翠绿 ForestSoft / 珊瑚红 Coral）；
 * - 左侧 32dp 同心光环 3D 拟态微徽标舱，立体透亮；
 * - 右侧微型极光胶囊药丸操作按钮，满足 48×48 dp 无障碍触控热区与按压弹性缩放；
 * - 0 脏灰阴影，状态微辉光环绕；
 * - 挂载伴随细腻的物理触觉震动反馈。
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
    onDismiss: (() -> Unit)? = null,
) {
    val dark = isAppInDarkTheme()
    val haptics = LocalHapticFeedback.current

    val accentColor = when (type) {
        AppFeedbackType.Success -> ForestSoft
        AppFeedbackType.Error -> Coral
        AppFeedbackType.Warning -> Amber
        AppFeedbackType.Info -> BrandBlue
    }

    // 触觉反馈联动（当提示刷新出现时给用户细腻触感）
    LaunchedEffect(message, type) {
        if (type == AppFeedbackType.Error) {
            AppHaptics.heavy(haptics)
        } else {
            AppHaptics.tick(haptics)
        }
    }

    val shape = RoundedCornerShape(20.dp)

    // 半透明磨砂底色（透出底层动态极光）
    val surfaceColor = if (dark) {
        Color(0xFF0F172A).copy(alpha = 0.72f)
    } else {
        Color.White.copy(alpha = 0.85f)
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
    val primaryTextColor = if (dark) DarkText else Ink
    val secondaryTextColor = if (dark) DarkMuted else InkMuted

    // 解析左侧图标
    val defaultIcon = when (type) {
        AppFeedbackType.Success -> Icons.Outlined.CheckCircle
        AppFeedbackType.Error -> Icons.Outlined.ErrorOutline
        AppFeedbackType.Warning -> Icons.Outlined.WarningAmber
        AppFeedbackType.Info -> Icons.Outlined.Info
    }
    val finalIcon = icon ?: defaultIcon

    Box(
        modifier = modifier
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

            // 右侧重试微胶囊按钮
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

            // 可选关闭按钮
            if (onDismiss != null) {
                IconButton(
                    onClick = {
                        AppHaptics.tick(haptics)
                        onDismiss()
                    },
                    modifier = Modifier
                        .size(28.dp)
                        .minimumInteractiveComponentSize(),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "关闭",
                        tint = secondaryTextColor,
                        modifier = Modifier.size(16.dp),
                    )
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
        onDismiss = onDismiss,
    )
}
