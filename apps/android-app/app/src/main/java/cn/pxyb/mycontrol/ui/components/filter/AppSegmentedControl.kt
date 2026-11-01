package cn.pxyb.mycontrol.ui.components.filter

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.MotionTokens

/** 页内单选采用独立胶囊，宽屏保持紧凑，文字和数量可按可用宽度换行。 */
@Composable
fun <T> AppSegmentedControl(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    count: (T) -> Int? = { null },
) {
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(50)
    val spacing = 8.dp
    Box(modifier = modifier.fillMaxWidth()) {
        BoxWithConstraints(
            modifier = Modifier
                .widthIn(max = 132.dp * options.size.coerceAtLeast(1))
                .fillMaxWidth(),
        ) {
            val itemWidth = (maxWidth - spacing * (options.size - 1).coerceAtLeast(0)) / options.size.coerceAtLeast(1)
            val selectedIndex = options.indexOf(selected)
            val indicatorOffset = animateDpAsState(
                targetValue = (itemWidth + spacing) * selectedIndex.coerceAtLeast(0),
                animationSpec = MotionTokens.navigationTween(),
                label = "segment-indicator",
            )
            // 高亮独立于选项存续，移动时保持实色，避免新旧背景交替淡化造成闪烁。
            if (selectedIndex >= 0) {
                Box(Modifier.matchParentSize()) {
                    Surface(
                        modifier = Modifier
                            .offset { IntOffset(indicatorOffset.value.roundToPx(), 0) }
                            .width(itemWidth)
                            .fillMaxHeight(),
                        shape = shape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {}
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).selectableGroup(),
                horizontalArrangement = Arrangement.spacedBy(spacing),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                options.forEach { option ->
                    key(option) {
                        val active = selected == option
                        val interactionSource = remember { MutableInteractionSource() }
                        val contentColor by animateColorAsState(
                            targetValue = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            animationSpec = MotionTokens.navigationTween(),
                            label = "segment-content",
                        )
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .heightIn(min = 48.dp)
                                .clip(shape)
                                .selectable(
                                    selected = active,
                                    enabled = enabled,
                                    role = Role.Tab,
                                    interactionSource = interactionSource,
                                    indication = null,
                                    onClick = {
                                        if (!active) {
                                            AppHaptics.tick(haptics)
                                            onSelect(option)
                                        }
                                    },
                                )
                                .padding(horizontal = 8.dp, vertical = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(
                                    text = label(option),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = contentColor,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.align(Alignment.CenterVertically),
                                )
                                count(option)?.takeIf { it > 0 }?.let {
                                    Surface(
                                        modifier = Modifier.align(Alignment.CenterVertically),
                                        shape = shape,
                                        color = MaterialTheme.colorScheme.surfaceContainerHigh,
                                    ) {
                                        Text(
                                            text = it.toString(),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = contentColor,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
