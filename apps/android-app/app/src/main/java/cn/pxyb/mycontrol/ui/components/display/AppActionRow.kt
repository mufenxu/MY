package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.AppPanel
import cn.pxyb.mycontrol.ui.AppSwitch
import cn.pxyb.mycontrol.ui.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics

/**
 * 现代列表操作/设置单元格行
 *
 * 遵循 48dp 最小交互触控热区与微按压反馈规范：
 * - 支持左侧图标或自定义 Leading 插槽；
 * - 标题与副标题自动换行自适应，防止大字号截断；
 * - 支持右侧插槽（默认展示精致的向右小箭头）；
 * - 结合 AppHaptics.tick 提供物理触觉微反馈。
 */
@Composable
fun AppActionRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    iconTint: Color = MaterialTheme.colorScheme.primary,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
    trailingContent: (@Composable () -> Unit)? = {
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowForwardIos,
            contentDescription = null,
            modifier = Modifier.size(13.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
        )
    },
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val rowModifier = if (onClick != null && enabled) {
        modifier
            .fillMaxWidth()
            .minimumInteractiveComponentSize()
            .pressFeedback(interactionSource, pressedScale = 0.98f)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) {
                AppHaptics.tick(haptics)
                onClick()
            }
            .padding(horizontal = 14.dp, vertical = 12.dp)
    } else {
        modifier
            .fillMaxWidth()
            .minimumInteractiveComponentSize()
            .padding(horizontal = 14.dp, vertical = 12.dp)
    }

    Row(
        modifier = rowModifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (enabled) iconTint else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                modifier = Modifier.size(20.dp),
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontWeight = FontWeight.Medium,
                    fontSize = 15.sp,
                ),
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (trailingContent != null) {
            trailingContent()
        }
    }
}

/**
 * 偏好设置/功能开关行
 */
@Composable
fun AppSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    AppActionRow(
        title = title,
        subtitle = subtitle,
        icon = icon,
        enabled = enabled,
        onClick = if (enabled) { { onCheckedChange(!checked) } } else null,
        modifier = modifier,
        trailingContent = {
            AppSwitch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled,
            )
        },
    )
}

/**
 * 统一毛玻璃发丝分割线
 */
@Composable
fun AppDivider(
    modifier: Modifier = Modifier,
    paddingStart: androidx.compose.ui.unit.Dp = 14.dp,
    paddingEnd: androidx.compose.ui.unit.Dp = 14.dp,
) {
    val dark = isAppInDarkTheme()
    HorizontalDivider(
        modifier = modifier.padding(start = paddingStart, end = paddingEnd),
        thickness = 0.6.dp,
        color = if (dark) Color.White.copy(alpha = 0.08f) else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
    )
}

/**
 * 现代分组卡片容器
 */
@Composable
fun AppGroupedCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            content = content,
        )
    }
}
