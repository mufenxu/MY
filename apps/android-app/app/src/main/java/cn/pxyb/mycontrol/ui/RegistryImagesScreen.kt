package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AcrImageCatalog
import cn.pxyb.mycontrol.data.AcrImageGroup
import cn.pxyb.mycontrol.data.AcrImageMutation
import cn.pxyb.mycontrol.data.AcrImageTag
import cn.pxyb.mycontrol.ui.components.display.AppListCard
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppErrorState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val acrTimeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

internal fun formatAcrTimestamp(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    return runCatching {
        OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault()).format(acrTimeFormatter)
    }.getOrNull()
}

internal fun protectedReasonLabel(reason: String): String = when (reason) {
    "production" -> "生产标签"
    "configured" -> "当前部署"
    "internal" -> "构建缓存"
    else -> "受保护"
}

@Composable
internal fun RegistryImagesScreen(
    state: RegistryImagesUiState,
    canManage: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onLoad: () -> Unit,
    onRefresh: () -> Unit,
    onToggle: (String) -> Unit,
    onTogglePrefix: (String, Boolean) -> Unit,
    onClearSelection: () -> Unit,
    onDeleteSelected: () -> Unit,
    onKeepCountChange: (Int) -> Unit,
    onIncludeUnknownChange: (Boolean) -> Unit,
    onPrunePreview: () -> Unit,
    onPruneConfirm: () -> Unit,
    onPruneDismiss: () -> Unit,
    onDismissFeedback: () -> Unit,
) {
    LaunchedEffect(Unit) {
        onLoad()
    }

    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    var confirmDelete by remember { mutableStateOf(false) }
    val catalog = state.catalog
    val deletable = canManage && catalog?.canDelete == true

    AppSubPage(
        title = "镜像仓库",
        subtitle = "清理阿里云 ACR 历史版本",
        onBack = onBack,
        contentPadding = contentPadding,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
    ) {
        if (state.loading || (catalog == null && state.error == null)) {
            item(key = "registry-loading", contentType = "loading") {
                LoadingBlock("正在读取镜像版本…")
            }
            return@AppSubPage
        }

        state.message?.let { message ->
            item(key = "registry-message", contentType = "banner") {
                AppFeedbackBanner(message = message, onDismiss = onDismissFeedback)
            }
        }
        state.error?.let { error ->
            item(key = "registry-error", contentType = "banner") {
                AppFeedbackBanner(message = error, error = true, onDismiss = onDismissFeedback)
            }
        }

        if (catalog == null) {
            item(key = "registry-failed", contentType = "error") {
                AppErrorState(message = state.error ?: "镜像版本读取失败。", onRetry = onRefresh)
            }
            return@AppSubPage
        }

        item(key = "registry-summary", contentType = "card") {
            RegistrySummaryPanel(catalog = catalog, canManage = canManage)
        }

        if (!canManage) {
            item(key = "registry-readonly-role", contentType = "hint") {
                RegistryHintPanel("当前账号没有镜像管理权限，只有超级管理员可以删除。")
            }
        } else if (!catalog.canDelete) {
            item(key = "registry-readonly-credentials", contentType = "hint") {
                RegistryHintPanel("服务器还没有配置 ACR 访问凭证，目前只能查看镜像版本，删除操作不可用。")
            }
        }

        if (deletable && catalog.candidateCount > 0) {
            item(key = "registry-prune", contentType = "card") {
                RegistryPrunePanel(
                    keepCount = state.keepCount,
                    includeUnknown = state.includeUnknown,
                    busy = state.pruning,
                    planned = state.plan?.planned ?: 0,
                    timelineAvailable = catalog.timelineAvailable,
                    unknownTags = catalog.unknownTimelineTags,
                    onKeepCountChange = onKeepCountChange,
                    onIncludeUnknownChange = onIncludeUnknownChange,
                    onPreview = onPrunePreview,
                )
            }
        }

        if (state.selected.isNotEmpty()) {
            item(key = "registry-selection", contentType = "card") {
                RegistrySelectionPanel(
                    count = state.selected.size,
                    busy = state.deleting,
                    enabled = deletable,
                    maxBatch = catalog.maxBatch,
                    onClear = onClearSelection,
                    onDelete = { confirmDelete = true },
                )
            }
        }

        if (catalog.groups.isEmpty()) {
            item(key = "registry-empty", contentType = "empty") {
                AppEmptyState(
                    title = "没有需要清理的历史版本",
                    detail = "当前仓库里只有生产标签和受保护标签。",
                    icon = Icons.Outlined.Restore,
                )
            }
        } else {
            item(key = "registry-candidates-title", contentType = "section") {
                SectionHeader("历史候选版本", "按构建顺序排列，默认只展开较小的分组")
            }
            catalog.groups.forEach { group ->
                item(key = "registry-group-${group.prefix}", contentType = "group") {
                    RegistryGroupHeader(
                        group = group,
                        expanded = expanded[group.prefix] ?: (group.tags.size <= 8),
                        deletable = deletable,
                        selected = group.tags.count { it.tag in state.selected },
                        onToggleExpanded = { expanded[group.prefix] = !(expanded[group.prefix] ?: (group.tags.size <= 8)) },
                        onToggleSelection = { selectAll ->
                            onTogglePrefix(group.prefix, selectAll)
                        },
                    )
                }
                if (expanded[group.prefix] ?: (group.tags.size <= 8)) {
                    items(group.tags, key = { item -> "registry-tag-${item.tag}" }, contentType = { "tag" }) { item ->
                        RegistryTagRow(
                            item = item,
                            checked = item.tag in state.selected,
                            enabled = deletable,
                            onToggle = { onToggle(item.tag) },
                        )
                    }
                }
            }
        }

        if (catalog.protectedTags.isNotEmpty()) {
            item(key = "registry-protected-title", contentType = "section") {
                SectionHeader("受保护标签", "这些标签不会出现在删除范围里")
            }
            item(key = "registry-protected", contentType = "card") {
                RegistryProtectedPanel(catalog = catalog)
            }
        }
    }

    if (confirmDelete) {
        AppConfirmDialog(
            title = "删除选中的镜像版本？",
            detail = "将删除 ${state.selected.size} 个历史版本。删除后镜像无法直接恢复，需要重新构建；ACR 的存储空间为异步回收。",
            confirmLabel = "确认删除",
            dismissLabel = "取消",
            danger = true,
            busy = state.deleting,
            icon = Icons.Outlined.Delete,
            onDismiss = { confirmDelete = false },
            onConfirm = {
                confirmDelete = false
                onDeleteSelected()
            },
        )
    }

    state.plan?.let { plan ->
        AppConfirmDialog(
            title = "执行清理计划？",
            detail = pruneDetail(plan, state.keepCount),
            confirmLabel = "执行清理",
            dismissLabel = "取消",
            danger = true,
            busy = state.pruning,
            icon = Icons.Outlined.Delete,
            onDismiss = onPruneDismiss,
            onConfirm = onPruneConfirm,
        )
    }
}

