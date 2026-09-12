package cn.pxyb.mycontrol.ui.feature.workspace

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun AttentionCard(label: String, value: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    AppPanel(onClick = onClick, modifier = modifier) {
        Column(Modifier.padding(13.dp)) {
            Text(
                value.toString(),
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                ),
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun ResourceExpiryCard(resource: ResourceExpiry, days: Int) {
    AppPanel {
        Row(Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AppIconTile(Icons.Outlined.Event, if (days <= 7) ColorTokens.Red.foreground else ColorTokens.Amber.foreground, if (days <= 7) ColorTokens.Red.container else ColorTokens.Amber.container)
            Column(Modifier.weight(1f)) {
                Text(resource.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(if (resource.type == "domain") "域名" else "服务器", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                when {
                    days < 0 -> "已过期 ${-days} 天"
                    days == 0 -> "今天到期"
                    else -> "$days 天后"
                },
                color = if (days <= 7) MaterialTheme.colorScheme.error else ColorTokens.Amber.foreground,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}
