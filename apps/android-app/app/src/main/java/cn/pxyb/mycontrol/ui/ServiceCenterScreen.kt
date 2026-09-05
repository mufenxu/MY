package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppActionRow

@Composable
fun ServiceCenterScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onOpenGoogleAccounts: () -> Unit,
    onOpenGitHubProjects: () -> Unit,
    onOpenCt8Automation: () -> Unit,
) {
    AppSubPage(
        title = "服务与开发",
        subtitle = "账号服务、项目与自动化统一归组",
        onBack = onBack,
        contentPadding = contentPadding,
    ) {
        item(key = "service-actions", contentType = "service-actions") {
            AppPanel {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SectionHeader(
                        title = "服务与开发",
                        subtitle = "同类入口集中放置",
                        dotColor = Color(0xFF2563EB),
                    )
                    AppActionRow(
                        title = "Google 邮箱台账",
                        subtitle = "管理主邮箱、别名和 OpenAI 使用状态",
                        icon = Icons.Outlined.Email,
                        iconTint = Color(0xFF7C3AED),
                        onClick = onOpenGoogleAccounts,
                    )
                    AppActionRow(
                        title = "GitHub 项目",
                        subtitle = "管理仓库公开性与发布记录",
                        icon = Icons.Outlined.Code,
                        iconTint = Color(0xFF0284C7),
                        onClick = onOpenGitHubProjects,
                    )
                    AppActionRow(
                        title = "CT8 自动化",
                        subtitle = "GitHub Actions 任务流水线",
                        icon = Icons.Outlined.Hub,
                        iconTint = Color(0xFF0284C7),
                        onClick = onOpenCt8Automation,
                    )
                }
            }
        }
    }
}
