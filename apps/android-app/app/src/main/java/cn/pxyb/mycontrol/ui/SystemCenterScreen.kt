package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppActionRow

@Composable
fun SystemCenterScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenOperations: () -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
) {
    AppSubPage(
        title = "系统中心",
        subtitle = "状态、通知与维护统一归组",
        onBack = onBack,
        contentPadding = contentPadding,
    ) {
        item(key = "system-actions", contentType = "system-actions") {
            AppPanel {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SectionHeader(
                        title = "系统服务",
                        subtitle = "同类入口集中放置",
                        dotColor = Color(0xFF2563EB),
                    )
                    AppActionRow(
                        title = "通知中心",
                        subtitle = "系统提醒与待处理问题",
                        icon = Icons.Outlined.Notifications,
                        iconTint = Color(0xFFE11D48),
                        onClick = onOpenNotifications,
                    )
                    AppActionRow(
                        title = "系统状态",
                        subtitle = "微服务健康与资源概览",
                        icon = Icons.Outlined.Settings,
                        iconTint = Color(0xFF64748B),
                        onClick = onOpenOperations,
                    )
                    AppActionRow(
                        title = "一键巡检",
                        subtitle = "快速检查平台健康状态",
                        icon = Icons.Outlined.Speed,
                        iconTint = Color(0xFFD97706),
                        onClick = onRunDiagnostics,
                    )
                    AppActionRow(
                        title = "数据备份",
                        subtitle = "立即执行平台备份",
                        icon = Icons.Outlined.Backup,
                        iconTint = Color(0xFF0D9488),
                        onClick = onTriggerBackup,
                    )
                }
            }
        }
    }
}
