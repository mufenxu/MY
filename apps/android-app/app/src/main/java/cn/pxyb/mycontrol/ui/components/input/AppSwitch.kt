package cn.pxyb.mycontrol.ui.components.input

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/**
 * 现代化开关：胶囊轨道 + 圆形拇指 + 选中对勾图标，带按压反馈与弹性动画。
 * 配色跟随主题（默认 primary，可传 tint 覆盖）；关闭态使用半透明轨道，暗色/亮色均适配。
 * 与玻璃卡片规范一致：不添加投影。
 */
@Composable
fun AppSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color? = null,
) {
    val dark = isAppInDarkTheme()
    val haptics = LocalHapticFeedback.current
    val accent = tint ?: MaterialTheme.colorScheme.primary
    val interactive = enabled && onCheckedChange != null
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()

    val trackWidth = 44.dp
    val trackHeight = 26.dp
    val thumbSize = 20.dp
    val thumbTravel = trackWidth - thumbSize - 2.dp

    val thumbOffset by animateDpAsState(
        targetValue = if (checked) thumbTravel else 0.dp,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "appSwitchThumb",
    )
    val thumbScale by animateFloatAsState(
        targetValue = if (pressed) 1.12f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "appSwitchThumbScale",
    )
    val trackColor by animateColorAsState(
        targetValue = when {
            !enabled -> if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)
            checked -> accent
            else -> if (dark) Color.White.copy(alpha = 0.16f) else Color.Black.copy(alpha = 0.10f)
        },
        animationSpec = tween(durationMillis = MotionTokens.DurationShort),
        label = "appSwitchTrack",
    )
    val thumbColor = when {
        checked -> if (enabled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
        else -> if (dark) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.surface
    }
    val thumbBorder = when {
        checked || !enabled -> Color.Transparent
        dark -> Color.White.copy(alpha = 0.35f)
        else -> Color.Black.copy(alpha = 0.12f)
    }
    val iconTint = if (enabled) accent else if (dark) Color.White.copy(alpha = 0.5f) else Color.Black.copy(alpha = 0.3f)

    Box(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .width(trackWidth)
            .height(trackHeight)
            .clip(RoundedCornerShape(50))
            .background(trackColor)
            .then(
                if (interactive) {
                    Modifier.toggleable(
                        value = checked,
                        role = Role.Switch,
                        interactionSource = interactionSource,
                        indication = null,
                    ) { newValue ->
                        AppHaptics.tick(haptics)
                        onCheckedChange?.invoke(newValue)
                    }
                } else {
                    Modifier
                }
            )
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(RoundedCornerShape(50))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.White.copy(alpha = if (dark) 0.10f else 0.26f),
                            Color.Transparent,
                        )
                    )
                )
        )
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = 1.dp + thumbOffset)
                .size(thumbSize)
                .graphicsLayer {
                    scaleX = thumbScale
                    scaleY = thumbScale
                }
                .clip(CircleShape)
                .background(thumbColor)
                .border(1.dp, thumbBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = checked,
                enter = scaleIn(animationSpec = tween(durationMillis = 150), initialScale = 0.4f) +
                    fadeIn(animationSpec = tween(durationMillis = 120)),
                exit = scaleOut(animationSpec = tween(durationMillis = 120), targetScale = 0.4f) +
                    fadeOut(animationSpec = tween(durationMillis = 90)),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Check,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(12.dp),
                )
            }
        }
    }
}
