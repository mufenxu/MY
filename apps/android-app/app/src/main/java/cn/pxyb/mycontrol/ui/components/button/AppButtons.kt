package cn.pxyb.mycontrol.ui.components.button

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.BrandBlue
import cn.pxyb.mycontrol.ui.theme.BrandCyan
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import cn.pxyb.mycontrol.ui.components.feedback.AppCircularProgressIndicator

/** 弹窗主操作按钮：对齐 BrandBlue 官方科技蓝与 48dp 最小高度。 */
// 主操作、次要操作与危险操作共享触控尺寸和胶囊形状。

/** 主操作使用主题强调色；浅色蓝底白字，深色浅蓝底深字，使用实色与轻量按压反馈。 */
@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 48.dp,
    shape: RoundedCornerShape = RoundedCornerShape(50),
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val primary = MaterialTheme.colorScheme.primary
    val contentColor = MaterialTheme.colorScheme.onPrimary
    Button(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .clip(shape)
            .pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 0.dp,
            pressedElevation = 0.dp,
            focusedElevation = 0.dp,
            hoveredElevation = 0.dp,
            disabledElevation = 0.dp,
        ),
        colors = ButtonDefaults.buttonColors(
            containerColor = primary,
            contentColor = contentColor,
            disabledContainerColor = if (loading) primary else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            disabledContentColor = if (loading) contentColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            AppCircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = LocalContentColor.current,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = LocalContentColor.current,
                    )
                }
                Text(
                    text = text,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    letterSpacing = (-0.1).sp,
                    color = LocalContentColor.current,
                )
            }
        }
    }
}

/** 中性磨砂次要操作，与主按钮形成明确权重。 */
@Composable
fun AppSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 48.dp,
    shape: RoundedCornerShape = RoundedCornerShape(50),
    compact: Boolean = false,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    Button(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .clip(shape)
            .pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = if (compact) 12.dp else 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            AppCircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = LocalContentColor.current,
                    )
                }
                Text(
                    text = text,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = if (compact) 13.sp else 14.sp,
                    letterSpacing = (-0.1).sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * 全 App 现代危险警示按钮 (Pure Rose Convex Pill)
 *
 * 使用主题 error / onError 实色，深浅色与禁用状态统一处理。
 */
@Composable
fun AppDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 48.dp,
    shape: RoundedCornerShape = RoundedCornerShape(50),
    compact: Boolean = false,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    Button(
        onClick = {
            AppHaptics.heavy(haptics)
            onClick()
        },
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .clip(shape)
            .pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.error,
            contentColor = MaterialTheme.colorScheme.onError,
            disabledContainerColor = if (loading) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            disabledContentColor = if (loading) MaterialTheme.colorScheme.onError else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        ),
        contentPadding = PaddingValues(horizontal = if (compact) 12.dp else 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            AppCircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = LocalContentColor.current,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = LocalContentColor.current,
                    )
                }
                Text(
                    text = text,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = if (compact) 13.sp else 14.sp,
                    letterSpacing = (-0.1).sp,
                    color = LocalContentColor.current,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * 全 App 现代行内轻量危险微胶囊按钮 (Compact Soft Danger Pill)
 *
 * 专用于列表项、卡片行内右侧的次要危险操作（如“撤销”、“移除”、“解绑”），
 * 采用柔和微透危险红底色 + 浅红微切边 + 全圆角胶囊，警示清晰、体量克制、不遮挡同行信息。
 */
@Composable
fun AppInlineDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val bgColor = if (enabled || loading) ColorTokens.Red.container else MaterialTheme.colorScheme.surfaceContainerHigh
    val contentColor = if (enabled || loading) ColorTokens.Red.foreground else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    val borderColor = if (enabled || loading) ColorTokens.Red.border else MaterialTheme.colorScheme.outlineVariant

    Surface(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier.pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(50),
        color = bgColor,
        contentColor = contentColor,
        border = BorderStroke(0.6.dp, borderColor),
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (loading) {
                AppCircularProgressIndicator(
                    modifier = Modifier.size(12.dp),
                    strokeWidth = 1.5.dp,
                    color = contentColor,
                )
            } else {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(13.dp),
                        tint = contentColor,
                    )
                }
                Text(
                    text = text,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.5.sp,
                    ),
                    color = contentColor,
                )
            }
        }
    }
}
