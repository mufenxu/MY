package cn.pxyb.mycontrol.ui.components.interaction

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import kotlin.math.abs
import kotlin.math.roundToInt

private val SwipeActionThreshold = 96.dp

/** 滑动超过阈值后松手触发的操作；[danger] 为 true 时到达阈值使用重触感。 */
class AppSwipeAction(
    val icon: ImageVector,
    val label: String,
    val releaseLabel: String,
    val containerColor: Color,
    val contentColor: Color,
    val danger: Boolean = false,
    val onTrigger: () -> Unit,
)

/**
 * 列表项横向滑动操作容器：右滑露出 [startAction]，左滑露出 [endAction]。
 * 到达阈值时给一次触感，松手后触发操作并回弹；未到阈值直接回弹。
 * 滑动只是快捷方式，调用方仍需保留等价的按钮入口供读屏与键盘使用。
 */
@Composable
fun AppSwipeActions(
    itemKey: Any,
    modifier: Modifier = Modifier,
    startAction: AppSwipeAction? = null,
    endAction: AppSwipeAction? = null,
    content: @Composable () -> Unit,
) {
    var offsetX by remember(itemKey) { mutableFloatStateOf(0f) }
    var dragging by remember(itemKey) { mutableStateOf(false) }
    var thresholdNotified by remember(itemKey) { mutableStateOf(false) }
    val thresholdPx = with(LocalDensity.current) { SwipeActionThreshold.toPx() }
    val haptics = LocalHapticFeedback.current
    val currentStart by rememberUpdatedState(startAction)
    val currentEnd by rememberUpdatedState(endAction)
    val animatedOffset by animateFloatAsState(
        targetValue = offsetX,
        animationSpec = if (dragging) snap() else spring(stiffness = Spring.StiffnessMediumLow),
        label = "swipe-action-offset",
    )

    Box(modifier = modifier) {
        val revealed = if (animatedOffset > 0f) startAction else if (animatedOffset < 0f) endAction else null
        if (revealed != null) {
            val reached = abs(offsetX) >= thresholdPx
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(revealed.containerColor, AppCardShape)
                    .padding(horizontal = 22.dp),
                contentAlignment = if (animatedOffset > 0f) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = revealed.icon,
                        contentDescription = null,
                        tint = revealed.contentColor,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = if (reached) revealed.releaseLabel else revealed.label,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = revealed.contentColor,
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .offset { IntOffset(animatedOffset.roundToInt(), 0) }
                .pointerInput(itemKey) {
                    detectHorizontalDragGestures(
                        onDragStart = { dragging = true },
                        onHorizontalDrag = { change, dragAmount ->
                            val min = if (currentEnd != null) Float.NEGATIVE_INFINITY else 0f
                            val max = if (currentStart != null) Float.POSITIVE_INFINITY else 0f
                            val next = (offsetX + dragAmount).coerceIn(min, max)
                            if (next != offsetX) change.consume()
                            offsetX = next
                            val reached = abs(offsetX) >= thresholdPx
                            if (reached && !thresholdNotified) {
                                thresholdNotified = true
                                val action = if (offsetX > 0f) currentStart else currentEnd
                                if (action?.danger == true) AppHaptics.heavy(haptics) else AppHaptics.tick(haptics)
                            } else if (!reached) {
                                thresholdNotified = false
                            }
                        },
                        onDragEnd = {
                            if (abs(offsetX) >= thresholdPx) {
                                (if (offsetX > 0f) currentStart else currentEnd)?.onTrigger?.invoke()
                            }
                            dragging = false
                            offsetX = 0f
                            thresholdNotified = false
                        },
                        onDragCancel = {
                            dragging = false
                            offsetX = 0f
                            thresholdNotified = false
                        },
                    )
                },
        ) {
            content()
        }
    }
}
