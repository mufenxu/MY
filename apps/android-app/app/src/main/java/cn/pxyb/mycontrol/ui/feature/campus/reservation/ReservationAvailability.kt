package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.components.feedback.AppCircularProgressIndicator
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.layout.AppInsetPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

/** 预约模块内的中性提示：浅底分区里一枚小图标加一段说明。 */
@Composable
internal fun ReservationHint(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Outlined.Info,
) {
    AppInsetPanel(modifier = modifier) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun ScrollableRuleText(text: String) {
    AppInsetPanel {
        Box(
            modifier = Modifier
                .heightIn(max = 200.dp)
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AvailableSpacesByTimeBlock(
    queryText: String?,
    availableSpaces: List<CampusReservationSpace>,
    selectedSpaceId: Int,
    loading: Boolean,
    onSelectSpace: (CampusReservationSpace) -> Unit,
) {
    if (loading) {
        AppInsetPanel {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                AppCircularProgressIndicator(modifier = Modifier.size(16.dp))
                Text(
                    text = "正在查询该时段空闲学习间...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        return
    }
    if (queryText == null) return
    val found = availableSpaces.isNotEmpty()
    AppInsetPanel {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    if (found) Icons.Outlined.CheckCircle else Icons.Outlined.Info,
                    contentDescription = null,
                    tint = if (found) ColorTokens.Green.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = if (found) "在该时段找到 ${availableSpaces.size} 间空闲学习间" else "该时段暂无空闲学习间",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (found) ColorTokens.Green.foreground else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                if (found) {
                    Text(
                        text = "点击可直接选中",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (found) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth().selectableGroup(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    availableSpaces.forEach { space ->
                        AppFilterChip(
                            label = space.name,
                            selected = space.id == selectedSpaceId,
                            onClick = { onSelectSpace(space) },
                        )
                    }
                }
            } else {
                Text(
                    text = "在选定日期与时段（$queryText）暂无可预约研讨间/学习间，建议调整时段或选择其他日期。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
