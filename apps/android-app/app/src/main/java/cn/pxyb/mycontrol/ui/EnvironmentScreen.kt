package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.EnvironmentVariable
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale

@Composable
fun EnvironmentScreen(
    state: EnvironmentUiState,
    contentPadding: PaddingValues,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(enabled = true, onBack = onBack)
    val listState = rememberLazyListState()
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                AppSecondaryHeader(
                    title = "环境变量",
                    subtitle = "只读诊断，敏感值始终隐藏",
                    onBack = onBack,
                )
            }
            state.sectionError?.let { item { FeedbackBanner("环境诊断暂不可用：$it", error = true) } }
            item {
                val summary = state.summary
                AppPanel {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            IconTile(
                                Icons.Outlined.Settings,
                                if (summary.state == "healthy") Forest else Amber,
                                if (summary.state == "healthy") MintPale else AmberPale,
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    when {
                                        !summary.available -> "环境诊断暂不可用"
                                        summary.state == "healthy" -> "环境配置正常"
                                        summary.state == "restart_required" -> "${summary.restartRequired} 项配置等待服务重启"
                                        else -> "${summary.missing + summary.invalid + summary.verificationFailed} 项配置需要处理"
                                    },
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    "共 ${summary.total} 项，正常 ${summary.healthy} 项，未启用/未使用 ${summary.inactive + summary.unused} 项",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            StatusBadge(
                                when {
                                    !summary.available -> "unknown"
                                    summary.state == "healthy" -> "healthy"
                                    else -> "warning"
                                },
                            )
                        }
                        Text(
                            "此处不显示配置值。请在统一服务控制台完成修改、审批和发布。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (state.attentionVariables.isEmpty()) {
                item {
                    AppPanel {
                        EmptyBlock("当前没有需要处理的配置", "正常配置不会在 Android 端展示明细")
                    }
                }
            } else {
                item { SectionHeader("需要关注", "仅列出缺失、无效、验证失败或等待重启的变量") }
                items(state.attentionVariables, key = { it.key }) { variable ->
                    EnvironmentVariableRow(variable)
                }
            }
        }
    }
}

@Composable
private fun EnvironmentVariableRow(variable: EnvironmentVariable) {
    val problem = variable.status in setOf("missing", "invalid") || variable.verificationStatus == "failed"
    AppPanel {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconTile(
                    if (variable.sensitive) Icons.Outlined.Lock else Icons.Outlined.Settings,
                    if (problem) Coral else Amber,
                    if (problem) CoralPale else AmberPale,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(variable.key, style = MaterialTheme.typography.titleMedium)
                    Text(variable.description.ifBlank { "未提供用途说明" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                StatusBadge(
                    when {
                        problem -> "error"
                        variable.runtimeStatus == "restart_required" -> "warning"
                        else -> variable.status
                    },
                )
            }
            Text(
                listOf(
                    "服务：${variable.services.joinToString("、").ifBlank { "未观察到" }}",
                    "配置：${if (variable.configured) "已配置（值已隐藏）" else "未配置"}",
                    "生效：${runtimeLabel(variable.runtimeStatus)}",
                ).joinToString("\n"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(variable.detail.ifBlank { "暂无进一步诊断说明" }, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun runtimeLabel(status: String): String = when (status) {
    "loaded" -> "已加载"
    "restart_required" -> "等待服务重启"
    "not_applicable" -> "不适用"
    else -> "暂未观察到"
}
