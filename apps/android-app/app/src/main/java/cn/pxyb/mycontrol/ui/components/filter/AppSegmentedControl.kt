package cn.pxyb.mycontrol.ui.components.filter

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
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
    Box(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .widthIn(max = 132.dp * options.size.coerceAtLeast(1))
                .fillMaxWidth()
                .selectableGroup(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            options.forEach { option ->
                key(option) {
                    val active = selected == option
                    val interactionSource = remember { MutableInteractionSource() }
                    val containerColor by animateColorAsState(
                        targetValue = if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                        animationSpec = MotionTokens.tabTween(),
                        label = "segment-container",
                    )
                    val contentColor by animateColorAsState(
                        targetValue = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        animationSpec = MotionTokens.tabTween(),
                        label = "segment-content",
                    )
                    Surface(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .pressFeedback(interactionSource)
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
                            ),
                        shape = shape,
                        color = containerColor,
                    ) {
                        FlowRow(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 12.dp),
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
                                    color = if (active) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.surfaceContainerHigh,
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
