package cn.pxyb.mycontrol.ui.feature.envreference

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.clipboard.rememberAppClipboard
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.feedback.LocalAppFeedback
import cn.pxyb.mycontrol.ui.components.filter.AppFilterBar
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.input.AppSearchBar
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage

private const val ALL_GROUPS_LABEL = "全部分组"

/**
 * 环境变量对照表：把 `.env` 里每个参数翻译成中文名和用途，便于运维时查阅。
 *
 * 纯本地静态内容，不请求服务器，也不显示任何真实取值。
 */
@Composable
fun EnvReferenceScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var groupId by rememberSaveable { mutableStateOf<String?>(null) }
    var kind by rememberSaveable { mutableStateOf(EnvKindFilter.All) }
    val clipboard = rememberAppClipboard()
    val feedback = LocalAppFeedback.current

    val groupOptions = remember { listOf<EnvGroup?>(null) + envReferenceGroups }
    val selectedGroup = groupOptions.firstOrNull { it?.id == groupId }
    val visibleGroups = remember(query, groupId, kind) {
        filterEnvGroups(envReferenceGroups, query, groupId, kind)
    }
    val kindCounts = remember(query, groupId) {
        EnvKindFilter.entries.associateWith { option ->
            filterEnvGroups(envReferenceGroups, query, groupId, option).sumOf { it.variables.size }
        }
    }
    val copyKey: (EnvVariable) -> Unit = { variable ->
        clipboard.copy(variable.key, label = "环境变量名")
        feedback.show("已复制 ${variable.key}", false)
    }

    AppSubPage(
        title = "环境变量对照表",
        subtitle = "服务器 .env 文件里每个参数的中文含义与用途",
        contentPadding = contentPadding,
        onBack = onBack,
    ) {
        item(key = "intro", contentType = "banner") {
            AppFeedbackBanner(
                message = "这里只解释参数含义，不会读取或显示服务器上的真实取值。点击条目可复制变量名。",
                type = AppFeedbackType.Info,
                icon = Icons.Outlined.Info,
                showCloseButton = false,
            )
        }
        item(key = "search", contentType = "search") {
            AppSearchBar(
                query = query,
                onQueryChange = { query = it.take(60) },
                placeholder = "搜索变量名、中文名或用途",
            )
        }
        item(key = "groups", contentType = "filter") {
            AppFilterBar(
                items = groupOptions,
                selectedItem = selectedGroup,
                onItemSelected = { groupId = it?.id },
                labelProvider = { it?.title ?: ALL_GROUPS_LABEL },
                contentPadding = PaddingValues(0.dp),
            )
        }
        item(key = "kinds", contentType = "filter") {
            AppSegmentedControl(
                options = EnvKindFilter.entries,
                selected = kind,
                onSelect = { kind = it },
                label = { it.label },
                count = { kindCounts[it] },
            )
        }

        if (visibleGroups.isEmpty()) {
            item(key = "empty", contentType = "empty") {
                AppEmptyState(
                    title = "没有匹配的参数",
                    detail = "换一个关键字，或清除筛选条件后再试。",
                    actionText = "清除筛选",
                    onAction = {
                        query = ""
                        groupId = null
                        kind = EnvKindFilter.All
                    },
                )
            }
        }
        visibleGroups.forEach { group ->
            item(key = "group:${group.id}", contentType = "section") {
                AppSectionHeader(
                    title = group.title,
                    subtitle = group.summary,
                    tag = group.variables.size.toString(),
                )
            }
            items(
                items = group.variables,
                key = { "variable:${it.key}" },
                contentType = { "variable" },
            ) { variable ->
                EnvVariableCard(variable = variable, onCopy = { copyKey(variable) })
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EnvVariableCard(
    variable: EnvVariable,
    onCopy: () -> Unit,
) {
    AppPanel(
        modifier = Modifier.semantics {
            onClick(label = "复制变量名") { onCopy(); true }
        },
        onClick = onCopy,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    variable.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    variable.key,
                    style = MaterialTheme.typography.labelMedium.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                variable.purpose,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AppStatusBadge(
                    label = variable.fill.label,
                    semantic = when (variable.fill) {
                        EnvFill.Required -> AppStatusSemantic.Warning
                        EnvFill.Keep -> AppStatusSemantic.Success
                        EnvFill.Optional -> AppStatusSemantic.Neutral
                    },
                )
                if (variable.sensitive) {
                    AppStatusBadge(label = "敏感 · 勿外传", semantic = AppStatusSemantic.Error)
                }
            }
            variable.example?.let { example ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        "模板默认值",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        example,
                        style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
