package cn.pxyb.mycontrol.ui.components.interaction

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.MotionTokens

/** 统一按压反馈：轻微下压与缩放共用进度，松开平滑恢复。 */
@Composable
fun Modifier.pressFeedback(
    interactionSource: MutableInteractionSource,
    pressedScale: Float = MotionTokens.PressedScale,
): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val minimumScale = pressedScale.coerceIn(MotionTokens.PressedScale, 1f)
    val pressOffset = with(LocalDensity.current) { 1.dp.toPx() }
    val progress = animateFloatAsState(
        targetValue = if (pressed) 1f else 0f,
        animationSpec = if (pressed) MotionTokens.pressTween() else MotionTokens.releaseTween(),
        label = "press-progress",
    )
    return this.graphicsLayer {
        val currentProgress = progress.value
        val currentScale = 1f - (1f - minimumScale) * currentProgress
        scaleX = currentScale
        scaleY = currentScale
        translationY = pressOffset * currentProgress
    }
}