private fun pruneDetail(plan: AcrImageMutation, keepCount: Int): String {
    val preview = plan.plan.take(6).map { it.tag }.joinToString("\n")
    val more = if (plan.planned > 6) "\n… 以及其余 ${plan.planned - 6} 个" else ""
    val remaining = if (plan.remaining > 0) "\n本次先处理 ${plan.plan.size} 个，剩余 ${plan.remaining} 个可再次执行。" else ""
    return "保留每组最新 $keepCount 个版本，本次删除 ${plan.plan.size} 个：\n$preview$more$remaining"
}

@Composable
private fun RegistrySummaryPanel(catalog: AcrImageCatalog, canManage: Boolean) {
    AppPanel {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(
                    Icons.Outlined.Inventory2,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text("阿里云 ACR 个人版", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        catalog.repository,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                AppStatusBadge(
                    label = if (catalog.canDelete && canManage) "可管理" else "只读",
                    semantic = if (catalog.canDelete && canManage) AppStatusSemantic.Success else AppStatusSemantic.Neutral,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RegistryMetric("版本总数", catalog.tagCount.toString(), Modifier.weight(1f))
                RegistryMetric("可清理候选", catalog.candidateCount.toString(), Modifier.weight(1f))
                RegistryMetric("受保护", catalog.protectedTags.size.toString(), Modifier.weight(1f))
            }
            val fetched = formatAcrTimestamp(catalog.fetchedAt)
            if (fetched != null) {
                Text(
                    "读取时间 $fetched · 单次最多删除 ${catalog.maxBatch} 个",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun RegistryMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RegistryHintPanel(message: String) {
    AppPanel {
        Text(
            message,
            modifier = Modifier.padding(14.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun RegistryPrunePanel(
    keepCount: Int,
    includeUnknown: Boolean,
    busy: Boolean,
    planned: Int,
    timelineAvailable: Boolean,
    unknownTags: Int,
    onKeepCountChange: (Int) -> Unit,
    onIncludeUnknownChange: (Boolean) -> Unit,
    onPreview: () -> Unit,
) {
    AppPanel {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionHeader("批量清理", "每个镜像只保留最新若干个候选版本")
            AppTextField(
                value = keepCount.toString(),
                onValueChange = { raw -> raw.filter(Char::isDigit).take(2).toIntOrNull()?.let(onKeepCountChange) },
                label = "保留最新",
                placeholder = "5",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                clearable = false,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("包含时间未知的版本", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        if (timelineAvailable) {
                            "未知时间的候选有 $unknownTags 个"
                        } else {
                            "服务器未配置 GitHub 令牌，暂时无法判断构建时间"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppSwitch(checked = includeUnknown, onCheckedChange = onIncludeUnknownChange)
            }
            AppSecondaryButton(
                text = if (planned > 0) "重新生成清理计划" else "预览清理计划",
                onClick = onPreview,
                loading = busy,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun RegistrySelectionPanel(
    count: Int,
    busy: Boolean,
    enabled: Boolean,
    maxBatch: Int,
    onClear: () -> Unit,
    onDelete: () -> Unit,
) {
    AppPanel {
        val overflow = count > maxBatch
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "已选 $count 个",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                AppSecondaryButton(text = "清空", onClick = onClear, enabled = !busy, compact = true)
                AppInlineDangerButton(
                    text = "删除",
                    onClick = onDelete,
                    icon = Icons.Outlined.Delete,
                    enabled = enabled && !busy && !overflow,
                    loading = busy,
                )
            }
            if (overflow) {
                Text(
                    "单次最多删除 $maxBatch 个版本，请分批选择。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun RegistryGroupHeader(
    group: AcrImageGroup,
    expanded: Boolean,
    deletable: Boolean,
    selected: Int,
    onToggleExpanded: () -> Unit,
    onToggleSelection: (Boolean) -> Unit,
) {
    AppListCard(
        title = group.prefix,
        subtitle = "${group.tags.size} 个候选版本" + if (selected > 0) " · 已选 $selected" else "",
        onClick = onToggleExpanded,
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (deletable && expanded) {
                    Checkbox(
                        checked = selected == group.tags.size && group.tags.isNotEmpty(),
                        onCheckedChange = { checked -> onToggleSelection(checked) },
                    )
                }
                Icon(
                    if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}

@Composable
private fun RegistryTagRow(
    item: AcrImageTag,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    AppListCard(
        title = item.tag,
        subtitle = formatAcrTimestamp(item.createdAt)?.let { "构建于 $it" } ?: "构建时间未知",
        leading = {
            Checkbox(checked = checked, onCheckedChange = { onToggle() }, enabled = enabled)
        },
        onClick = if (enabled) onToggle else null,
        trailing = {
            Text(
                item.revision ?: "-",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
    )
}

@Composable
private fun RegistryProtectedPanel(catalog: AcrImageCatalog) {
    AppPanel {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            catalog.protectedTags.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        item.tag,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        protectedReasonLabel(item.reason),
                        style = MaterialTheme.typography.labelSmall,
                        color = ColorTokens.Amber.foreground,
                    )
                }
            }
        }
    }
}
