package cn.pxyb.mycontrol.ui.components.interaction

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import cn.pxyb.mycontrol.ui.theme.MotionTokens

/** 统一按压反馈：按下轻微缩放，松开时用柔和弹性恢复。 */
@Composable
fun Modifier.pressFeedback(
    interactionSource: MutableInteractionSource,
    pressedScale: Float = 0.97f,
): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale = animateFloatAsState(
        targetValue = if (pressed) pressedScale.coerceIn(0.97f, 1f) else 1f,
        animationSpec = if (pressed) MotionTokens.pressTween() else MotionTokens.releaseSpring(),
        label = "press-scale",
    )
    return this.graphicsLayer {
        val currentScale = scale.value
        scaleX = currentScale
        scaleY = currentScale
    }
}
