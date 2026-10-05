package cn.pxyb.mycontrol.ui.feature.campus.water

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.feedback.AppCircularProgressIndicator
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
internal fun WaterValveRingDialButton(
    running: Boolean,
    busy: Boolean,
    defaultValue: String?,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val pressDepth = animateFloatAsState(
        targetValue = if (pressed) 1f else 0f,
        animationSpec = if (pressed) MotionTokens.pressTween() else MotionTokens.releaseSpring(),
        label = "water-press-depth",
    )
    val fill = animateFloatAsState(
        targetValue = if (running) 1f else 0f,
        animationSpec = MotionTokens.pageTween(),
        label = "water-fill",
    )
    val phase = remember { Animatable(0f) }
    // 关闭时取消循环但保留相位，退水过程中不会突然跳回初始波形。
    LaunchedEffect(running) {
        if (running) {
            phase.snapTo(phase.value % (2f * PI.toFloat()))
            phase.animateTo(
                targetValue = phase.value + 2f * PI.toFloat(),
                animationSpec = infiniteRepeatable(
                    animation = tween(MotionTokens.DurationStatusRotation, easing = LinearEasing),
                ),
            )
        }
    }
    val waterColor = MaterialTheme.colorScheme.primary
    val contentColor = lerp(waterColor, MaterialTheme.colorScheme.onPrimary, fill.value)
    val wavePath = remember { Path() }
    val shadeColor = MaterialTheme.colorScheme.scrim

    Box(
        modifier = modifier
            .size(width = 108.dp, height = 124.dp)
            .drawBehind {
                val center = Offset(size.width / 2f, size.height - 5.dp.toPx())
                val radius = 35.dp.toPx()
                scale(scaleX = 1f, scaleY = 0.16f, pivot = center) {
                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(shadeColor.copy(alpha = 0.18f), shadeColor.copy(alpha = 0f)),
                            center = center,
                            radius = radius,
                        ),
                        radius = radius,
                        center = center,
                    )
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(108.dp)
                .graphicsLayer {
                    val floatOffset = (1f - cos(phase.value)) * 1.5f * fill.value
                    translationY = -(7f + floatOffset) * (1f - pressDepth.value) * density
                }
                .pressFeedback(interactionSource)
                .shadow(2.dp, CircleShape)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer)
                .semantics(mergeDescendants = true) {
                    contentDescription = when {
                        busy -> "正在处理饮水机操作"
                        running -> "饮水机出水中，关闭出水"
                        else -> "饮水机待命中，开启出水"
                    }
                }
                .clickable(
                    role = Role.Button,
                    enabled = !busy,
                    indication = null,
                    interactionSource = interactionSource,
                ) {
                    AppHaptics.tick(haptics)
                    onToggle(!running)
                },
            contentAlignment = Alignment.Center,
        ) {
            Canvas(modifier = Modifier.matchParentSize()) {
                val level = size.height * (1.08f - 0.95f * fill.value)
                val amplitude = size.height * 0.025f * fill.value
                val angle = phase.value
                // 两层相向水纹仅表示开启状态，不代表剩余水量或出水进度。
                for (layer in 0..1) {
                    wavePath.reset()
                    for (step in 0..54) {
                        val x = size.width * step / 54f
                        val offset = if (layer == 0) -size.height * 0.045f * fill.value else 0f
                        val waveAngle = x / size.width * 2f * PI.toFloat() +
                            if (layer == 0) -angle + PI.toFloat() / 2f else angle
                        val y = level + offset + amplitude * sin(waveAngle)
                        if (step == 0) wavePath.moveTo(x, y) else wavePath.lineTo(x, y)
                    }
                    wavePath.lineTo(size.width, size.height)
                    wavePath.lineTo(0f, size.height)
                    wavePath.close()
                    drawPath(wavePath, waterColor, alpha = if (layer == 0) 0.28f else 1f)
                }
                // 暗部沿右下球缘加深，保留纯净水色，不覆盖白色高光雾层。
                drawCircle(
                    brush = Brush.radialGradient(
                        0f to shadeColor.copy(alpha = 0f),
                        0.55f to shadeColor.copy(alpha = 0f),
                        1f to shadeColor.copy(alpha = 0.24f),
                        center = Offset(size.width * 0.3f, size.height * 0.25f),
                        radius = size.width * 0.85f,
                    ),
                )
            }
            if (busy) {
                AppCircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    strokeWidth = 2.5.dp,
                    color = contentColor,
                )
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.WaterDrop,
                        contentDescription = null,
                        tint = contentColor,
                        modifier = Modifier.size(30.dp),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (running) "关闭出水" else "开启出水",
                        style = MaterialTheme.typography.labelMedium,
                        color = contentColor,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (running) "轻触停止" else (defaultValue?.ifBlank { "500 mL" } ?: "500 mL"),
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.78f),
                    )
                }
            }
        }
    }
}
