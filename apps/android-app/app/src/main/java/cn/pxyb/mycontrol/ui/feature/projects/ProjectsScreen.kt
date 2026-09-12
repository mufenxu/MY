package cn.pxyb.mycontrol.ui.feature.projects

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoMode
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppMetricCell
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.blocksAction
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.util.DateTimeUtils.formatPlatformTime

@Composable
fun ProjectsScreen(
    state: ProjectsUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenGitHubProjects: () -> Unit,
    onOpenAndroidReleases: () -> Unit,
    onOpenRegistryImages: () -> Unit,
    onTriggerCt8: () -> Unit,
) {
    var confirmCt8 by remember { mutableStateOf(false) }
    AppSubPage(
        title = "项目与发布",
        subtitle = "仓库、应用发布与自动化任务",
        contentPadding = contentPadding,
        onBack = onBack,
        pinHeader = true,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
    ) {
        item(key = "project-tools") {
            AppPanel {
                AppActionRow("GitHub 项目", subtitle = "仓库公开性与 Release 管理", icon = Icons.Outlined.Code, onClick = onOpenGitHubProjects)
                AppDivider()
                AppActionRow("Android 发布管理", subtitle = "构建新版本、发布配置与历史安装包", icon = Icons.Outlined.SystemUpdate, onClick = onOpenAndroidReleases)
                AppDivider()
                AppActionRow("容器镜像管理", subtitle = "查看并清理阿里云 ACR 历史镜像", icon = Icons.Outlined.Inventory2, onClick = onOpenRegistryImages)
            }
        }
        item(key = "ct8-title") { AppSectionHeader(title = "CT8 任务", subtitle = "GitHub Actions 执行状态与节点结果") }
        state.sectionError?.let { message ->
            item(key = "ct8-error") { AppFeedbackBanner(message, error = true, onRetry = onRefresh) }
        }
        item(key = "ct8") {
            if (state.refreshing && state.ct8 == null) {
                GlassShimmerList(itemCount = 1, itemHeight = 160.dp)
            } else {
                ModernCt8Panel(
                    ct8 = state.ct8,
                    canOperate = state.user?.role in setOf("operator", "super_admin"),
                    busy = "ct8" in state.busyActions,
                    enabled = !state.busyActions.blocksAction("ct8"),
                    onTrigger = { confirmCt8 = true },
                )
            }
        }
    }
    if (confirmCt8) {
        AppConfirmDialog(
            title = "运行 CT8 任务？",
            detail = "任务将提交到 GitHub Actions，平台会持续记录执行状态。",
            confirmLabel = "确认运行",
            icon = Icons.Outlined.AutoMode,
            onDismiss = { confirmCt8 = false },
            onConfirm = { confirmCt8 = false; onTriggerCt8() },
        )
    }
}

@Composable
private fun ModernCt8Panel(
    ct8: Ct8Data?,
    canOperate: Boolean,
    busy: Boolean,
    enabled: Boolean,
    onTrigger: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppIconTile(Icons.Outlined.AutoMode, ColorTokens.Sky.foreground, ColorTokens.Sky.container)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "流水线 ${ct8?.latestRunId?.let { "#${it.takeLast(8)}" } ?: "--"}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        formatPlatformTime(ct8?.lastRunAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppStatusBadge(ct8?.activeStatus?.takeIf { it != "idle" } ?: ct8?.latestStatus ?: "unknown")
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppMetricCell("目标主机", ct8?.totalHosts?.toString() ?: "--", Modifier.weight(1f))
                AppMetricCell("成功节点", ct8?.successHosts?.toString() ?: "--", Modifier.weight(1f), ColorTokens.Green.foreground)
                AppMetricCell("异常节点", ct8?.failedHosts?.toString() ?: "--", Modifier.weight(1f), ColorTokens.Amber.foreground)
            }

            AppButton(
                text = "运行 CT8 任务",
                icon = Icons.Outlined.PlayArrow,
                onClick = onTrigger,
                enabled = canOperate && enabled && ct8?.activeStatus !in setOf("running", "queued", "in_progress"),
                loading = busy,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
