package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppActionRow

@Composable
fun DeviceCenterScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onOpenDevices: () -> Unit,
    onOpenScenes: () -> Unit,
) {
    AppSubPage(
        title = "设备与自动化",
        subtitle = "设备、场景与自动化统一归组",
        onBack = onBack,
        contentPadding = contentPadding,
    ) {
        item(key = "device-actions", contentType = "device-actions") {
            AppPanel {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SectionHeader(
                        title = "设备与自动化",
                        subtitle = "同类入口集中放置",
                        dotColor = Color(0xFF2563EB),
                    )
                    AppActionRow(
                        title = "设备与开关",
                        subtitle = "IoT 实时状态与手动控制",
                        icon = Icons.Outlined.Hub,
                        iconTint = Color(0xFF0284C7),
                        onClick = onOpenDevices,
                    )
                    AppActionRow(
                        title = "智能场景",
                        subtitle = "手动场景与条件自动化",
                        icon = Icons.Outlined.Tune,
                        iconTint = Color(0xFF7C3AED),
                        onClick = onOpenScenes,
                    )
                }
            }
        }
    }
}
