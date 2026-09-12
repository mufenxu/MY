package cn.pxyb.mycontrol.ui.feature.campus.water

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics

@Composable
internal fun WaterValveRingDialButton(
    running: Boolean,
    busy: Boolean,
    defaultValue: String?,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val transition = rememberInfiniteTransition(label = "ringDialTransition")
    val sweepAngle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "ringSweepAngle",
    )
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ringPulseAlpha",
    )

    val dialInteractionSource = remember { MutableInteractionSource() }

    val runningGradient = Brush.linearGradient(
        colors = listOf(Color(0xFF2563EB), Color(0xFF4F46E5)),
    )

    Box(
        modifier = modifier
            .size(108.dp)
            .pressFeedback(dialInteractionSource, pressedScale = 0.94f)
            .clickable(
                enabled = !busy,
                indication = null,
                interactionSource = dialInteractionSource,
            ) {
                AppHaptics.tick(haptics)
                onToggle(!running)
            },
        contentAlignment = Alignment.Center,
    ) {
        // 出水状态下的外圈动态旋转跑马灯光环（方案二原型 ringGlow）
        if (running) {
            Canvas(modifier = Modifier.size(108.dp)) {
                val strokeWidth = 2.dp.toPx()
                val sweepBrush = Brush.sweepGradient(
                    colors = listOf(
                        Color(0xFF38BDF8),
                        Color(0xFF818CF8),
                        Color(0xFF38BDF8).copy(alpha = 0.15f),
                        Color(0xFF38BDF8),
                    ),
                )
                rotate(sweepAngle) {
                    drawCircle(
                        brush = sweepBrush,
                        style = Stroke(
                            width = strokeWidth,
                            pathEffect = PathEffect.dashPathEffect(
                                floatArrayOf(16f, 12f),
                                0f,
                            ),
                        ),
                    )
                }
            }
        }

        // 大圆盘按钮实体主体（方案二原型 circleBtn 结构）
        Box(
            modifier = Modifier
                .size(100.dp)
                .shadow(
                    elevation = if (running) 8.dp else 2.dp,
                    shape = CircleShape,
                    spotColor = if (running) Color(0xFF2563EB).copy(alpha = 0.5f) else Color.Black.copy(alpha = 0.08f),
                )
                .then(
                    if (running) {
                        Modifier
                            .background(runningGradient, CircleShape)
                            .border(2.dp, Color(0xFF67E8F9).copy(alpha = pulseAlpha), CircleShape)
                    } else {
                        Modifier
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f), CircleShape)
                            .border(2.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.75f), CircleShape)
                    }
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(26.dp),
                    strokeWidth = 2.5.dp,
                    color = if (running) Color.White else MaterialTheme.colorScheme.primary,
                )
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    // 1. 顶部图标
                    Icon(
                        imageVector = if (running) Icons.Outlined.Stop else Icons.Outlined.WaterDrop,
                        contentDescription = if (running) "点击停水" else "轻触出水",
                        tint = if (running) Color.White else MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(26.dp),
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    // 2. 中间主标题（方案二同款：轻触出水 / 点击停水）
                    Text(
                        text = if (running) "点击停水" else "轻触出水",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                        ),
                        color = if (running) Color.White else MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    // 3. 底部副标题（方案二同款：500 mL / 出水中...）
                    Text(
                        text = if (running) "出水中..." else (defaultValue?.ifBlank { "500 mL" } ?: "500 mL"),
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Medium,
                            fontSize = 10.sp,
                        ),
                        color = if (running) Color(0xFFA5F3FC) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                    )
                }
            }
        }
    }
}
