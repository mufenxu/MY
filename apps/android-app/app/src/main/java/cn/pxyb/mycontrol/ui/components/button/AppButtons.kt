package cn.pxyb.mycontrol.ui.components.button

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
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

/** 弹窗主操作按钮：对齐 BrandBlue 官方科技蓝与 46dp 标准高度。 */
// ---------------- 全 App 现代统一按钮体系 (方案 A：极光流光玻璃胶囊) ----------------

// ---------------- 全 App 现代统一按钮体系 (方案 A：极光立体胶囊·纯净不泛白) ----------------

/**
 * 全 App 现代主行动按钮 (Pure Royal Convex Pill)
 *
 * 1. 纯净深邃科技蓝：顶部 #2563EB -> 中部 #1D4ED8 -> 底部 #1E40AF 实体收口，无任何泛白白雾蒙层；
 * 2. 真实物理立体悬浮：3.dp 纯正深蓝软光晕微阴影，让胶囊从画布自然“浮凸而起”；
 * 3. 同色发丝微描边：顶部天蓝微反光 (#60A5FA 0.35f) 替代刺眼白光，边缘清晰锐利；
 * 4. 触感与状态：全圆角胶囊 RoundedCornerShape(50) + pressFeedback 物理微缩放 + AppHaptics.tick 细腻触觉。
 */
@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 46.dp,
    shape: RoundedCornerShape = RoundedCornerShape(50),
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    // 1. 清澈鲜活科技蓝立体微弧渐变（提亮纯度，消除深沉暗色，绝不泛白）
    val gradientBrush = if (enabled || loading) {
        Brush.verticalGradient(
            listOf(
                BrandCyan, // BrandCyan 鲜活明朗科技蓝（顶部）
                BrandBlue, // BrandBlue 经典品牌科技蓝（底部）
            ),
        )
    } else {
        Brush.verticalGradient(
            listOf(
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            ),
        )
    }

    // 2. 清澈同色系柔光发丝切边
    val borderBrush = Brush.verticalGradient(
        listOf(
            ColorTokens.BlueDark.foreground.copy(alpha = 0.40f), // 浅天蓝微光边
            BrandBlue.copy(alpha = 0.25f),
        ),
    )

    Button(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .shadow(
                elevation = if (enabled && !loading) 2.5.dp else 0.dp,
                shape = shape,
                spotColor = BrandCyan.copy(alpha = 0.35f),
                ambientColor = Color.Black.copy(alpha = 0.08f),
            )
            .clip(shape)
            .background(gradientBrush)
            .border(1.dp, borderBrush, shape)
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
            containerColor = Color.Transparent,
            contentColor = Color.White,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = if (loading) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
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
                    fontSize = 14.5.sp,
                    letterSpacing = (-0.1).sp,
                    color = LocalContentColor.current,
                )
            }
        }
    }
}

/**
 * 全 App 现代次要行动按钮 (Pure Frosted Pill)
 *
 * 采用微凸磨砂底色 + 微弱深浅发丝切边 + 50% 胶囊全圆角，通透微立体，绝不发灰泛白。
 */
@Composable
fun AppSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 46.dp,
    shape: RoundedCornerShape = RoundedCornerShape(50),
    compact: Boolean = false,
) {
    val dark = isAppInDarkTheme()
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val gradientBrush = Brush.verticalGradient(
        listOf(MaterialTheme.colorScheme.surfaceContainerHigh, MaterialTheme.colorScheme.surfaceContainerLow),
    )

    val borderBrush = Brush.verticalGradient(
        listOf(
            if (dark) Color.White.copy(alpha = 0.18f) else Color.Black.copy(alpha = 0.10f),
            if (dark) Color.White.copy(alpha = 0.06f) else Color.Black.copy(alpha = 0.05f),
        ),
    )

    Button(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .shadow(
                elevation = if (enabled && !loading) 1.5.dp else 0.dp,
                shape = shape,
                spotColor = Color.Black.copy(alpha = if (dark) 0.25f else 0.06f),
                ambientColor = Color.Black.copy(alpha = 0.08f),
            )
            .clip(shape)
            .background(gradientBrush)
            .border(1.dp, borderBrush, shape)
            .pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = if (compact) 12.dp else 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
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
                    fontSize = if (compact) 13.sp else 14.5.sp,
                    letterSpacing = (-0.1).sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * 全 App 现代危险警示按钮 (Pure Rose Convex Pill)
 *
 * 纯正珊瑚红立体微凸渐变 + 悬浮深红微光晕，无泛白起雾，质感明确纯正。
 */
@Composable
fun AppDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 46.dp,
    shape: RoundedCornerShape = RoundedCornerShape(50),
    compact: Boolean = false,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val gradientBrush = Brush.verticalGradient(
        if (enabled || loading) listOf(
            Color(0xFFEF4444), // 纯正警告红（顶部）
            Color(0xFFDC2626), // 饱满深红（中部）
            ColorTokens.RedLight.foreground, // 底部阴影收边暗红
        ) else listOf(
            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
        ),
    )

    val borderBrush = Brush.verticalGradient(
        listOf(
            Color(0xFFF87171).copy(alpha = 0.35f),
            Color(0xFF991B1B).copy(alpha = 0.30f),
        ),
    )

    Button(
        onClick = {
            AppHaptics.heavy(haptics)
            onClick()
        },
        modifier = modifier
            .minimumInteractiveComponentSize()
            .heightIn(min = height)
            .shadow(
                elevation = if (enabled && !loading) 3.dp else 0.dp,
                shape = shape,
                spotColor = Color(0xFFDC2626).copy(alpha = 0.35f),
                ambientColor = Color.Black.copy(alpha = 0.15f),
            )
            .clip(shape)
            .background(gradientBrush)
            .border(1.dp, borderBrush, shape)
            .pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color.White,
            disabledContainerColor = Color.Transparent,
            disabledContentColor = if (loading) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        ),
        contentPadding = PaddingValues(horizontal = if (compact) 12.dp else 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
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
                    fontSize = if (compact) 13.sp else 14.5.sp,
                    letterSpacing = (-0.1).sp,
                    color = LocalContentColor.current,
                    maxLines = 1,
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
                CircularProgressIndicator(
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
