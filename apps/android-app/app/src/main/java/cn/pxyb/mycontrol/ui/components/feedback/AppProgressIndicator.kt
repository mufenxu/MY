package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.MotionTokens

@Composable
fun AppLinearProgressIndicator(
  modifier: Modifier = Modifier,
  progress: (() -> Float)? = null,
  height: Dp = 8.dp,
  color: Color = MaterialTheme.colorScheme.primary,
  animateProgress: Boolean = true,
) {
  // 底轨完整铺在胶囊内，避免原生轨道间隙和末尾终点标记影响视觉。
  val trackModifier = modifier
    .height(height)
    .clip(RoundedCornerShape(50))
    .background(MaterialTheme.colorScheme.surfaceContainerHigh)

  if (progress == null) {
    LinearProgressIndicator(
      modifier = trackModifier,
      color = color,
      trackColor = Color.Transparent,
      strokeCap = StrokeCap.Round,
      gapSize = 0.dp,
    )
  } else {
    val targetProgress = progress().coerceIn(0f, 1f)
    val displayedProgress = if (animateProgress) {
      animateFloatAsState(
        targetValue = targetProgress,
        animationSpec = MotionTokens.standardTween(),
        label = "AppLinearProgress",
      ).value
    } else {
      targetProgress
    }
    LinearProgressIndicator(
      progress = { displayedProgress },
      modifier = trackModifier,
      color = color,
      trackColor = Color.Transparent,
      strokeCap = StrokeCap.Round,
      gapSize = 0.dp,
      drawStopIndicator = {},
    )
  }
}

@Composable
fun AppCircularProgressIndicator(
  modifier: Modifier = Modifier,
  color: Color = MaterialTheme.colorScheme.primary,
  strokeWidth: Dp = 2.dp,
) {
  CircularProgressIndicator(
    modifier = modifier,
    color = color,
    strokeWidth = strokeWidth,
    strokeCap = StrokeCap.Round,
  )
}
